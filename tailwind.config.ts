import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef5ff",
          100: "#d9e7ff",
          200: "#bcd5ff",
          300: "#8ebaff",
          400: "#5993ff",
          500: "#326bff",
          600: "#1a4af5",
          700: "#1539e1",
          800: "#1830b6",
          900: "#1a2f8f",
          950: "#151d57",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
