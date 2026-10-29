/**
 * MEDIPAL AI Doctor proxy.
 *
 * Provider keys stay server-side. Image bytes are forwarded only with the
 * active chat request. Video is never claimed to be watched directly: when the
 * configured model supports images and the host has FFmpeg, a small, bounded
 * set of temporary frames is analysed and then securely removed.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { config, readiness } from "./env.mjs";
import { HttpError } from "./http.mjs";

export const aiConfigured = readiness.ai;

/**
 * A deliberately small public feature manifest. It keeps the browser from
 * accepting attachments that the deployment cannot process, without exposing
 * a provider URL, model name, credential, or any operational secret.
 */
export const aiCapabilities = Object.freeze({
  text: aiConfigured,
  images: aiConfigured && config.ai.supportsImages,
  videoFrames: aiConfigured && config.ai.supportsImages && config.ai.supportsVideoFrames,
});

const REQUEST_TIMEOUT_MS = 120_000;
/**
 * Transient upstream statuses. The gateway MEDIPAL talks to answers a burst of
 * questions with `429` and reports an exhausted worker with `502/503`, so the
 * attempt must be repeated instead of surfaced — but the total wait is bounded
 * by `REQUEST_TIMEOUT_MS` and by the provider's own `Retry-After`.
 */
const MAX_PROVIDER_ATTEMPTS = 3;
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_BACKOFF_MS = [1_500, 5_000];
const MAX_RETRY_WAIT_MS = 15_000;
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 90;
const MAX_VIDEO_FRAMES = 8;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const SYSTEM_PROMPT = [
  "You are MEDIPAL AI, a careful healthcare-information assistant used in a public web app.",
  "Respond in the user's language: Hindi/Hinglish when they use Hindi/Hinglish, otherwise English.",
  "Give general health information, not a diagnosis, prescription, or personalised dose.",
  "For an image or frames from a video, say only what is actually visible. Never invent unreadable text, values, medicine names, or a diagnosis.",
  "If image text is blurry, cropped, or missing a reference range/context, say so and ask for a clearer complete image.",
  "For relevant complex questions, structure the response as: a simple explanation; what you can observe; what it may mean; practical next steps; warning signs; important limitations. Keep simple questions concise.",
  "If the user describes possible emergency symptoms including chest pain, breathing difficulty, sudden weakness/numbness, severe bleeding, or sudden severe headache, advise immediate emergency care (112 in India) before any other detail.",
  "Do not recommend stopping prescribed medication. Encourage a qualified clinician for personal, ongoing, or urgent concerns.",
  "When the user supplies video-frame images, state that the observations are based on selected frames and may miss events between them.",
].join("\n");

function asObject(value) {
  return value && typeof value === "object" ? value : null;
}

function parseDataUrl(value) {
  if (typeof value !== "string") throw new HttpError(400, "An attachment is missing its file data.", "INVALID_ATTACHMENT");
  const matched = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!matched) throw new HttpError(400, "Attachment data must be a base64 data URL.", "INVALID_ATTACHMENT");
  const buffer = Buffer.from(matched[2], "base64");
  if (buffer.length === 0) throw new HttpError(400, "The uploaded attachment is empty.", "INVALID_ATTACHMENT");
  return { dataUrl: value, mimeType: matched[1].toLowerCase(), buffer };
}

function looksLikeImage(buffer, mimeType) {
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function looksLikeVideo(buffer, mimeType) {
  if (mimeType === "video/webm") return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return buffer.subarray(4, 8).toString("ascii") === "ftyp";
}

function safeFileName(value, fallback) {
  const name = basename(typeof value === "string" ? value : fallback).replace(/[^a-zA-Z0-9._-]/g, "_");
  return name.slice(0, 100) || fallback;
}

function extensionFor(mimeType) {
  return { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" }[mimeType] || ".bin";
}

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(signal ? `${command} timed out.` : `${command} exited with ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

async function extractFrames(attachment) {
  if (!config.ai.supportsImages || !config.ai.supportsVideoFrames) {
    throw new HttpError(503, "Video analysis is not enabled for the configured AI provider.", "VIDEO_NOT_CONFIGURED");
  }
  const directory = await mkdtemp(join(tmpdir(), "medipal-ai-"));
  const sourcePath = join(directory, `${randomUUID()}${extensionFor(attachment.mimeType)}`);
  const outputPattern = join(directory, "frame-%02d.jpg");
  try {
    await writeFile(sourcePath, attachment.buffer, { mode: 0o600 });
    let durationText;
    try {
      ({ stdout: durationText } = await run(config.ai.ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", sourcePath], 8_000));
    } catch (error) {
      throw new HttpError(503, "Video analysis requires FFmpeg and FFprobe on the MEDIPAL server.", "VIDEO_PROCESSOR_UNAVAILABLE");
    }
    const duration = Number.parseFloat(durationText);
    if (!Number.isFinite(duration) || duration <= 0) throw new HttpError(400, "The video duration could not be verified.", "INVALID_VIDEO");
    if (duration > MAX_VIDEO_SECONDS) throw new HttpError(413, `Videos must be ${MAX_VIDEO_SECONDS} seconds or shorter.`, "VIDEO_TOO_LONG");
    try {
      await run(config.ai.ffmpegPath, ["-v", "error", "-i", sourcePath, "-vf", "fps=1/12,scale='min(1024,iw)':-2", "-frames:v", String(MAX_VIDEO_FRAMES), "-q:v", "3", outputPattern], 35_000);
    } catch {
      throw new HttpError(422, "MEDIPAL could not extract frames from this video. Try a standard MP4, WEBM, or MOV file.", "VIDEO_PROCESSING_FAILED");
    }
    const frames = [];
    for (let index = 1; index <= MAX_VIDEO_FRAMES; index += 1) {
      const path = join(directory, `frame-${String(index).padStart(2, "0")}.jpg`);
      try { frames.push(`data:image/jpeg;base64,${(await readFile(path)).toString("base64")}`); } catch { /* fewer frames is valid */ }
    }
    if (!frames.length) throw new HttpError(422, "No usable frames could be extracted from this video.", "VIDEO_PROCESSING_FAILED");
    return { frames, duration };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function normaliseAttachments(rawAttachments) {
  if (rawAttachments === undefined || rawAttachments === null) return { images: [], videoNotes: [] };
  if (!Array.isArray(rawAttachments)) throw new HttpError(400, "Attachments must be a list.", "INVALID_ATTACHMENT");
  if (rawAttachments.length > MAX_IMAGES + 1) throw new HttpError(400, "Too many attachments in one message.", "INVALID_ATTACHMENT");
  const images = [];
  const videoNotes = [];
  let videoCount = 0;
  let totalBytes = 0;
  for (const raw of rawAttachments) {
    const attachment = asObject(raw);
    if (!attachment) throw new HttpError(400, "Invalid attachment.", "INVALID_ATTACHMENT");
    const kind = attachment.kind;
    const parsed = parseDataUrl(attachment.dataUrl);
    if (attachment.mimeType !== parsed.mimeType) throw new HttpError(400, "Attachment type does not match its file data.", "INVALID_ATTACHMENT");
    const declaredSize = Number(attachment.sizeBytes);
    if (!Number.isSafeInteger(declaredSize) || declaredSize !== parsed.buffer.length) throw new HttpError(400, "Attachment size verification failed.", "INVALID_ATTACHMENT");
    totalBytes += parsed.buffer.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new HttpError(413, "Attachments together must be 20 MB or smaller.", "ATTACHMENTS_TOO_LARGE");
    if (kind === "image") {
      if (!IMAGE_TYPES.has(parsed.mimeType) || parsed.buffer.length > MAX_IMAGE_BYTES || !looksLikeImage(parsed.buffer, parsed.mimeType)) throw new HttpError(400, "Images must be valid JPG, PNG, or WEBP files under 5 MB.", "INVALID_IMAGE");
      images.push(parsed.dataUrl);
      if (images.length > MAX_IMAGES) throw new HttpError(400, `Attach up to ${MAX_IMAGES} images at once.`, "TOO_MANY_IMAGES");
    } else if (kind === "video") {
      if (!VIDEO_TYPES.has(parsed.mimeType) || parsed.buffer.length > MAX_VIDEO_BYTES || !looksLikeVideo(parsed.buffer, parsed.mimeType)) throw new HttpError(400, "Videos must be valid MP4, WEBM, or MOV files under 20 MB.", "INVALID_VIDEO");
      videoCount += 1;
      if (videoCount > 1) throw new HttpError(400, "Attach one video per message.", "TOO_MANY_VIDEOS");
      const extracted = await extractFrames({ ...parsed, name: safeFileName(attachment.name, "video") });
      images.push(...extracted.frames);
      videoNotes.push(`The user attached ${safeFileName(attachment.name, "video")}; analysis is based on ${extracted.frames.length} selected frames from a ${Math.ceil(extracted.duration)}-second video, not every moment of the video.`);
    } else {
      throw new HttpError(400, "Unsupported attachment type.", "INVALID_ATTACHMENT");
    }
  }
  if (images.length && !config.ai.supportsImages) throw new HttpError(503, "Image and video analysis are not enabled for the configured AI model.", "VISION_NOT_CONFIGURED");
  return { images, videoNotes };
}

async function normaliseMessages(input) {
  if (!Array.isArray(input)) throw new HttpError(400, "Messages must be a list.", "VALIDATION");
  const messages = [];
  for (const entry of input.slice(-20)) {
    const message = asObject(entry);
    if (!message || !["user", "assistant"].includes(message.role)) continue;
    const content = typeof message.content === "string" ? message.content.trim().slice(0, 8_000) : "";
    const attachments = message.role === "user" ? await normaliseAttachments(message.attachments) : { images: [], videoNotes: [] };
    if (!content && !attachments.images.length) continue;
    if (attachments.images.length) {
      const parts = [{ type: "text", text: [content || "Please explain what is visible in these attachments.", ...attachments.videoNotes].join("\n\n") }, ...attachments.images.map((url) => ({ type: "image_url", image_url: { url } }))];
      messages.push({ role: message.role, content: parts });
    } else {
      messages.push({ role: message.role, content });
    }
  }
  if (!messages.length) throw new HttpError(400, "Enter a question or attach a supported file.", "VALIDATION");
  return messages;
}

function extractReply(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  const reasoning = message?.reasoning_content;

  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) return content.map((part) => typeof part?.text === "string" ? part.text : "").join("\n").trim();
  
  // Fallback to reasoning if content is empty (common for some reasoning models)
  if (typeof reasoning === "string" && reasoning.trim()) return reasoning.trim();
  
  return typeof payload?.reply === "string" ? payload.reply.trim() : "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A provider that asks for a specific wait means it, so its `Retry-After` is
 * preferred over MEDIPAL's own backoff — retrying a rate limit too soon is what
 * turns a short burst limit into a hard failure.
 */
function retryAfterMs(header) {
  const seconds = Number.parseInt(header || "", 10);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1_000, MAX_RETRY_WAIT_MS) : null;
}

/** Honest, non-technical wording for a provider rejection, split by cause. */
function providerRejectionMessage(status) {
  if (status === 400 || status === 413 || status === 422) {
    return "MEDIPAL AI could not process this request. Try rephrasing the question or starting a new conversation.";
  }
  if (status === 401 || status === 403) {
    return "MEDIPAL AI is not authorised on this server. Please contact the MEDIPAL administrator.";
  }
  if (status === 404) {
    return "The AI model configured on this server is not available. Please contact the MEDIPAL administrator.";
  }
  return "MEDIPAL AI could not answer right now. Please try again in a moment.";
}

/**
 * Opens the streaming completion request, retrying only while nothing has been
 * read from the body yet — a retry after a partial stream would repeat text the
 * user has already seen. Every attempt shares one deadline, so the whole
 * request can never outlive `REQUEST_TIMEOUT_MS`.
 */
async function openCompletionStream(payload, deadlineAt) {
  let lastStatus = 0;
  let lastNetworkError = null;

  for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) break;
    const isLastAttempt = attempt === MAX_PROVIDER_ATTEMPTS;
    const backoff = RETRY_BACKOFF_MS[attempt - 1] ?? MAX_RETRY_WAIT_MS;

    try {
      const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.ai.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(remaining),
      });

      if (!TRANSIENT_STATUSES.has(response.status)) return response;

      lastStatus = response.status;
      const wait = retryAfterMs(response.headers.get("retry-after")) ?? backoff;
      // Release the socket before waiting; the body of a rejected request is
      // never useful and an unread one holds the connection open.
      try { await response.body?.cancel?.(); } catch { /* nothing to release */ }
      if (isLastAttempt || Date.now() + wait >= deadlineAt) break;
      console.warn(`[medipal] AI provider returned ${lastStatus}. Retrying in ${wait}ms (attempt ${attempt}/${MAX_PROVIDER_ATTEMPTS})...`);
      await sleep(wait);
    } catch (cause) {
      lastNetworkError = cause;
      // A provider that timed out on our own deadline has no time left to retry.
      if (cause?.name === "TimeoutError" || isLastAttempt || Date.now() + backoff >= deadlineAt) break;
      console.warn(`[medipal] AI provider network error: ${cause?.message}. Retrying in ${backoff}ms...`);
      await sleep(backoff);
    }
  }

  if (lastStatus) {
    console.error(`[medipal] AI provider remained unavailable with status ${lastStatus} after ${MAX_PROVIDER_ATTEMPTS} attempts.`);
    if (lastStatus === 429) {
      throw new HttpError(429, "MEDIPAL AI is handling too many questions right now. Please wait about a minute and ask again.", "AI_BUSY");
    }
    throw new HttpError(503, "MEDIPAL AI is temporarily unavailable. Please try again in a moment.", "AI_PROVIDER_UNAVAILABLE");
  }

  console.error(`[medipal] AI provider failure: ${lastNetworkError?.message}`);
  throw new HttpError(
    502,
    lastNetworkError?.name === "TimeoutError"
      ? "The AI provider did not respond in time. A shorter question is more likely to finish."
      : "The AI provider could not be reached. Please check the connection and try again.",
    "AI_PROVIDER_UNAVAILABLE",
  );
}

export async function requestChat(rawMessages, onChunk) {
  if (!aiConfigured) throw new HttpError(503, "AI analysis is not configured on this server. Set GEMINI_API_KEY, or AI_BASE_URL + AI_API_KEY + AI_MODEL for another OpenAI-compatible provider.", "AI_NOT_CONFIGURED");
  const messages = await normaliseMessages(rawMessages);

  const response = await openCompletionStream({
    model: config.ai.model,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    temperature: 0.25,
    max_tokens: 1_600,
    stream: true,
  }, Date.now() + REQUEST_TIMEOUT_MS);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error(`[medipal] AI provider error ${response.status}: ${errorBody.slice(0, 200)}`);
    throw new HttpError(502, providerRejectionMessage(response.status), "AI_PROVIDER_ERROR");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let buffer = "";
  let fullReply = "";
  let sawStreamFrame = false;
  let truncated = false;
  let contentFiltered = false;
  let providerError = null;

  const handleLine = (line) => {
    const trimmed = line.trim();
    // `:` frames are SSE comments — the server's own progress heartbeat.
    if (!trimmed || trimmed.startsWith(":")) return;
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;

    let json;
    try { json = JSON.parse(data); } catch { return; }
    sawStreamFrame = true;

    // Some providers report a mid-stream failure as a normal event.
    if (json.error) {
      providerError = typeof json.error === "string" ? json.error : json.error?.message || "provider error";
      return;
    }

    const choice = json.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason === "length") truncated = true;
    if (choice.finish_reason === "content_filter") contentFiltered = true;

    const delta = choice.delta || choice.message || {};
    /**
     * Reasoning output is deliberately kept out of the reply. It is a
     * scratchpad, not an answer, and a model that exhausts its budget while
     * still reasoning must be reported as truncated — never rendered as
     * clinical advice.
     */
    const content = typeof delta.content === "string" ? delta.content : "";
    if (content) {
      fullReply += content;
      onChunk({ reply: fullReply, done: false });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const decoded = decoder.decode(value, { stream: true });
    raw += decoded;
    buffer += decoded;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) handleLine(line);
  }
  if (buffer) handleLine(buffer);

  /**
   * A gateway that ignores `stream: true` answers with one JSON document rather
   * than SSE frames. Reading it here keeps that case a real answer instead of a
   * misleading "empty response" error.
   */
  if (!sawStreamFrame && !fullReply.trim() && raw.trim()) {
    try { fullReply = extractReply(JSON.parse(raw)); } catch { /* not a JSON payload either */ }
  }

  if (!fullReply.trim()) {
    if (providerError) {
      console.error(`[medipal] AI provider stream error: ${String(providerError).slice(0, 200)}`);
      throw new HttpError(502, "MEDIPAL AI could not answer this question right now. Please try again.", "AI_PROVIDER_ERROR");
    }
    if (contentFiltered) {
      throw new HttpError(422, "MEDIPAL AI could not answer this question. Please rephrase it.", "AI_CONTENT_FILTERED");
    }
    throw new HttpError(502, "MEDIPAL AI returned an empty answer. Please try again.", "AI_EMPTY_RESPONSE");
  }

  if (truncated) {
    fullReply += "\n\n_This answer was cut off at the length limit. Ask a follow-up to continue it._";
  }

  onChunk({ reply: fullReply, done: true, model: config.ai.model });
}
