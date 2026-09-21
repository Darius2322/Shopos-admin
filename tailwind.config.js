/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every existing bg-paper / text-ink / border-slate-* class keeps
        // working unchanged — the values now come from CSS variables
        // (defined in index.css) that flip when the `dark` class is on
        // <html>, so the whole app gets a dark theme without editing every
        // component individually.
        paper: {
          DEFAULT: 'rgb(var(--color-paper) / <alpha-value>)',
          raised: 'rgb(var(--color-paper-raised) / <alpha-value>)'
        },
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        field: {
          50: 'rgb(var(--color-field-50) / <alpha-value>)',
          100: 'rgb(var(--color-field-100) / <alpha-value>)',
          300: 'rgb(var(--color-field-300) / <alpha-value>)',
          500: 'rgb(var(--color-field-500) / <alpha-value>)',
          600: 'rgb(var(--color-field-600) / <alpha-value>)',
          700: 'rgb(var(--color-field-700) / <alpha-value>)'
        },
        rust: {
          50: 'rgb(var(--color-rust-50) / <alpha-value>)',
          500: 'rgb(var(--color-rust-500) / <alpha-value>)',
          600: 'rgb(var(--color-rust-600) / <alpha-value>)'
        },
        amber: {
          50: 'rgb(var(--color-amber-50) / <alpha-value>)',
          100: 'rgb(var(--color-amber-100) / <alpha-value>)',
          500: 'rgb(var(--color-amber-500) / <alpha-value>)',
          600: 'rgb(var(--color-amber-600) / <alpha-value>)'
        },
        slate: {
          50: 'rgb(var(--color-slate-50) / <alpha-value>)',
          200: 'rgb(var(--color-slate-200) / <alpha-value>)',
          500: 'rgb(var(--color-slate-500) / <alpha-value>)',
          600: 'rgb(var(--color-slate-600) / <alpha-value>)'
        }
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      },
      borderRadius: { card: '14px' }
    }
  },
  plugins: []
};
