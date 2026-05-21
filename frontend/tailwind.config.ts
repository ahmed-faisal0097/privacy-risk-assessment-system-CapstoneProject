import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      colors: {
        /* Healthcare Privacy Intelligence Platform palette */
        brand: {
          /* Primary — Deep Medical Blue */
          blue:       "#1E3A8A",
          "blue-mid": "#2563EB",
          "blue-lt":  "#3B82F6",
          /* Secondary — Healthcare Cyan */
          cyan:       "#0891B2",
          "cyan-lt":  "#06B6D4",
          /* Accent — Analytical Emerald */
          emerald:    "#059669",
          /* Backgrounds */
          bg:         "#F1F5F9",
          surface:    "#FFFFFF",
          /* Text */
          text:       "#0F172A",
          muted:      "#475569",
          /* Borders */
          border:     "#CBD5E1",
          "border-lt":"#E2E8F0",
          /* Risk */
          "risk-high":   "#DC2626",
          "risk-medium": "#F59E0B",
          "risk-low":    "#10B981",
        },
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "20px",
      },
    },
  },
  plugins: [],
};

export default config;
