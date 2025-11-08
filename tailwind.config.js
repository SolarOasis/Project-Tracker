/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-indigo': '#2c2b88',
        'brand-yellow': '#fac65b',
      }
    },
  },
  plugins: [],
}
