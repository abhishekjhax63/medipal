/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Global MEDIPAL palette — white + blush pink with crimson accents.
           One shared system across Blood Bank, AI Doctor and E-UPCHAR. */
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
        /* `ink` is the primary text colour; `line` is the default subtle border. */
        ink: {
          DEFAULT: "#17171C",
          surface: "#FFFFFF",
        },
        content: {
          primary: "#17171C",
          secondary: "#686873",
        },
        line: "#E8DDE1",
        ok: "#159A70",
        warn: "#F59E0B",
        danger: "#DC2626",
        glass: {
          highlight: "rgba(255,255,255,0.92)",
          surface: "rgba(255,255,255,0.72)",
          border: "rgba(255,255,255,0.88)",
        },
        /* E-UPCHAR shares the global palette; the token names are kept so the
           whole booking module adopts the redesign without a component rewrite. */
        eu: {
          red: "#E91E4D",
          "red-deep": "#C2183A",
          "red-tint": "#FFF5F7",
          bg: "#FFFFFF",
          surface: "#F7F7F9",
          text: "#17171C",
          muted: "#686873",
          border: "#E8DDE1",
          ok: "#159A70",
          warn: "#B26A00",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        manrope: ["Manrope", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.75rem",
      },
      boxShadow: {
        glass:
          "0 18px 46px -26px rgba(76,16,40,0.20), inset 0 1px 0 rgba(255,255,255,0.9)",
        "glass-lift":
          "0 32px 72px -32px rgba(76,16,40,0.28), 0 0 0 1px rgba(233,30,77,0.07), inset 0 1px 0 rgba(255,255,255,0.95)",
        "glow-red": "0 0 70px -14px rgba(233,30,77,0.45)",
        "glow-red-sm": "0 0 34px -10px rgba(240,68,82,0.5)",
        "eu-card": "0 1px 2px rgba(23,23,28,0.04), 0 14px 34px -22px rgba(23,23,28,0.20)",
        "eu-lift": "0 2px 4px rgba(23,23,28,0.05), 0 28px 54px -26px rgba(23,23,28,0.26)",
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
