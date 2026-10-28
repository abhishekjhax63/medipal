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

const REQUEST_TIMEOUT_MS = 60_000;
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
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((part) => typeof part?.text === "string" ? part.text : "").join("\n").trim();
  return typeof payload?.reply === "string" ? payload.reply.trim() : "";
}

export async function requestChat(rawMessages) {
  if (!aiConfigured) throw new HttpError(503, "AI analysis is not configured on this server. Set GEMINI_API_KEY, or AI_BASE_URL + AI_API_KEY + AI_MODEL for another OpenAI-compatible provider.", "AI_NOT_CONFIGURED");
  const messages = await normaliseMessages(rawMessages);
  let response;
  try {
    response = await fetch(`${config.ai.baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.ai.apiKey}` }, body: JSON.stringify({ model: config.ai.model, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages], temperature: 0.25, max_tokens: 1_000 }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (cause) {
    throw new HttpError(502, cause?.name === "TimeoutError" ? "The AI provider did not respond in time." : "The AI provider could not be reached.", "AI_PROVIDER_UNAVAILABLE");
  }
  if (!response.ok) throw new HttpError(502, `The AI provider responded with status ${response.status}.`, "AI_PROVIDER_ERROR");
  const reply = extractReply(await response.json());
  if (!reply) throw new HttpError(502, "The AI provider returned an empty response.", "AI_EMPTY_RESPONSE");
  return { reply, model: config.ai.model };
}
