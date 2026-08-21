/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#101614', raised: '#171f1c' },
        ink: '#e9ede9',
        field: { 500: '#2f8f60', 600: '#3fae76', 700: '#5cc48d' },
        rust: { 500: '#e0654a', 600: '#e88671' },
        amber: { 500: '#e0a736', 600: '#eabf5f' },
        slate: { 400: '#7c8a83', 500: '#a2ada7', 700: '#2a332f', 800: '#1c2320' }
      },
      fontFamily: { display: ['"Space Grotesk"', 'sans-serif'], sans: ['Inter', 'sans-serif'], mono: ['"IBM Plex Mono"', 'monospace'] },
      borderRadius: { card: '14px' }
    }
  },
  plugins: []
};
