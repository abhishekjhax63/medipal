/**
 * Blood search voice/text parser.
 *
 * Mirrors the reference application's Hindi / Hinglish / English parser, but
 * generalised: the reference hardcodes Patna localities to its own simulated
 * dataset, which MEDIPAL cannot do without implying a directory it does not
 * have. Instead this reads the blood group and component from speech and
 * recognises any Indian state by name, plus an explicit 6-digit PIN and a
 * "in <place>" style locality phrase.
 *
 * Nothing here invents a result. It only turns what the visitor actually said
 * into prefilled filter fields, and it reports back exactly which phrase it
 * matched so the visitor can correct it before searching.
 */

import { bloodGroups, indianStates, type BloodGroup } from "@/data/bloodGroups";
import type { BloodComponent } from "@/services/blood/types";

export interface ParsedBloodQuery {
  /** The transcript exactly as recognised. */
  raw: string;
  bloodGroup: BloodGroup | null;
  component: BloodComponent | null;
  state: string | null;
  city: string | null;
  postalCode: string | null;
  /** Human-readable list of what was understood, e.g. `"O+ (ओ पॉजिटिव)"`. */
  matched: string[];
}

/**
 * Lower-cases, spells `+`/`-` out as words (in Latin and Devanagari script so
 * that "O पॉजिटिव" and "O positive" land in the same shape), then strips
 * punctuation and collapses whitespace.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(ab|o|a|b)\s*\+/g, "$1 positive ")
    .replace(/\b(ab|o|a|b)\s*[-–—]\s*(?=\s|$)/g, "$1 negative ")
    .replace(/(एबी|ओ|ए|बी)\s*\+/g, "$1 पॉजिटिव ")
    .replace(/(एबी|ओ|ए|बी)\s*[-–—]/g, "$1 नेगेटिव ")
    .replace(/[.,/#!$%^&*;:{}=_`~()?"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ordered longest-prefix-first so `AB+` is never read as `A+` or `B+`. */
const GROUP_PATTERNS: readonly { group: BloodGroup; positives: string[]; negatives: string[] }[] = [
  {
    group: "AB+",
    positives: ["एबी पॉजिटिव", "ए बी पॉजिटिव", "ab positive", "ab pos", "ab positive"],
    negatives: ["एबी नेगेटिव", "ए बी नेगेटिव", "ab negative", "ab neg"],
  },
  {
    group: "O+",
    positives: ["ओ पॉजिटिव", "o positive", "o pos"],
    negatives: ["ओ नेगेटिव", "o negative", "o neg"],
  },
  {
    group: "A+",
    positives: ["ए पॉजिटिव", "a positive", "a pos"],
    negatives: ["ए नेगेटिव", "a negative", "a neg"],
  },
  {
    group: "B+",
    positives: ["बी पॉजिटिव", "b positive", "b pos"],
    negatives: ["बी नेगेटिव", "b negative", "b neg"],
  },
];

/** Blood group from a spoken or typed query. `null` when nothing was said. */
export function extractBloodGroup(raw: string): { group: BloodGroup | null; matchedText?: string } {
  const norm = normalize(raw);

  for (const entry of GROUP_PATTERNS) {
    if (entry.positives.some((phrase) => norm.includes(phrase))) {
      return { group: entry.group, matchedText: `${entry.group} (spoken)` };
    }
    if (entry.negatives.some((phrase) => norm.includes(phrase))) {
      const group = entry.group.replace("+", "-") as BloodGroup;
      return { group, matchedText: `${group} (spoken)` };
    }
  }

  // Fall back to a bare letter plus a polarity word, e.g. "o positive blood".
  const positive = /\b(positive|पॉजिटिव)\b/.test(norm);
  const negative = /\b(negative|नेगेटिव)\b/.test(norm);
  if (positive !== negative) {
    const letter = /\bab\b/.test(norm) ? "AB" : /\bo\b|ओ\b/.test(norm) ? "O" : /\ba\b|ए\b/.test(norm) ? "A" : /\bb\b|बी\b/.test(norm) ? "B" : null;
    if (letter) {
      const group = `${letter}${positive ? "+" : "-"}` as BloodGroup;
      return { group, matchedText: `${group} (spoken)` };
    }
  }

  // Finally, accept a literal "A+"/"AB-" printed in the text.
  for (const group of bloodGroups) {
    const literal = group.replace("+", "\\+").replace("-", "\\-");
    if (new RegExp(`(?<![a-z0-9])${literal}(?![a-z0-9])`).test(norm)) {
      return { group, matchedText: `${group} (typed)` };
    }
  }

  return { group: null };
}

/** Component vocabulary, longest-specific match first. */
const COMPONENT_PATTERNS: readonly { component: BloodComponent; phrases: string[] }[] = [
  {
    component: "Platelets",
    phrases: ["प्लेटलेट्स", "प्लेटलेट", "platelets", "platelet", "rdp", "sdp"],
  },
  {
    component: "Fresh Frozen Plasma",
    phrases: [
      "फ्रेश फ्रोजन प्लाज्मा",
      "fresh frozen plasma",
      "प्लाज्मा",
      "plasma",
      "ffp",
    ],
  },
  {
    component: "Cryoprecipitate",
    phrases: ["क्रायो", "cryoprecipitate", "cryo"],
  },
  {
    component: "Packed Red Blood Cells",
    phrases: [
      "पैक्ड रेड ब्लड सेल्स",
      "पैक्ड रेड ब्लड सेल",
      "रेड ब्लड सेल्स",
      "रेड ब्लड सेल",
      "लाल रक्त",
      "packed red blood cells",
      "packed red cells",
      "red blood cells",
      "red cells",
      "prbc",
      "rbc",
    ],
  },
  {
    component: "Whole Blood",
    phrases: ["पूरा रक्त", "सम्पूर्ण रक्त", "होल ब्लड", "whole blood"],
  },
];

/** Blood component from a spoken or typed query. `null` when nothing was said. */
export function extractComponent(raw: string): { component: BloodComponent | null; matchedText?: string } {
  const norm = normalize(raw);
  for (const entry of COMPONENT_PATTERNS) {
    if (entry.phrases.some((phrase) => norm.includes(phrase))) {
      return { component: entry.component, matchedText: entry.component };
    }
  }
  return { component: null };
}

/** Any Indian state named in the query, matched case-insensitively. */
export function extractState(raw: string): { state: string | null; matchedText?: string } {
  const norm = normalize(raw);
  // Longest state name first so "West Bengal" wins over "Bengal".
  const ordered = [...indianStates].sort((a, b) => b.length - a.length);
  for (const state of ordered) {
    if (norm.includes(state.toLowerCase())) return { state, matchedText: state };
  }
  return { state: null };
}

/**
 * A locality phrase such as "in Patna", "near Pune", "mein Ranchi",
 * "में पटना". Returns the words that followed, which the visitor can edit.
 */
export function extractLocality(raw: string): { city: string | null; matchedText?: string } {
  const norm = normalize(raw);
  const match = norm.match(/\b(?:in|near|at|mein|में|के पास)\s+([a-z\u0900-\u097F]+(?:\s+[a-z\u0900-\u097F]+)?)/);
  if (!match) return { city: null };
  const phrase = match[1].trim();
  // Drop trailing words that are clearly not part of a place name.
  const stop = new Set(["blood", "ब्लड", "खून", "रक्त", "group", "ग्रुप", "positive", "negative", "pos", "neg", "units", "unit", "पॉजिटिव", "नेगेटिव"]);
  const words = phrase.split(" ").filter((word) => !stop.has(word));
  if (words.length === 0) return { city: null };
  const city = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return { city, matchedText: city };
}

/** A 6-digit Indian PIN code spoken as separate digits or as one number. */
export function extractPostalCode(raw: string): { postalCode: string | null; matchedText?: string } {
  const digits = raw.replace(/\D/g, " ");
  const match = digits.match(/(?<!\d)([1-9]\d{5})(?!\d)/);
  if (!match) return { postalCode: null };
  return { postalCode: match[1], matchedText: match[1] };
}

/**
 * Full parse. Every field is independent: a transcript that only contains a
 * blood group still yields that group and leaves the rest null, so the search
 * is never narrowed by a guess.
 */
export function parseBloodQuery(raw: string): ParsedBloodQuery {
  const group = extractBloodGroup(raw);
  const component = extractComponent(raw);
  const state = extractState(raw);
  const city = extractLocality(raw);
  const postalCode = extractPostalCode(raw);

  const matched: string[] = [];
  if (state.matchedText) matched.push(`State: ${state.matchedText}`);
  if (city.matchedText) matched.push(`City: ${city.matchedText}`);
  if (postalCode.matchedText) matched.push(`PIN: ${postalCode.matchedText}`);
  if (group.matchedText) matched.push(`Blood group: ${group.matchedText}`);
  if (component.matchedText) matched.push(`Component: ${component.matchedText}`);

  return {
    raw: raw.trim(),
    bloodGroup: group.group,
    component: component.component,
    state: state.state,
    city: city.city,
    postalCode: postalCode.postalCode,
    matched,
  };
}
