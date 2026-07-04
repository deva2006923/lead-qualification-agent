/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fefbf3",
          100: "#fdf6e2",
          200: "#fae7bb",
          300: "#f6d38c",
          400: "#f0b95c",
          500: "#d4af37", // Main Copper Gold Accent
          600: "#c59b27",
          700: "#a37c1c",
          800: "#826116",
          900: "#6a4e13",
          950: "#3e2c07",
        },
        surface: {
          900: "#07080e", // Pitch Black
          800: "#0d0f19", // Slate Navy panel background
          700: "#151824", // Muted Slate panels
          600: "#1e2233",
          500: "#2a2f47",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "fade-in":    "fadeIn 0.3s ease-out",
        "slide-down": "slideDown 0.25s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%":   { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
