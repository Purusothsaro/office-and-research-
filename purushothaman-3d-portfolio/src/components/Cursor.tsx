import { useEffect, useRef } from 'react';
import { useFinePointer, useReducedMotion } from '../lib/device';

/** Desktop cursor: precise champagne dot + trailing ring that grows on interactive elements and shows context labels. */
export function Cursor() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!fine || reduced) return;
    const html = document.documentElement;
    html.classList.add('has-custom-cursor');
    let tx = -100, ty = -100, rx = -100, ry = -100, dx = -100, dy = -100;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX;
      ty = e.clientY;
      if (ring.current) ring.current.style.opacity = '1';
      const t = e.target as Element | null;
      const labelled = t?.closest?.('[data-cursor-label]') as HTMLElement | null;
      const interactive = !!t?.closest?.('a, button, [role="button"], input, [data-cursor="hover"]');
      ring.current?.classList.toggle('has-label', !!labelled);
      ring.current?.classList.toggle('is-hover', interactive && !labelled);
      if (label.current) label.current.textContent = labelled?.dataset.cursorLabel ?? '';
      if (dot.current) dot.current.style.opacity = labelled ? '0' : '1';
    };
    const hide = () => {
      if (dot.current) dot.current.style.opacity = '0';
      if (ring.current) ring.current.style.opacity = '0';
    };
    const loop = () => {
      dx += (tx - dx) * 0.55;
      dy += (ty - dy) * 0.55;
      rx += (tx - rx) * 0.18;
      ry += (ty - ry) * 0.18;
      if (dot.current) dot.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    html.addEventListener('pointerleave', hide);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      html.classList.remove('has-custom-cursor');
      window.removeEventListener('pointermove', onMove);
      html.removeEventListener('pointerleave', hide);
    };
  }, [fine, reduced]);

  if (!fine || reduced) return null;
  return (
    <>
      <div ref={ring} className="cursor-ring" style={{ opacity: 0 }} aria-hidden="true">
        <span ref={label} className="cursor-label" />
      </div>
      <div ref={dot} className="cursor-dot" style={{ opacity: 0 }} aria-hidden="true" />
    </>
  );
}
