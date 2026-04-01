/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        neon: {
          cyan: "#00ffff",
          lime: "#ccff00",
          pink: "#ff0055",
          green: "#39ff14",
        },
      },
      boxShadow: {
        "neon-cyan": "0 0 18px rgba(0, 255, 255, 0.42)",
        "neon-lime": "0 0 18px rgba(204, 255, 0, 0.4)",
      },
    },
  },
  plugins: [],
};
