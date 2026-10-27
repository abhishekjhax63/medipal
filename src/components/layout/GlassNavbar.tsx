import { AnimatePresence, motion } from "framer-motion";
import { LogIn, Menu, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { MedipalLogo } from "@/components/ui/MedipalLogo";
import { useUI } from "@/context/UIContext";
import { cn } from "@/lib/cn";

const experiences = [
  { id: "blood-bank", label: "Blood Bank", short: "Blood", to: "/" },
  { id: "ai-doctor", label: "AI Doctor", short: "AI", to: "/ai-doctor" },
  { id: "e-upchar", label: "E-UPCHAR", short: "E-UPCHAR", to: "/e-upchar" },
  { id: "ambulance", label: "Ambulance", short: "Ambulance", to: "/ambulance" },
] as const;

type ExperienceId = (typeof experiences)[number]["id"];

/** Longer prefixes must be tested first so `/e-upchar` never falls through. */
function resolveExperience(pathname: string): ExperienceId {
  if (pathname.startsWith("/e-upchar")) return "e-upchar";
  if (pathname.startsWith("/ai-doctor")) return "ai-doctor";
  if (pathname.startsWith("/ambulance")) return "ambulance";
  if (pathname.startsWith("/blood-bank")) return "blood-bank";
  return "blood-bank";
}

const secondaryLinks = [
  { label: "Live", to: "/blood-bank/live" },
  { label: "About", to: "/about" },
  { label: "Reviews", to: "/reviews" },
  { label: "Contact", to: "/contact" },
] as const;

/**
 * Floating pill-shaped glass navigation — visible on every route.
 *
 * Four zones, left to right: brand + `BLOOD · AI · E-UPCHAR · AMBULANCE` subtitle, a
 * frosted capsule holding the four experiences with a shared active
 * indicator, then the account cluster. Everything is sized so the bar never
 * overlaps itself on small screens.
 */
export function GlassNavbar() {
  const location = useLocation();
  const { openLogin } = useUI();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const activeExperience = resolveExperience(location.pathname);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setScrolled(window.scrollY > 18);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

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
    <header className="eu-no-print pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-5 sm:px-5">
      <div
        className={cn(
          "glass-panel pointer-events-auto relative flex w-full max-w-6xl items-center justify-between gap-2 rounded-full py-2 pl-3 pr-2 transition-all duration-500 ease-smooth sm:gap-4 sm:pl-5 sm:pr-3",
          scrolled ? "shadow-glass-lift" : "shadow-glass",
        )}
      >
        <Link to="/" aria-label="MEDIPAL home" className="flex items-center gap-2.5">
          <MedipalLogo size={36} />
          <span className="hidden flex-col leading-none sm:flex">
            <span className="font-display text-sm font-semibold tracking-[0.22em] text-content-primary">
              MEDIPAL
            </span>
            <span className="mt-1 font-manrope text-[0.5rem] uppercase tracking-[0.28em] text-content-secondary">
              Blood &middot; AI &middot; E-UPCHAR &middot; Ambulance
            </span>
          </span>
        </Link>

        {/* Primary experience switches: Blood Bank, AI Doctor, E-UPCHAR, Ambulance.
            Scrolls horizontally on the narrowest phones instead of squashing. */}
        <nav
          aria-label="Primary experiences"
          className="no-scrollbar relative flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-white/60 p-1 backdrop-blur-xl sm:flex-none"
        >
          {experiences.map((experience) => {
            const isActive = activeExperience === experience.id;
            return (
              <Link
                key={experience.id}
                to={experience.to}
                aria-current={isActive ? "page" : undefined}
                aria-label={experience.label}
                className={cn(
                  "group relative z-10 flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-manrope text-[0.62rem] font-semibold uppercase tracking-[0.14em] transition-colors duration-300 sm:px-4 sm:text-[0.68rem]",
                  isActive ? "text-white" : "text-content-secondary hover:text-crimson-soft",
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="medipal-experience-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
                    className="absolute inset-0 -z-10 rounded-full bg-[linear-gradient(120deg,#f04452,#e91e4d_58%,#c2183a)] shadow-[0_12px_26px_-14px_rgba(233,30,77,0.85)]"
                  />
                )}
                {!isActive && (
                  <span className="absolute inset-0 -z-10 rounded-full bg-transparent transition-colors duration-300 group-hover:bg-blush/70" />
                )}
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-all duration-300",
                    isActive
                      ? "bg-white shadow-[0_0_10px_2px_rgba(255,255,255,0.85)]"
                      : "bg-crimson/35 group-hover:bg-crimson",
                  )}
                />
                <span aria-hidden className="sm:hidden">{experience.short}</span>
                <span aria-hidden className="hidden sm:inline">{experience.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5">
          <div className="hidden items-center gap-0.5 lg:flex">
            {secondaryLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-full px-3.5 py-2 text-[0.8rem] font-medium transition-all duration-300 ease-smooth",
                    isActive
                      ? "bg-blush text-crimson-soft"
                      : "text-content-secondary hover:bg-blush/60 hover:text-content-primary",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          <button
            type="button"
            onClick={openLogin}
            className="hidden items-center gap-2 rounded-full border border-line bg-white/80 px-4 py-2 text-[0.8rem] font-medium text-content-primary backdrop-blur-md transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-crimson/40 hover:text-crimson-soft md:inline-flex"
          >
            <LogIn className="h-3.5 w-3.5" aria-hidden />
            Sign In
          </button>

          {/* No account system is connected yet, so Profile routes to the same
              sign-in entry point rather than faking a signed-in session. */}
          <button
            type="button"
            onClick={openLogin}
            aria-label="Profile — sign in to continue"
            title="Profile"
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-white/80 text-content-secondary backdrop-blur-md transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-crimson/40 hover:text-crimson-soft md:inline-flex"
          >
            <UserRound className="h-4 w-4" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/70 text-content-primary transition-colors duration-300 hover:bg-blush/70 lg:hidden"
          >
            {menuOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <>
              <motion.div
                key="nav-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 -z-10 bg-ink/25 backdrop-blur-sm lg:hidden"
                onClick={() => setMenuOpen(false)}
              />
              <motion.div
                key="nav-menu"
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="glass-panel shadow-glass-lift absolute left-0 right-0 top-[calc(100%+0.6rem)] rounded-3xl p-3 lg:hidden"
              >
                <div className="flex flex-col gap-1">
                  {secondaryLinks.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition-colors duration-300",
                          isActive
                            ? "bg-blush text-crimson-soft"
                            : "text-content-secondary hover:bg-blush/60 hover:text-content-primary",
                        )
                      }
                    >
                      {link.label}
                      <span className="text-[0.65rem] uppercase tracking-[0.2em] text-content-secondary/70">
                        View
                      </span>
                    </NavLink>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      openLogin();
                    }}
                    className="btn-primary w-full"
                  >
                    <LogIn className="h-4 w-4" aria-hidden />
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="btn-secondary shrink-0 px-3"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
