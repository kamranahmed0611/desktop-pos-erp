/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./pos-core/index.html",
    "./pos-core/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          50: '#F0F5F6',
          100: '#E1EAEC',
          200: '#C4D5D9',
          300: '#9FBBC1',
          400: '#7B9FA8',
          500: '#5B7981', // Requested primary slate teal
          600: '#486269',
          700: '#384D53',
          800: '#2A393E',
          900: '#1C272A',
        },
        sand: {
          50: '#FAF7F2',
          100: '#F5EDE1',
          200: '#E8DCB',
          300: '#E3D5C0', // Requested warm sand cream
          400: '#D5C4A8',
          500: '#C7B18F',
          600: '#A99371',
          700: '#867254',
          800: '#63533C',
          900: '#423727',
        }
      },
      fontFamily: {
        heading: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
