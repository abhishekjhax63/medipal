import { AnimatePresence, motion } from "framer-motion";
import { LogIn, Menu, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { MedipalLogo } from "@/components/ui/MedipalLogo";
import { useUI } from "@/context/UIContext";
import { cn } from "@/lib/cn";

/**
 * The single MEDIPAL navigation bar, rendered once in `App.tsx`.
 *
 * It replaces the previous floating glass pill. Three things changed and all
 * three were deliberate:
 *
 *  - It is a normal, full-width bar with a hairline rule rather than a
 *    detached capsule floating over the content, so it never overlaps a page
 *    heading on a short phone screen.
 *  - The primary list is the real information architecture — Home, Blood Bank,
 *    AI Doctor, E-UPCHAR, Ambulance, About, Contact — instead of a second set
 *    of links hidden behind a menu on desktop.
 *  - Movement is limited to the menu opening. No layout animation, no drifting
 *    indicator.
 *
 * There is exactly one header in the application; individual pages must not
 * render their own.
 */

const primaryNav = [
  { label: "Home", to: "/" },
  { label: "Blood Bank", to: "/blood-bank" },
  { label: "AI Doctor", to: "/ai-doctor" },
  { label: "E-UPCHAR", to: "/e-upchar" },
  { label: "Ambulance", to: "/ambulance" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
] as const;

/** `/` must match exactly, or it would highlight on every route. */
function isActiveRoute(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function SiteHeader() {
  const location = useLocation();
  const { openLogin } = useUI();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="eu-no-print sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          to="/"
          aria-label="MEDIPAL home"
          className="flex shrink-0 items-center gap-2.5 rounded-lg"
        >
          <MedipalLogo size={34} />
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-base font-semibold tracking-tight text-content-primary">
              MEDIPAL
            </span>
            <span className="mt-0.5 text-[0.68rem] font-medium text-content-secondary">
              Health platform
            </span>
          </span>
        </Link>

        {/* Desktop navigation. The full list only appears once there is room
            for all seven items beside the logo and the account controls —
            below that width the same list lives in the menu button, so no item
            is ever clipped or wrapped into a second row. */}
        <nav aria-label="Main" className="hidden xl:block">
          <ul className="flex flex-wrap items-center gap-0.5">
            {primaryNav.map((item) => {
              const active = isActiveRoute(location.pathname, item.to);
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                      active
                        ? "bg-brand-tint text-brand-deep"
                        : "text-content-secondary hover:bg-canvas-alt hover:text-content-primary",
                    )}
                  >
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openLogin}
            className="btn-secondary hidden px-3.5 py-2 text-sm sm:inline-flex"
          >
            <LogIn className="h-4 w-4" aria-hidden />
            Sign in
          </button>

          {/* No account system is connected, so Profile opens the same sign-in
              entry point rather than faking a signed-in session. */}
          <button
            type="button"
            onClick={openLogin}
            aria-label="Profile — sign in to continue"
            title="Profile"
            className="hidden h-10 w-10 items-center justify-center rounded-lg border border-line bg-white text-content-secondary transition-colors duration-150 hover:bg-canvas-alt hover:text-content-primary xl:inline-flex"
          >
            <UserRound className="h-4 w-4" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="medipal-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-white text-content-primary transition-colors duration-150 hover:bg-canvas-alt xl:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {menuOpen && (
          <motion.div
            id="medipal-mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden border-t border-line bg-white xl:hidden"
          >
            <nav aria-label="Main (mobile)" className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6">
              <ul className="grid gap-1">
                {primaryNav.map((item) => {
                  const active = isActiveRoute(location.pathname, item.to);
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                          active
                            ? "bg-brand-tint text-brand-deep"
                            : "text-content-secondary hover:bg-canvas-alt hover:text-content-primary",
                        )}
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  openLogin();
                }}
                className="btn-primary mt-3 w-full"
              >
                <LogIn className="h-4 w-4" aria-hidden />
                Sign in
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
