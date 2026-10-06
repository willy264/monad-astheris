import type { Config } from 'tailwindcss';
export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx,mdx}', './components/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        monad: { DEFAULT: '#836EF9', purple: '#836EF9', violet: '#A084DC', dark: '#08090E', card: '#11131F', border: '#1E2230' },
        'monad-light': '#C4B5FD', surface: '#11131F', express: '#10B981', jam: '#EF4444',
      },
      boxShadow: { 'glow-purple': '0 0 25px -5px rgba(131,110,249,.3)', 'glow-green': '0 0 20px -5px rgba(16,185,129,.3)' },
    },
  },
  plugins: [],
} satisfies Config;
