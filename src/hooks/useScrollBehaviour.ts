import { useEffect } from "react";

/**
 * Scrolls to the top on route change, or to the hash target once the
 * route transition has finished rendering the new page.
 */
export function useScrollBehaviour(pathname: string, hash: string) {
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    const targetId = hash.replace("#", "");
    const timer = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 520);

    return () => window.clearTimeout(timer);
  }, [pathname, hash]);
}
