import type { Config } from "tailwindcss";

/**
 * Colours come from the VacancyPal logo:
 *   brand  — the blue pin/background gradient (#0071FA → #003BBC, core #0048C8)
 *   accent — the orange "person" swoosh (#F88000, highlight #FDA614)
 * Text on white: use brand-600+ / accent-700+ (accent-400..600 are for fills
 * with dark text, or decoration — they're too light for small white text).
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#eef5ff",
          100: "#d9e8ff",
          200: "#bcd6ff",
          300: "#8ebcff",
          400: "#4d97ff",
          500: "#0071fa",
          600: "#005ee8",
          700: "#0048c8",
          800: "#003bbc",
          900: "#062f8a",
          950: "#0a1f5c",
        },
        accent: {
          50: "#fff8ed",
          100: "#ffefd4",
          200: "#ffdba8",
          300: "#ffc170",
          400: "#fda614",
          500: "#fb9011",
          600: "#f88000",
          700: "#b85a00",
          800: "#8f4504",
          900: "#733a08",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
