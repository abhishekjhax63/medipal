import type {
  AIStatus,
  ChatAttachment,
  ChatMessage,
  ChatResult,
  ChatRole,
} from "@/types/aiDoctor";

const REQUEST_TIMEOUT_MS = 65_000;

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

function extractContent(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  return typeof data.reply === "string" && data.reply.trim() ? data.reply.trim() : undefined;
}

/**
 * Calls the MEDIPAL server only. Unlike the prior preview implementation, a
 * failed provider call is an error, never a locally generated medical answer.
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<ChatResult> {
  const endpoint = readEndpoint();
  if (!endpoint) throw new Error("AI analysis has not been configured for this deployment.");

  const { controller, cleanup } = withTimeout(signal, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        messages: messages.slice(-20).map(({ role, content, attachments }, index, recent) => ({
          role,
          content,
          // Previous media has already been analysed. Retaining it in the UI is
          // useful, but re-uploading it with every future turn is not.
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
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        isRecord(payload) && typeof payload.error === "string" ? payload.error : "AI analysis failed.";
      throw new Error(detail);
    }
    const content = extractContent(payload);
    if (!content) throw new Error("The AI provider returned an empty response.");
    return { message: createChatMessage("assistant", content), mode: "live", demo: false };
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error("AI analysis timed out. Please try again.");
    }
    throw error instanceof Error ? error : new Error("The AI service could not be reached.");
  } finally {
    cleanup();
  }
}
