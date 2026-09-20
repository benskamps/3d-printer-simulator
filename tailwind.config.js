/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        printer: {
          dark: '#0f172a',
          card: '#1e293b',
          accent: '#38bdf8',
          border: '#334155',
          hotend: '#ef4444',
          bed: '#f97316',
          fan: '#06b6d4',
        },
      },
    },
  },
  plugins: [],
}
