/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#06060A",
          900: "#0A0A11",
          850: "#0E0E17",
          800: "#12121D",
          700: "#1A1A28",
          600: "#262636",
        },
        muted: "#8E8EA3",
        accent: "#8B5CF6",
        lime: "#D6FF3D",
        cyan: "#22D3EE",
      },
      fontFamily: {
        sans: [
          "Inter",
          "Segoe UI Variable",
          "Segoe UI",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        display: [
          "Segoe UI Variable Display",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        mono: ["Cascadia Code", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(139, 92, 246, 0.55)",
        card: "0 24px 60px -30px rgba(0, 0, 0, 0.9)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-600px 0" },
          "100%": { backgroundPosition: "600px 0" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        pulseSoft: {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        spinSlow: { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        shimmer: "shimmer 1.8s linear infinite",
        float: "float 6s ease-in-out infinite",
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite",
        rise: "rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        spinSlow: "spinSlow 14s linear infinite",
      },
    },
  },
  plugins: [],
};
