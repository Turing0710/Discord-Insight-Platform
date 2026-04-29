import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        inkMuted: "#1e293b",
        brand: "#0ea5e9",
        mint: "#34d399"
      }
    }
  },
  plugins: []
};

export default config;
