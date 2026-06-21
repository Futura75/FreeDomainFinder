import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1E6FCC",
          dark: "#1655A0",
        },
        accent: "#00CFB4",
        success: "#28C76F",
        warning: "#FF9F43",
        danger: "#EA5455",
        info: "#00CFE8",
        background: "#F4F5FA",
        surface: "#FFFFFF",
        border: "#DBDADE",
        ink: {
          DEFAULT: "#4B4A5C",
          muted: "#75717B",
        },
        // dark mode surfaces
        darkbg: "#25293C",
        darksurface: "#2F3349",
        darkborder: "#3F4460",
        darkink: "#CFD3EC",
      },
      fontFamily: {
        sans: ["var(--font-public)", "Public Sans", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(75,74,92,0.06), 0 1px 2px rgba(75,74,92,0.04)",
        cardDark: "0 1px 3px rgba(0,0,0,0.3)",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        pulseSoft: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.5" } },
      },
      animation: {
        fadeIn: "fadeIn 200ms ease-out",
        pulseSoft: "pulseSoft 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
