/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 50: '#eef2f8', 100: '#d9e2ef', 600: '#1f4e8c', 700: '#183d6e', 800: '#12305a', 900: '#0d2342' },
      },
      fontFamily: { sans: ['"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};
