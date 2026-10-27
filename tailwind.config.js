/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Global MEDIPAL palette — premium navy, deep blue with teal / aqua
           accents on clean white and cool neutral surfaces.
           One shared system across Blood Bank, AI Doctor, E-UPCHAR and
           Ambulance.

           Token keys (`crimson`, `blush`) are intentionally retained: every
           component already references them, so the whole platform adopts the
           new brand without a component rewrite. */
        crimson: {
          DEFAULT: "#0B5FA5",
          bright: "#2E86DE",
          soft: "#0A3D75",
          /* Deep navy is retained purely for WebGL depth and shadow tinting. */
          deep: "#062A4E",
        },
        blush: {
          DEFAULT: "#E3EEF9",
          soft: "#F4F8FC",
        },
        /* Aqua / teal accent — used for highlights, badges and live indicators. */
        aqua: {
          DEFAULT: "#0E9AA7",
          bright: "#22D3EE",
          soft: "#0B7C86",
          tint: "#E4F6F8",
        },
        /* `ink` is the primary text colour; `line` is the default subtle border. */
        ink: {
          DEFAULT: "#0B1B2B",
          surface: "#FFFFFF",
        },
        content: {
          primary: "#0B1B2B",
          secondary: "#55697D",
        },
        line: "#DDE5EE",
        ok: "#0E9F6E",
        warn: "#B45309",
        danger: "#DC2626",
        glass: {
          highlight: "rgba(255,255,255,0.94)",
          surface: "rgba(255,255,255,0.8)",
          border: "rgba(255,255,255,0.9)",
        },
        /* E-UPCHAR shares the global palette; the token names are kept so the
           whole booking module adopts the redesign without a component rewrite. */
        eu: {
          red: "#0B5FA5",
          "red-deep": "#0A3D75",
          "red-tint": "#F4F8FC",
          bg: "#FFFFFF",
          surface: "#F6F9FC",
          text: "#0B1B2B",
          muted: "#55697D",
          border: "#DDE5EE",
          ok: "#0E9F6E",
          warn: "#B45309",
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
          "0 14px 38px -26px rgba(6,42,78,0.20), inset 0 1px 0 rgba(255,255,255,0.9)",
        "glass-lift":
          "0 26px 60px -32px rgba(6,42,78,0.26), 0 0 0 1px rgba(11,95,165,0.07), inset 0 1px 0 rgba(255,255,255,0.95)",
        "glow-red": "0 0 60px -16px rgba(11,95,165,0.38)",
        "glow-red-sm": "0 0 30px -12px rgba(46,134,222,0.42)",
        "glow-aqua": "0 0 40px -14px rgba(14,154,167,0.42)",
        "eu-card": "0 1px 2px rgba(11,27,43,0.04), 0 14px 34px -22px rgba(11,27,43,0.18)",
        "eu-lift": "0 2px 4px rgba(11,27,43,0.05), 0 26px 50px -26px rgba(11,27,43,0.24)",
        "eu-inset": "inset 0 1px 0 rgba(255,255,255,0.9)",
      },
      backdropBlur: {
        xs: "2px",
        glass: "18px",
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
