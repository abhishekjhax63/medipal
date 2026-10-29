import type {
  AIStatus,
  ChatAttachment,
  ChatMessage,
  ChatResult,
  ChatRole,
} from "@/types/aiDoctor";

const REQUEST_TIMEOUT_MS = 125_000;

/** Public, secret-free server feature flags for the attachment controls. */
export type AIMediaCapabilities = {
  text: boolean;
  images: boolean;
  videoFrames: boolean;
};

function readEndpoint(): string {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return (env.VITE_MEDIPAL_AI_ENDPOINT || "/api/ai/chat").trim();
}

export function createMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createChatMessage(
  role: ChatRole,
  content: string,
  attachments: ChatAttachment[] = [],
): ChatMessage {
  return { id: createMessageId(), role, content, createdAt: Date.now(), attachments };
}

export function getAIStatus(): AIStatus {
  const endpointConfigured = readEndpoint().length > 0;
  return { mode: endpointConfigured ? "available" : "not_configured", endpointConfigured };
}

/**
 * Checks the active deployment rather than guessing from build-time values.
 * The response deliberately contains only booleans; it does not expose a
 * provider, model, API key, or operational detail.
 */
export async function getAIMediaCapabilities(signal?: AbortSignal): Promise<AIMediaCapabilities> {
  const endpoint = readEndpoint();
  if (!endpoint) return { text: false, images: false, videoFrames: false };
  const capabilitiesEndpoint = endpoint.replace(/\/chat(?:\?.*)?$/, "/capabilities");
  let response: Response;
  try {
    response = await fetch(capabilitiesEndpoint, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("MEDIPAL could not check whether attachment analysis is available.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload)) {
    throw new Error("MEDIPAL could not check whether attachment analysis is available.");
  }
  return {
    text: payload.text === true,
    images: payload.images === true,
    videoFrames: payload.videoFrames === true,
  };
}

function withTimeout(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onAbort, { once: true });
  }
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    cleanup: () => {
      window.clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Calls the MEDIPAL server only. Unlike the prior preview implementation, a
 * failed provider call is an error, never a locally generated medical answer.
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  onUpdate: (result: ChatResult) => void,
  signal?: AbortSignal,
): Promise<void> {
  const endpoint = readEndpoint();
  if (!endpoint) throw new Error("AI analysis has not been configured for this deployment.");

  const { controller, cleanup } = withTimeout(signal, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        messages: messages.slice(-20).map(({ role, content, attachments }, index, recent) => ({
          role,
          content,
          attachments: index === recent.length - 1 ? attachments?.map((attachment) => ({
            name: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            kind: attachment.kind,
            dataUrl: attachment.dataUrl,
            durationSeconds: attachment.durationSeconds,
          })) : undefined,
        })),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const detail =
        isRecord(payload) && typeof payload.error === "string" ? payload.error : "AI analysis failed.";
      throw new Error(detail);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error("Failed to read the response stream.");

    /**
     * One assistant message carries the whole streamed answer. Reusing it keeps
     * the message id stable, so React updates the text in place instead of
     * remounting the bubble — and replaying its entry animation — per token.
     */
    let reply: ChatMessage | null = null;
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        // `:` frames are SSE comments — MEDIPAL's own progress heartbeat.
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const raw = trimmed.slice(5).trim();
        try {
          const data: unknown = JSON.parse(raw);
          if (!isRecord(data)) continue;
          if (typeof data.error === "string") throw new Error(data.error);
          if (typeof data.reply !== "string") continue;
          const content = data.reply;
          const next: ChatMessage = reply
            ? { id: reply.id, role: "assistant", content, createdAt: reply.createdAt }
            : createChatMessage("assistant", content);
          reply = next;
          onUpdate({ message: next, mode: "live", demo: false });
        } catch (e) {
          if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
        }
      }
    }
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error("AI analysis timed out. Please try again.");
    }
    throw error instanceof Error ? error : new Error("The AI service could not be reached.");
  } finally {
    cleanup();
  }
}
