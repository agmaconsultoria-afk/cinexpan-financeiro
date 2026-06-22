import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta "argila / terracota" da identidade Cinexpan
        brand: {
          50: "#fbf6f1",
          100: "#f5e8da",
          200: "#ebcfb3",
          300: "#ddae84",
          400: "#cd8a55",
          500: "#bf6f3a",
          600: "#a85a2f",
          700: "#8a4628",
          800: "#6f3925",
          900: "#5b3022",
          950: "#321810",
        },
        clay: {
          light: "#cd8a55",
          DEFAULT: "#a85a2f",
          dark: "#6f3925",
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
