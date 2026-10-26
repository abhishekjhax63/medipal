/** Shared, privacy-conscious types for the MEDIPAL AI Doctor experience. */

export type ChatRole = "user" | "assistant";

export type AttachmentKind = "image" | "video";

/**
 * The browser keeps media only in memory for the active conversation. `dataUrl`
 * is sent over HTTPS to MEDIPAL's server for this single request; it is never
 * put in browser storage or rendered as a public URL.
 */
export type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  dataUrl: string;
  durationSeconds?: number;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  attachments?: ChatAttachment[];
};

/** A response is only marked live after MEDIPAL's configured provider replies. */
export type ChatMode = "live";

export type DemoIntent = "symptoms" | "general" | "medicine" | "visit" | "default";

export type ChatResult = {
  message: ChatMessage;
  mode: ChatMode;
  demo: false;
  intent?: DemoIntent;
};

/** Honest client-side configuration state. It does not claim provider health. */
export type AIStatus = {
  mode: "available" | "not_configured";
  endpointConfigured: boolean;
};

export type PendingPrompt = {
  nonce: number;
  text: string;
  submit: boolean;
};
