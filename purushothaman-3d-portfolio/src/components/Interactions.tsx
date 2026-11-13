import { useEffect } from 'react';
import { gsap } from '../lib/gsap';
import { useFinePointer, useReducedMotion } from '../lib/device';

/**
 * Global micro-interactions via event delegation (fine pointers only):
 *  - [data-magnetic] elements are pulled toward the cursor; their .btn-inner moves a little further (parallax)
 *  - .btn elements get a specular highlight that follows the pointer (--mx/--my)
 */
export function Interactions() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!fine || reduced) return;
    let current: HTMLElement | null = null;

    const release = (el: HTMLElement) => {
      const inner = el.querySelector('.btn-inner');
      gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
      if (inner) gsap.to(inner, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const target = e.target as Element | null;
      const mag = (target?.closest?.('[data-magnetic]') as HTMLElement | null) ?? null;
      if (mag !== current) {
        if (current) release(current);
        current = mag;
      }
      const btn = target?.closest?.('.btn') as HTMLElement | null;
      if (btn) {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', `${e.clientX - r.left}px`);
        btn.style.setProperty('--my', `${e.clientY - r.top}px`);
      }
      if (current) {
        const r = current.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        gsap.to(current, { x: dx * 0.28, y: dy * 0.38, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
        const inner = current.querySelector('.btn-inner');
        if (inner) gsap.to(inner, { x: dx * 0.12, y: dy * 0.16, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
      }
    };
    const onLeave = () => {
      if (current) release(current);
      current = null;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [fine, reduced]);

  return null;
}
