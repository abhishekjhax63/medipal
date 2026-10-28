type AmbientBackdropProps = {
  variant?: "blood" | "ai" | "eupchar" | "ambulance";
};

/**
 * The page background.
 *
 * This used to be a set of drifting crimson blooms with hex and route grids
 * behind every route. All of it has been removed: on a public healthcare
 * service, a busy animated backdrop competes with the content a citizen is
 * trying to read, and floating decoration is the clearest tell of a page that
 * was generated rather than designed.
 *
 * What remains is one warm off-white canvas with a barely-perceptible wash at
 * the top of the page. It carries no information, sits behind everything as
 * `fixed inset-0 -z-10 pointer-events-none`, and cannot intercept a click.
 * The `variant` prop is still accepted so routes keep working unchanged.
 */
export function AmbientBackdrop(_props: AmbientBackdropProps = {}) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-white to-transparent" />
    </div>
  );
}
