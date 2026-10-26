export type ClassValue = string | false | null | undefined;

/** Tiny class name joiner — avoids pulling in an extra dependency. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
