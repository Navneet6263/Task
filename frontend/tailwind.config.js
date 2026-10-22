/** @type {import('tailwindcss').Config} */
// Colors come from CSS variables in src/styles/tokens.css, so light and dark mode
// swap in one place and components never need `dark:` variants.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        subtle: token('subtle'),
        ink: token('ink'),
        muted: token('muted'),
        line: token('line'),
        accent: { DEFAULT: token('accent'), fg: token('accent-fg'), soft: token('accent-soft') },
        warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
      },
      borderColor: { DEFAULT: token('line') },
      fontFamily: {
        sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        pop: '0 12px 32px -8px rgb(0 0 0 / 0.22)',
      },
      // Short entrance motions. Use with `motion-safe:` so reduced-motion users get none.
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-in': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'none' } },
        'grow-y': { '0%': { transform: 'scaleY(0)' }, '100%': { transform: 'scaleY(1)' } },
        'grow-x': { '0%': { transform: 'scaleX(0)' }, '100%': { transform: 'scaleX(1)' } },
      },
      animation: {
        'fade-up': 'fade-up .4s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fade-in .2s ease-out both',
        'slide-in': 'slide-in .3s cubic-bezier(.2,.7,.2,1) both',
        'grow-y': 'grow-y .7s cubic-bezier(.2,.7,.2,1) both',
        'grow-x': 'grow-x .7s cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
}
