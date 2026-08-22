import { useEffect, useRef, useState, type ReactNode } from 'react';

const EXIT_DURATION_MS = 180;

export function MotionPresence({ children }: { children: ReactNode }) {
  const present = children !== null && children !== false;
  const cached = useRef<ReactNode>(present ? children : null);
  const [mounted, setMounted] = useState(present);
  const [phase, setPhase] = useState<'entering' | 'open' | 'closing'>(present ? 'entering' : 'closing');

  if (present) cached.current = children;

  useEffect(() => {
    let frame = 0;
    let timer = 0;
    if (present) {
      setMounted(true);
      setPhase('entering');
      frame = window.requestAnimationFrame(() => setPhase('open'));
    } else if (mounted) {
      setPhase('closing');
      timer = window.setTimeout(() => setMounted(false), EXIT_DURATION_MS);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [mounted, present]);

  if (!mounted) return null;
  return <div className={`motion-presence ${phase}`}>{cached.current}</div>;
}
