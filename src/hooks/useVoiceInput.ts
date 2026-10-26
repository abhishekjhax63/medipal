/**
 * Speech recognition hook.
 *
 * Uses the browser's own `SpeechRecognition` implementation. It is genuinely
 * optional: on browsers that do not implement it, `supported` is `false` and
 * the caller must hide the microphone rather than render a button that cannot
 * work. Nothing is simulated — if recognition is unavailable or fails, the
 * hook reports that state and no transcript is invented.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal surface of the Web Speech API that this hook relies on. */
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export interface VoiceInputState {
  /** `false` when the browser has no speech recognition at all. */
  supported: boolean;
  listening: boolean;
  /** Live transcript, including interim results while speaking. */
  transcript: string;
  /** Set when recognition failed, in the browser's own words. */
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/** Human-readable rendering of the Web Speech API's error codes. */
function describeError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission was declined, so voice search cannot be used.";
    case "no-speech":
      return "No speech was detected. Try again and speak clearly.";
    case "audio-capture":
      return "No microphone was found on this device.";
    case "network":
      return "Speech recognition needs a network connection for this browser.";
    case "aborted":
      return "Voice search was stopped.";
    default:
      return `Speech recognition failed (${code}).`;
  }
}

export function useVoiceInput(lang = "en-IN"): VoiceInputState {
  const ctor = useRef<SpeechRecognitionCtor | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const finalText = useRef("");
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const Ctor = getConstructor();
    ctor.current = Ctor;
    setSupported(Boolean(Ctor));
    return () => {
      recognition.current?.abort();
      recognition.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const reset = useCallback(() => {
    finalText.current = "";
    setTranscript("");
    setError(null);
  }, []);

  const start = useCallback(() => {
    const Ctor = ctor.current;
    if (!Ctor) {
      setError("This browser does not support voice search.");
      return;
    }
    // A fresh instance per session: reusing one after `end` is unreliable
    // across Safari and Chrome.
    recognition.current?.abort();
    const instance = new Ctor();
    instance.lang = lang;
    instance.continuous = false;
    instance.interimResults = true;
    instance.maxAlternatives = 1;

    finalText.current = "";
    setTranscript("");
    setError(null);

    instance.onstart = () => setListening(true);
    instance.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const spoken = result[0]?.transcript ?? "";
        if (result.isFinal) finalText.current += ` ${spoken}`;
        else interim += spoken;
      }
      setTranscript(`${finalText.current} ${interim}`.replace(/\s+/g, " ").trim());
    };
    instance.onerror = (event) => {
      setError(describeError(event.error));
      setListening(false);
    };
    instance.onend = () => setListening(false);

    recognition.current = instance;
    try {
      instance.start();
    } catch {
      // Chrome throws if `start` is called while a session is already active.
      setError("Voice search is already running.");
      setListening(false);
    }
  }, [lang]);

  return { supported, listening, transcript, error, start, stop, reset };
}
