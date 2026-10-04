import type { Config } from 'tailwindcss';
export default { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: { colors: { monad: '#836EF9', 'monad-light': '#beb2ff', surface: '#12121d' } } }, plugins: [] } satisfies Config;
