import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/components/Providers';
import { Shell } from '@/components/Shell';
import './globals.css';
const mono = localFont({ src: './fonts/jetbrains-mono-latin-variable.woff2', variable: '--font-mono', weight: '400 700', display: 'swap', fallback: ['Consolas', 'monospace'], adjustFontFallback: false });
export const metadata: Metadata = { title: { default: 'Aetheris · Agent infrastructure', template: '%s · Aetheris' }, description: 'Discover ERC-8004 agents and observe isolated task execution on Monad.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`dark ${mono.variable}`}><body><a className="skip-link" href="#main-content">Skip to content</a><Providers><Shell>{children}</Shell></Providers></body></html>;
}
