import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { navLinks, profile } from '../data/content';

export function Nav() {
  const [active, setActive] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Active section tracking
  useEffect(() => {
    const sections = navLinks
      .map((l) => document.getElementById(l.id))
      .filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    const hero = document.getElementById('top');
    const heroIo = new IntersectionObserver(([e]) => e.isIntersecting && setActive(''), { rootMargin: '0px 0px -60% 0px' });
    if (hero) heroIo.observe(hero);
    return () => {
      io.disconnect();
      heroIo.disconnect();
    };
  }, []);

  // Hide on scroll down, reveal on scroll up
  useEffect(() => {
    let last = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        setScrolled(y > 24);
        if (Math.abs(y - last) > 6) {
          setHidden(y > last && y > 400);
          last = y;
        }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Sliding indicator pill
  const placePill = useCallback(() => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) return;
    const link = active ? list.querySelector<HTMLAnchorElement>(`a[data-id="${active}"]`) : null;
    if (!link) {
      pill.style.opacity = '0';
      return;
    }
    pill.style.opacity = '1';
    pill.style.width = `${link.offsetWidth}px`;
    pill.style.transform = `translateX(${link.offsetLeft}px)`;
  }, [active]);

  useLayoutEffect(() => {
    placePill();
  }, [placePill]);

  useEffect(() => {
    window.addEventListener('resize', placePill);
    document.fonts?.ready.then(placePill).catch(() => undefined);
    return () => window.removeEventListener('resize', placePill);
  }, [placePill]);

  // Mobile menu: Esc + scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black"
      >
        Skip to content
      </a>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${
          hidden && !open ? '-translate-y-full' : 'translate-y-0'
        }`}
      >
        <div
          className={`container-x flex h-[76px] items-center justify-between gap-4 transition-[background-color] duration-300 max-lg:rounded-b-2xl ${
            scrolled ? 'max-lg:bg-void/70 max-lg:backdrop-blur-md' : ''
          }`}
        >
          <a href="#top" className="group flex items-center gap-3" aria-label={`${profile.name} — back to top`}>
            <span className="relative grid h-10 w-10 place-items-center rounded-full border border-white/12 transition-colors duration-500 group-hover:border-gold/60" aria-hidden="true">
              <svg viewBox="0 0 40 40" className="h-7 w-7 transition-transform duration-700 group-hover:rotate-[120deg]">
                <circle cx="20" cy="20" r="13" fill="none" stroke="#d4b98a" strokeWidth="1.2" />
                <ellipse cx="20" cy="20" rx="13" ry="4.5" fill="none" stroke="#c9ccd3" strokeWidth="0.9" transform="rotate(-30 20 20)" />
                <circle cx="20" cy="20" r="3" fill="#ecebe7" />
              </svg>
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block font-display text-[13px] font-semibold uppercase tracking-[0.06em] [font-variation-settings:'wdth'_118]">Purushothaman</span>
              <span className="block font-mono text-[9.5px] uppercase tracking-[0.22em] text-muted">Full Stack Engineer</span>
            </span>
          </a>

          <nav aria-label="Primary" className="hidden lg:block">
            <div ref={listRef} className="glass relative flex items-center rounded-full px-2 py-1">
              <span ref={pillRef} className="nav-pill" style={{ opacity: 0 }} aria-hidden="true" />
              {navLinks.map((l) => (
                <a
                  key={l.id}
                  data-id={l.id}
                  href={`#${l.id}`}
                  className="nav-link"
                  aria-current={active === l.id ? 'true' : undefined}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="flex items-center gap-2">
            <a href="#contact" className="btn btn-ghost hidden !h-11 !px-5 md:inline-flex" data-magnetic>
              <span className="btn-inner">
                Let&apos;s talk <ArrowUpRight size={14} aria-hidden="true" />
              </span>
            </a>
            <button
              ref={toggleRef}
              type="button"
              className="glass grid h-11 w-11 place-items-center rounded-full lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      <div
        id="mobile-menu"
        className={`fixed inset-0 z-40 bg-void/95 backdrop-blur-xl transition-[opacity,visibility] duration-500 lg:hidden ${
          open ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
        aria-hidden={!open}
      >
        <nav aria-label="Mobile" className="container-x flex h-full flex-col justify-center gap-2 pt-16">
          {navLinks.map((l, i) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              tabIndex={open ? 0 : -1}
              onClick={() => setOpen(false)}
              className={`group flex items-baseline gap-4 border-b border-white/[0.06] py-4 display text-[2.6rem] transition-all duration-700 sm:text-6xl ${
                open ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
              } ${active === l.id ? 'text-fg' : 'text-fg/60'}`}
              style={{ transitionDelay: open ? `${80 + i * 50}ms` : '0ms' }}
            >
              <span className="font-mono text-xs text-gold">0{i + 1}</span>
              <span className="transition-transform duration-500 group-hover:translate-x-2">{l.label}</span>
            </a>
          ))}
          <a
            href={`mailto:${profile.email}`}
            tabIndex={open ? 0 : -1}
            className="mt-8 font-mono text-sm text-muted transition-colors hover:text-gold"
          >
            {profile.email}
          </a>
        </nav>
      </div>
    </>
  );
}
