/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // These resolve to CSS custom properties (see src/index.css) so
        // ThemeToggle can flip every one of them at once by toggling a
        // class on <html> — no per-component light/dark variants needed.
        paper: { DEFAULT: 'var(--color-paper)', raised: 'var(--color-paper-raised)' },
        ink: 'var(--color-ink)',
        field: { 500: 'var(--color-field-500)', 600: 'var(--color-field-600)', 700: 'var(--color-field-700)' },
        rust: { 500: 'var(--color-rust-500)', 600: 'var(--color-rust-600)' },
        amber: { 500: 'var(--color-amber-500)', 600: 'var(--color-amber-600)' },
        slate: { 400: 'var(--color-slate-400)', 500: 'var(--color-slate-500)', 700: 'var(--color-slate-700)', 800: 'var(--color-slate-800)' }
      },
      fontFamily: { display: ['"Space Grotesk"', 'sans-serif'], sans: ['Inter', 'sans-serif'], mono: ['"IBM Plex Mono"', 'monospace'] },
      borderRadius: { card: '14px' }
    }
  },
  plugins: []
};
