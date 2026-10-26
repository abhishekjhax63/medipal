/** Shared smooth-scroll helper for the Blood Bank experience. */
export function scrollToId(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}
