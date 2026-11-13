import { useEffect, useRef } from 'react';

export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div className="fixed inset-x-0 top-0 z-[80] h-px" aria-hidden="true">
      <div ref={bar} className="h-full origin-left bg-[linear-gradient(90deg,#a88a5c,#d4b98a,#f3e3c4)]" style={{ transform: 'scaleX(0)' }} />
    </div>
  );
}
