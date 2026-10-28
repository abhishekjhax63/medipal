import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, CornerDownLeft, Image as ImageIcon, LoaderCircle, RotateCcw, Send, ShieldAlert, Sparkles, Trash, Video as VideoIcon, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { MessageBubble } from "@/components/ai-doctor/MessageBubble";
import { followUpsFor } from "@/components/ai-doctor/prompts";
import { GlassCard } from "@/components/ui/GlassCard";
import { EASE_SMOOTH } from "@/lib/animations";
import { prefersReducedMotion } from "@/lib/motion";
import {
  createChatMessage,
  createMessageId,
  getAIMediaCapabilities,
  sendChatMessage,
  type AIMediaCapabilities,
} from "@/services/aiDoctorService";
import type { AIStatus, ChatAttachment, ChatMessage, DemoIntent, PendingPrompt } from "@/types/aiDoctor";

type ChatPhase = "idle" | "loading" | "error";
type ChatEntry = { message: ChatMessage; demo: false; intent?: DemoIntent };
type DraftAttachment = ChatAttachment & { progress: number; previewUrl: string };

export type AIChatInterfaceProps = {
  variant: "hero" | "panel";
  pendingPrompt: PendingPrompt | null;
  onPromptConsumed: () => void;
  onConversationActiveChange?: (active: boolean) => void;
  onThinkingChange?: (thinking: boolean) => void;
  status: AIStatus;
};

const MAX_TEXTAREA_HEIGHT = 168;
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 90;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-bright focus-visible:ring-offset-2";

function TypingIndicator() {
  return <div className="flex items-center gap-2.5" role="status" aria-label="MEDIPAL is analysing your request"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-crimson/20 bg-white/85 text-crimson"><Sparkles className="h-4 w-4" aria-hidden /></span><div className="glass-light flex items-center gap-1.5 rounded-3xl rounded-bl-lg px-4 py-3">{[0, 150, 300].map((delay) => <span key={delay} className="h-1.5 w-1.5 rounded-full bg-crimson motion-safe:animate-bounce-dot" style={{ animationDelay: `${delay}ms` }} />)}</div></div>;
}

function Disclaimer() {
  return <div className="space-y-2"><div className="flex items-start gap-2.5 rounded-2xl border border-crimson/20 bg-[linear-gradient(120deg,rgba(255,49,87,0.08),rgba(225,29,72,0.11))] px-3.5 py-2.5"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crimson" aria-hidden /><p className="text-xs leading-relaxed text-content-secondary">For chest pain, breathing difficulty, severe bleeding, sudden weakness or another emergency, call 112 in India immediately. Do not wait for AI analysis.</p></div><p className="px-1 text-[0.7rem] leading-relaxed text-content-secondary/80">MEDIPAL AI provides general health information, not a diagnosis or emergency care. Attachments are analysed for this conversation only.</p></div>;
}

function StatusLine({ label }: { label: string }) {
  return <div className="flex items-center gap-2 px-1"><span className="relative flex h-2 w-2" aria-hidden><span className="absolute inline-flex h-full w-full rounded-full bg-crimson-bright/60 motion-safe:animate-pulse-ring" /><span className="relative inline-flex h-2 w-2 rounded-full bg-crimson" /></span><span className="font-manrope text-[0.58rem] uppercase tracking-[0.2em] text-content-secondary">{label}</span></div>;
}

function readFileAsDataUrl(file: File, onProgress: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100))); };
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration); };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The video duration could not be read.")); };
    video.src = url;
  });
}

export function AIChatInterface({ variant, pendingPrompt, onPromptConsumed, onConversationActiveChange, onThinkingChange, status }: AIChatInterfaceProps) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mediaCapabilities, setMediaCapabilities] = useState<AIMediaCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const entriesRef = useRef<ChatEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const consumedNonceRef = useRef<number | null>(null);
  const composerId = useId();
  const commit = useCallback((next: ChatEntry[]) => { entriesRef.current = next; setEntries(next); }, []);
  const clearAttachmentUrls = useCallback((items: DraftAttachment[]) => items.forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

  const startRequest = useCallback(async (history: ChatEntry[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("loading"); setErrorText(null);
    try {
      const result = await sendChatMessage(history.map((entry) => entry.message), controller.signal);
      if (!controller.signal.aborted) { commit([...history, { message: result.message, demo: false, intent: result.intent }]); setPhase("idle"); }
    } catch (error) {
      if (!controller.signal.aborted) { setPhase("error"); setErrorText(error instanceof Error ? error.message : "The AI service could not be reached."); }
    }
  }, [commit]);

  const handleSend = useCallback((raw?: string) => {
    const content = (raw ?? input).trim();
    if ((content.length === 0 && attachments.length === 0) || phase === "loading" || attachments.some((item) => item.progress < 100)) return;
    const uploaded: ChatAttachment[] = attachments.map(({ progress: _progress, previewUrl: _previewUrl, ...item }) => item);
    const next: ChatEntry[] = [...entriesRef.current, { message: createChatMessage("user", content, uploaded), demo: false }];
    commit(next); setInput(""); setAttachments((current) => { clearAttachmentUrls(current); return []; }); setUploadError(null); void startRequest(next);
  }, [attachments, clearAttachmentUrls, commit, input, phase, startRequest]);

  const handleFiles = useCallback(async (event: ChangeEvent<HTMLInputElement>, kind: "image" | "video") => {
    const files = Array.from(event.target.files ?? []); event.target.value = ""; if (!files.length) return;
    if ((kind === "image" && !mediaCapabilities?.images) || (kind === "video" && !mediaCapabilities?.videoFrames)) {
      setUploadError(
        kind === "image"
          ? "Image analysis is not enabled for this MEDIPAL deployment."
          : "Video frame analysis is not enabled for this MEDIPAL deployment.",
      );
      return;
    }
    setUploadError(null);
    for (const file of files) {
      const types = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
      const byteLimit = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
      if (!types.has(file.type)) { setUploadError(`${file.name} is not a supported ${kind}. Use ${kind === "image" ? "JPG, PNG or WEBP" : "MP4, WEBM or MOV"}.`); continue; }
      if (file.size > byteLimit) { setUploadError(`${file.name} is larger than the ${kind === "image" ? "5 MB" : "20 MB"} limit.`); continue; }
      if (attachments.reduce((total, item) => total + item.sizeBytes, 0) + file.size > MAX_TOTAL_BYTES) { setUploadError("Attachments together must be 20 MB or smaller."); break; }
      if (kind === "image" && attachments.filter((item) => item.kind === "image").length >= MAX_IMAGES) { setUploadError(`You can attach up to ${MAX_IMAGES} images in one message.`); break; }
      if (kind === "video" && attachments.some((item) => item.kind === "video")) { setUploadError("Attach one video at a time so it can be analysed safely."); break; }
      let durationSeconds: number | undefined;
      try {
        if (kind === "video") { durationSeconds = await getVideoDuration(file); if (!Number.isFinite(durationSeconds) || durationSeconds > MAX_VIDEO_SECONDS) throw new Error(`Videos must be ${MAX_VIDEO_SECONDS} seconds or shorter.`); }
        const id = createMessageId();
        const draft: DraftAttachment = { id, name: file.name, mimeType: file.type, sizeBytes: file.size, kind, dataUrl: "", durationSeconds, progress: 1, previewUrl: URL.createObjectURL(file) };
        setAttachments((current) => [...current, draft]);
        const dataUrl = await readFileAsDataUrl(file, (progress) => setAttachments((current) => current.map((item) => item.id === id ? { ...item, progress } : item)));
        setAttachments((current) => current.map((item) => item.id === id ? { ...item, dataUrl, progress: 100 } : item));
      } catch (error) { setUploadError(error instanceof Error ? `${file.name}: ${error.message}` : `Could not prepare ${file.name}.`); }
    }
  }, [attachments, mediaCapabilities]);

  const removeAttachment = useCallback((id: string) => setAttachments((current) => { const target = current.find((item) => item.id === id); if (target) URL.revokeObjectURL(target.previewUrl); return current.filter((item) => item.id !== id); }), []);
  const handleRetry = useCallback(() => { const history = entriesRef.current; if (history.some((entry) => entry.message.role === "user")) void startRequest(history); }, [startRequest]);
  const handleClear = useCallback(() => { abortRef.current?.abort(); commit([]); setInput(""); setAttachments((current) => { clearAttachmentUrls(current); return []; }); setPhase("idle"); setErrorText(null); setUploadError(null); setCopiedId(null); requestAnimationFrame(() => textareaRef.current?.focus()); }, [clearAttachmentUrls, commit]);
  const handleCopy = useCallback(async (message: ChatMessage) => { try { await navigator.clipboard?.writeText(message.content); setCopiedId(message.id); window.setTimeout(() => setCopiedId((current) => current === message.id ? null : current), 1800); } catch { /* clipboard access is optional */ } }, []);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); handleSend(); } };

  useEffect(() => () => { abortRef.current?.abort(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void getAIMediaCapabilities(controller.signal)
      .then((capabilities) => {
        if (!controller.signal.aborted) {
          setMediaCapabilities(capabilities);
          setCapabilityError(null);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setMediaCapabilities({ text: false, images: false, videoFrames: false });
        setCapabilityError(error instanceof Error ? error.message : "Attachment analysis could not be checked.");
      });
    return () => controller.abort();
  }, []);
  useEffect(() => { onThinkingChange?.(phase === "loading"); }, [onThinkingChange, phase]);
  useEffect(() => { const element = textareaRef.current; if (element) { element.style.height = "auto"; element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`; } }, [input]);
  useEffect(() => { const element = listRef.current; if (element) element.scrollTo({ top: element.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" }); }, [entries, phase]);
  const conversationActive = entries.length > 0;
  useEffect(() => { onConversationActiveChange?.(conversationActive); }, [conversationActive, onConversationActiveChange]);
  useEffect(() => { if (!pendingPrompt || pendingPrompt.nonce === consumedNonceRef.current) return; consumedNonceRef.current = pendingPrompt.nonce; if (pendingPrompt.submit) handleSend(pendingPrompt.text); else { setInput(pendingPrompt.text); requestAnimationFrame(() => textareaRef.current?.focus()); } onPromptConsumed(); }, [handleSend, onPromptConsumed, pendingPrompt]);

  const lastAssistant = useMemo(() => [...entries].reverse().find((entry) => entry.message.role === "assistant") ?? null, [entries]);
  const followUps = useMemo(() => followUpsFor(lastAssistant?.intent), [lastAssistant?.intent]);
  const canSend = (input.trim().length > 0 || attachments.length > 0) && attachments.every((item) => item.progress === 100) && phase !== "loading";
  const statusLabel = status.endpointConfigured ? "AI analysis — availability checked when you send" : "AI analysis is not configured";
  const imagesEnabled = mediaCapabilities?.images === true;
  const videoEnabled = mediaCapabilities?.videoFrames === true;
  const mediaHint = !mediaCapabilities
    ? "Checking whether this deployment can analyse attachments…"
    : capabilityError
      ? `${capabilityError} Text questions may still be available.`
      : imagesEnabled && videoEnabled
        ? "Images: JPG, PNG, WEBP up to 5 MB each. One MP4, WEBM or MOV up to 20 MB / 90 sec. Attachments together: 20 MB max. Video analysis is based on selected frames."
        : imagesEnabled
          ? "Images: JPG, PNG or WEBP up to 5 MB each. Video analysis is not enabled for this deployment."
          : "Image and video analysis are not enabled for this deployment. You can still ask a text question.";

  const composer = <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); handleSend(); }}>
    {attachments.length > 0 && <div className="flex flex-wrap gap-2 px-1">{attachments.map((file) => <div key={file.id} className="flex max-w-full items-center gap-2 rounded-xl border border-line bg-white/80 px-2 py-1.5 text-[0.7rem] text-content-secondary">{file.kind === "image" ? <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <VideoIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />}<span className="max-w-[165px] truncate font-medium">{file.name}{file.durationSeconds ? ` · ${Math.ceil(file.durationSeconds)} sec` : ""}</span>{file.progress < 100 && <span className="text-crimson">{file.progress}%</span>}<button type="button" onClick={() => removeAttachment(file.id)} aria-label={`Remove ${file.name}`} className="rounded-full p-0.5 hover:bg-crimson/10 hover:text-crimson"><X className="h-3 w-3" aria-hidden /></button></div>)}</div>}
    {uploadError && <p className="flex items-start gap-1.5 px-1 text-xs text-danger"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{uploadError}</p>}
    <div className="flex items-end gap-2"><div className="flex-1"><label htmlFor={composerId} className="sr-only">Ask MEDIPAL about your health</label><div className="relative"><textarea id={composerId} ref={textareaRef} value={input} rows={1} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder="Ask about a report, prescription, image or video…" className="w-full resize-none rounded-2xl border border-line bg-white/85 px-4 py-3 pr-20 text-sm leading-relaxed text-content-primary placeholder:text-content-secondary/60 outline-none transition focus:border-crimson/50 focus:bg-white focus:shadow-[0_0_0_4px_rgba(233,30,77,0.14)]" /><div className="absolute bottom-2 right-2 flex items-center gap-1">{imagesEnabled ? <label title="Attach JPG, PNG or WEBP" className="cursor-pointer rounded-full p-1.5 text-content-secondary transition hover:bg-blush/70 hover:text-crimson-soft"><ImageIcon className="h-4 w-4" aria-hidden /><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => void handleFiles(event, "image")} /></label> : <span title="Image analysis is not enabled" aria-label="Image analysis is not enabled" className="cursor-not-allowed rounded-full p-1.5 text-content-secondary/35"><ImageIcon className="h-4 w-4" aria-hidden /></span>}{videoEnabled ? <label title="Attach MP4, WEBM or MOV (90 seconds max)" className="cursor-pointer rounded-full p-1.5 text-content-secondary transition hover:bg-blush/70 hover:text-crimson-soft"><VideoIcon className="h-4 w-4" aria-hidden /><input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(event) => void handleFiles(event, "video")} /></label> : <span title="Video analysis is not enabled" aria-label="Video analysis is not enabled" className="cursor-not-allowed rounded-full p-1.5 text-content-secondary/35"><VideoIcon className="h-4 w-4" aria-hidden /></span>}</div></div></div><button type="submit" disabled={!canSend} className={`btn-primary mb-0.5 shrink-0 px-4 py-3 sm:px-5 ${FOCUS_RING}`} aria-label="Send message">{phase === "loading" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}<span className="hidden sm:inline">Send</span></button></div>
    <p className="px-1 text-[0.68rem] leading-relaxed text-content-secondary/80">{mediaHint}</p>
  </form>;
  const errorBanner = phase === "error" && errorText ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-crimson/25 bg-[linear-gradient(120deg,rgba(255,49,87,0.08),rgba(225,29,72,0.12))] px-3.5 py-2.5"><p className="flex items-center gap-2 text-xs leading-relaxed text-content-secondary"><CircleAlert className="h-3.5 w-3.5 shrink-0 text-crimson" aria-hidden />{errorText}</p><button type="button" onClick={handleRetry} className={`inline-flex items-center gap-1.5 rounded-full border border-crimson/30 bg-white/80 px-3 py-1.5 text-xs font-medium text-content-primary ${FOCUS_RING}`}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Try again</button></div> : null;
  const followUpChips = variant === "panel" && phase === "idle" && lastAssistant && conversationActive ? <div className="flex flex-wrap items-center gap-2"><span className="font-manrope text-[0.58rem] uppercase tracking-[0.18em] text-content-secondary/70">Follow up</span>{followUps.map((prompt) => <button key={prompt} type="button" onClick={() => { setInput(prompt); textareaRef.current?.focus(); }} className={`rounded-full border border-crimson/20 bg-white/75 px-3 py-1.5 text-xs text-content-secondary transition hover:border-crimson/40 hover:text-content-primary ${FOCUS_RING}`}>{prompt}</button>)}</div> : null;
  if (variant === "hero") return <div className="flex w-full flex-col gap-3"><GlassCard tone="light" hairline className="flex flex-col gap-3 p-3 sm:p-4">{composer}<div className="flex flex-wrap items-center justify-between gap-2 px-1"><StatusLine label={statusLabel} /><span className="hidden items-center gap-1.5 font-manrope text-[0.58rem] uppercase tracking-[0.16em] text-content-secondary/70 sm:flex"><CornerDownLeft className="h-3 w-3" aria-hidden />Enter to send · Shift + Enter for a new line</span></div></GlassCard>{phase === "loading" && <p className="px-1 font-manrope text-[0.62rem] uppercase tracking-[0.2em] text-content-secondary">MEDIPAL is analysing your request…</p>}{errorBanner}<Disclaimer /></div>;
  return <GlassCard tone="light" hairline className="flex flex-col gap-4 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-full border border-crimson/20 bg-white/85 text-crimson"><Sparkles className="h-4 w-4" aria-hidden /></span><div className="leading-tight"><p className="font-display text-sm font-semibold text-content-primary">MEDIPAL AI Assistant</p><p className="font-manrope text-[0.56rem] uppercase tracking-[0.2em] text-content-secondary/80">General information only</p></div></div><button type="button" onClick={handleClear} className={`inline-flex items-center gap-1.5 rounded-full border border-crimson/20 bg-white/70 px-3 py-1.5 text-xs font-medium text-content-secondary transition hover:border-crimson/45 hover:text-content-primary ${FOCUS_RING}`}><Trash className="h-3.5 w-3.5" aria-hidden />Clear conversation</button></div><div className="h-px bg-[linear-gradient(90deg,transparent,rgba(233,30,77,0.18),transparent)]" /><div ref={listRef} role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation with MEDIPAL AI" className="no-scrollbar flex max-h-[46vh] min-h-[180px] flex-col gap-4 overflow-y-auto px-0.5 py-1 lg:max-h-[calc(100vh-24rem)]">{entries.map((entry) => <motion.div key={entry.message.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_SMOOTH }}><MessageBubble message={entry.message} copied={copiedId === entry.message.id} onCopy={handleCopy} /></motion.div>)}<AnimatePresence>{phase === "loading" && <motion.div key="typing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><TypingIndicator /></motion.div>}</AnimatePresence></div>{errorBanner}{followUpChips}<div className="border-t border-crimson/10 pt-3">{composer}</div><div className="flex flex-wrap items-center justify-between gap-2 px-1"><StatusLine label={statusLabel} /><span className="hidden items-center gap-1.5 font-manrope text-[0.58rem] uppercase tracking-[0.16em] text-content-secondary/70 sm:flex"><CornerDownLeft className="h-3 w-3" aria-hidden />Enter to send</span></div><Disclaimer /></GlassCard>;
}
