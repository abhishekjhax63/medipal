/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ----------------------------------------------------------------
           Global MEDIPAL palette — one system for every module.

           The redesign follows accessible Indian public-healthcare design:
           a deep healthcare green carries trust-oriented primary actions,
           warm off-white and charcoal carry most of the interface, and the
           MEDIPAL red/pink is kept as the restrained brand accent it always
           was — never as the default action colour.

           Green is never applied decoratively: it means "go" or a positive
           status. Red means urgency, an error, or the MEDIPAL brand mark.
           ---------------------------------------------------------------- */
        brand: {
          DEFAULT: "#12775A",
          bright: "#1A8F6C",
          deep: "#0C5B45",
          ink: "#08402F",
          tint: "#E6F1EC",
          wash: "#F1F7F4",
        },
        /* Warm off-white page and section surfaces. */
        canvas: {
          DEFAULT: "#FBFBF9",
          alt: "#F5F7F5",
        },
        /* Global MEDIPAL palette — blush pink with crimson accents. */
        crimson: {
          DEFAULT: "#E91E4D",
          bright: "#F04452",
          soft: "#C2183A",
          /* Burgundy is retained purely for WebGL depth and shadow tinting. */
          deep: "#4C1028",
        },
        blush: {
          DEFAULT: "#FFE7ED",
          soft: "#FFF5F7",
        },
        /* `ink` is the primary text colour; `line` is the default subtle border.
           Both are neutral greys — the old pink cast made every card look warm
           in a way that competed with the medical content. */
        ink: {
          DEFAULT: "#1F2933",
          surface: "#FFFFFF",
        },
        content: {
          primary: "#1F2933",
          secondary: "#5C6875",
        },
        line: "#E2E4E1",
        ok: "#159A70",
        warn: "#B26A00",
        danger: "#DC2626",
        glass: {
          highlight: "rgba(255,255,255,0.94)",
          surface: "rgba(255,255,255,0.86)",
          border: "rgba(226,228,225,0.9)",
        },
        /* E-UPCHAR shares the global palette; the token names are kept so the
           whole booking module adopts the redesign without a component rewrite. */
        eu: {
          red: "#E91E4D",
          "red-deep": "#C2183A",
          "red-tint": "#FFF5F7",
          bg: "#FFFFFF",
          surface: "#F5F7F5",
          text: "#1F2933",
          muted: "#5C6875",
          border: "#E2E4E1",
          ok: "#159A70",
          warn: "#B26A00",
          /* E-UPCHAR now shares the platform's trust colour rather than
             carrying a second, competing primary. */
          brand: "#12775A",
          "brand-deep": "#0C5B45",
          "brand-tint": "#E6F1EC",
        },
      },
      fontFamily: {
        /* Headings use the same highly readable face as body copy — a public
           healthcare product should not make citizens decode a display font.
           Noto Sans Devanagari is in every stack so Hindi text never falls
           back to a mismatched glyph set. */
        display: ['"Inter"', '"Noto Sans Devanagari"', "system-ui", "sans-serif"],
        sans: ['"Inter"', '"Noto Sans Devanagari"', "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        manrope: ['"Manrope"', '"Noto Sans Devanagari"', "system-ui", "sans-serif"],
        hindi: ['"Noto Sans Devanagari"', '"Inter"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        /* Pulled in from 2rem/2.75rem — very large radii read as decorative,
           and a public healthcare interface should read as calm and sturdy. */
        "4xl": "1.5rem",
        "5xl": "2rem",
      },
      boxShadow: {
        /* Restrained, neutral depth. A card should separate from the surface,
           not glow. */
        card: "0 1px 2px rgba(31,41,51,0.05), 0 10px 26px -18px rgba(31,41,51,0.18)",
        "card-lift": "0 2px 4px rgba(31,41,51,0.06), 0 20px 44px -24px rgba(31,41,51,0.24)",
        glass: "0 1px 2px rgba(31,41,51,0.04), 0 14px 34px -22px rgba(31,41,51,0.18)",
        "glass-lift": "0 2px 6px rgba(31,41,51,0.06), 0 22px 48px -26px rgba(31,41,51,0.22)",
        "glow-red": "0 0 70px -14px rgba(233,30,77,0.45)",
        "glow-red-sm": "0 0 34px -10px rgba(240,68,82,0.5)",
        "eu-card": "0 1px 2px rgba(31,41,51,0.05), 0 10px 26px -18px rgba(31,41,51,0.18)",
        "eu-lift": "0 2px 4px rgba(31,41,51,0.06), 0 22px 44px -24px rgba(31,41,51,0.24)",
        "eu-inset": "inset 0 1px 0 rgba(255,255,255,0.9)",
      },
      backdropBlur: {
        xs: "2px",
        glass: "22px",
      },
      keyframes: {
        floatY: {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(0, -14px, 0)" },
        },
        driftGlow: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)", opacity: "0.75" },
          "50%": { transform: "translate3d(3%, -4%, 0) scale(1.08)", opacity: "1" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.9)", opacity: "0.55" },
          "70%": { transform: "scale(1.35)", opacity: "0" },
          "100%": { transform: "scale(1.35)", opacity: "0" },
        },
        sheenSweep: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(120%)" },
        },
        bounceDot: {
          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.45" },
          "40%": { transform: "translateY(-4px)", opacity: "1" },
        },
      },
      animation: {
        "float-y": "floatY 7s cubic-bezier(0.45, 0, 0.55, 1) infinite",
        "drift-glow": "driftGlow 16s ease-in-out infinite",
        "pulse-ring": "pulseRing 3.4s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        "sheen-sweep": "sheenSweep 2.6s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        "bounce-dot": "bounceDot 1.15s ease-in-out infinite",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
