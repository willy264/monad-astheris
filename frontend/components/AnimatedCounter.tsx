'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './AnimatedCounter.module.css';

interface AnimatedCounterProps {
  value: number;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  locale?: string;
  duration?: number;
  className?: string;
}

export default function AnimatedCounter({ value, maximumFractionDigits = 0, minimumFractionDigits = 0, locale = 'en-US', duration = 650, className }: AnimatedCounterProps) {
  const valid = Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  const target = valid ? value : 0;
  const [display, setDisplay] = useState(0);
  const current = useRef(0);
  const frame = useRef<number>();
  const formatter = useMemo(() => {
    const maximum = Number.isFinite(maximumFractionDigits) ? Math.min(20, Math.max(0, Math.trunc(maximumFractionDigits))) : 0;
    const minimum = Number.isFinite(minimumFractionDigits) ? Math.min(maximum, Math.max(0, Math.trunc(minimumFractionDigits))) : 0;
    const options = { maximumFractionDigits: maximum, minimumFractionDigits: minimum };
    try { return new Intl.NumberFormat(locale, options); }
    catch { return new Intl.NumberFormat('en-US', options); }
  }, [locale, maximumFractionDigits, minimumFractionDigits]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cancel = () => { if (frame.current !== undefined) cancelAnimationFrame(frame.current); };
    const finish = () => { cancel(); current.current = target; setDisplay(target); };
    const milliseconds = Number.isFinite(duration) ? Math.min(2000, Math.max(0, duration)) : 0;
    cancel();
    const start = current.current;
    if (!valid || preference.matches || milliseconds === 0 || start === target) {
      finish();
      return cancel;
    }
    let started: number | undefined;
    function tick(now: number) {
      started ??= now;
      const progress = Math.min(1, (now - started) / milliseconds);
      const eased = 1 - (1 - progress) ** 3;
      const next = progress === 1 ? target : start + (target - start) * eased;
      current.current = next;
      setDisplay(next);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    }
    const onPreferenceChange = () => { if (preference.matches) finish(); };
    preference.addEventListener('change', onPreferenceChange);
    frame.current = requestAnimationFrame(tick);
    return () => { cancel(); preference.removeEventListener('change', onPreferenceChange); };
  }, [target, valid, duration]);

  const finalValue = valid ? formatter.format(target) : 'Unavailable';
  return <span className={`${styles.counter}${className ? ` ${className}` : ''}`}>
    <span aria-hidden="true">{valid ? formatter.format(display) : '—'}</span>
    <span className={styles.accessible}>{finalValue}</span>
  </span>;
}
