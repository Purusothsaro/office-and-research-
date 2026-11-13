import { useCallback, useRef } from 'react';

/**
 * Pointer-driven 3D tilt + glow position. Writes CSS variables only (no React re-render).
 * Disabled for touch / coarse pointers by the caller passing enabled=false.
 */
export function useTilt<T extends HTMLElement>(max = 8, enabled = true) {
  const ref = useRef<T>(null);
  const frame = useRef(0);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      const el = ref.current;
      if (!el || e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        el.style.setProperty('--mx', `${px * 100}%`);
        el.style.setProperty('--my', `${py * 100}%`);
        if (enabled) {
          el.classList.add('is-tilting');
          el.style.setProperty('--rx', `${(0.5 - py) * max}deg`);
          el.style.setProperty('--ry', `${(px - 0.5) * max}deg`);
        }
      });
    },
    [max, enabled],
  );

  const onPointerLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    el.classList.remove('is-tilting');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}
