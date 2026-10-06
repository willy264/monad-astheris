import type { ReactNode } from 'react';
import Header from './Header';
import styles from './Shell.module.css';

export function Shell({ children }: { children: ReactNode }) {
  return <div className={styles.shell}><Header /><main className={styles.main} id="main-content">{children}</main><footer className={styles.footer}><span>Independent tasks. Verifiable receipts. Aetheris on Monad.</span><a href="https://eips.ethereum.org/EIPS/eip-8004" target="_blank" rel="noreferrer">ERC-8004 identity · Built for parallel execution ↗</a></footer></div>;
}
