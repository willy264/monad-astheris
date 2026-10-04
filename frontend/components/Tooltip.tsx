'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

export const glossary = {
  identity: 'An agent’s digital passport and résumé links its profile, capabilities and services. Registration records these claims without verifying them.',
  shard: 'Like a private express lane, each task gets its own storage. The data stays public, and speed is not guaranteed.',
  merkle: 'One compact receipt can represent many task results, for example 100. Batch sizes vary, and a matching receipt does not prove the work was correct.',
  passkey: 'Use Face ID or Touch ID with a supported wallet without managing a seed phrase yourself. Delegation still costs gas unless sponsored, and recovery depends on your wallet provider.',
} as const;

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  label?: string;
  className?: string;
}

/** Supply explanatory text, not interactive controls, as tooltip content. */
export default function Tooltip({ children, content, label, className }: TooltipProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const container = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const openAtPointerDown = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>();

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }
  function show() { cancelClose(); setOpen(true); }
  function hide() { cancelClose(); setOpen(false); setPosition(undefined); }
  function closeSoon() {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (document.activeElement !== trigger.current) hide();
    }, 120);
  }

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (!trigger.current || !popup.current) return;
      const target = trigger.current.getBoundingClientRect();
      const box = popup.current.getBoundingClientRect();
      const margin = 12;
      const above = target.top - box.height - 10;
      setPosition({
        left: Math.max(margin, Math.min(window.innerWidth - box.width - margin, target.left + target.width / 2 - box.width / 2)),
        top: Math.max(margin, Math.min(window.innerHeight - box.height - margin, above >= margin ? above : target.bottom + 10)),
      });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, content]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (!container.current?.contains(event.target) && !popup.current?.contains(event.target)) hide();
    }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') hide(); }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  useEffect(() => () => cancelClose(), []);

  return <span ref={container} className={`${styles.root}${className ? ` ${className}` : ''}`}
    onPointerEnter={event => { if (event.pointerType !== 'touch') show(); }} onPointerLeave={closeSoon}>
    <span>{children}</span>
    <button ref={trigger} type="button" className={styles.trigger}
      aria-label={label ?? (typeof children === 'string' ? `Explain ${children}` : 'Show explanation')}
      aria-describedby={open ? id : undefined} aria-expanded={open}
      onFocus={show} onBlur={hide}
      onPointerDown={() => { openAtPointerDown.current = open; }}
      onClick={event => {
        const shouldClose = event.detail === 0 ? open : openAtPointerDown.current;
        if (shouldClose) hide(); else show();
      }}>
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 9v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="6" r=".9" fill="currentColor" />
      </svg>
    </button>
    {open && createPortal(<span ref={popup} id={id} role="tooltip" className={styles.popup}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
      onPointerEnter={cancelClose} onPointerLeave={closeSoon}>{content}</span>, document.body)}
  </span>;
}
