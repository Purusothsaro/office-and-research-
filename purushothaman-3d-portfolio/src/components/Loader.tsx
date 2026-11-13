import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from '../lib/gsap';
import { prefersReducedMotion } from '../lib/device';
import { markRevealed, sceneReady } from '../lib/sceneInput';
import { profile } from '../data/content';

/** Elegant loading transition: 000→100 counter, hairline progress, then a curtain lift that hands off to the hero intro. */
export function Loader() {
  const [gone, setGone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!prefersReducedMotion()) document.documentElement.classList.add('is-loading');
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (prefersReducedMotion()) {
      markRevealed();
      html.classList.remove('is-loading');
      setGone(true);
      return;
    }
    const start = performance.now();
    const MIN = 1100;
    const MAX = 3400;
    let ready = false;
    let shown = 0;
    let raf = 0;
    let finished = false;
    let tl: gsap.core.Timeline | null = null;
    const timeout = new Promise<void>((r) => window.setTimeout(r, MAX));
    Promise.race([Promise.all([document.fonts?.ready ?? Promise.resolve(), sceneReady]), timeout]).then(() => (ready = true));

    const finish = () => {
      finished = true;
      tl = gsap.timeline({
        onComplete: () => {
          html.classList.remove('is-loading');
          setGone(true);
        },
      });
      tl.to('[data-loader-fade]', { yPercent: -110, opacity: 0, duration: 0.7, ease: 'power3.in', stagger: 0.05 })
        .to(root.current, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.15, ease: 'power4.inOut' }, '-=0.25')
        .add(() => markRevealed(), '-=0.8');
    };

    const loop = () => {
      const elapsed = performance.now() - start;
      const target = ready ? 100 : Math.min(88, (elapsed / MAX) * 120);
      shown += (target - shown) * (ready ? 0.12 : 0.06);
      if (count.current) count.current.textContent = String(Math.round(shown)).padStart(3, '0');
      if (bar.current) bar.current.style.transform = `scaleX(${shown / 100})`;
      if (ready && shown > 99.4 && elapsed > MIN && !finished) {
        if (count.current) count.current.textContent = '100';
        finish();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      // StrictMode/unmount safety: never leave the page locked or the hero unrevealed
      if (tl) tl.progress(1);
      if (finished) markRevealed();
    };
  }, []);

  if (gone) return null;
  return (
    <div ref={root} className="loader flex flex-col justify-between p-[var(--gutter)]" style={{ clipPath: 'inset(0% 0% 0% 0%)' }} aria-hidden="true">
      <div className="flex items-start justify-between gap-4 overflow-hidden">
        <span data-loader-fade className="eyebrow">{profile.name}</span>
        <span data-loader-fade className="eyebrow hidden sm:block">Portfolio — MMXXVI</span>
      </div>
      <div className="overflow-hidden">
        <p data-loader-fade className="display text-[clamp(1.3rem,3vw,2.4rem)] text-fg/90">
          Engineering <span className="serif-accent text-gold">the</span> digital experience
        </p>
      </div>
      <div>
        <div className="flex items-end justify-between gap-4 overflow-hidden">
          <span data-loader-fade className="eyebrow pb-3">Calibrating</span>
          <span data-loader-fade className="display metal-text text-[clamp(4rem,14vw,11rem)] !leading-none">
            <span ref={count}>000</span>
          </span>
        </div>
        <div className="mt-4 h-px w-full bg-white/10">
          <div ref={bar} className="h-full origin-left bg-gold" style={{ transform: 'scaleX(0)' }} />
        </div>
      </div>
    </div>
  );
}
