import { useLayoutEffect } from 'react';
import { gsap, ScrollTrigger } from './lib/gsap';
import { useReducedMotion } from './lib/device';
import { Nav } from './components/Nav';
import { Cursor } from './components/Cursor';
import { Loader } from './components/Loader';
import { Interactions } from './components/Interactions';
import { HeroStage } from './components/HeroStage';
import { ScrollProgress } from './components/ScrollProgress';
import { SharedCanvasHost } from './components/SharedCanvasHost';
import { Interlude } from './components/Interlude';
import { Hero } from './sections/Hero';
import { About } from './sections/About';
import { Experience } from './sections/Experience';
import { Skills } from './sections/Skills';
import { Projects } from './sections/Projects';
import { Education } from './sections/Education';
import { Contact } from './sections/Contact';

export default function App() {
  const reduced = useReducedMotion();

  // Global reveal system: [data-reveal] blocks + editorial section headings (hairline draw → masked lines).
  useLayoutEffect(() => {
    const html = document.documentElement;
    if (reduced) {
      html.classList.remove('js-anim');
      return;
    }
    html.classList.add('js-anim');
    const ctx = gsap.context(() => {
      gsap.set('[data-reveal]', { y: 36 });
      ScrollTrigger.batch('[data-reveal]', {
        start: 'top 90%',
        once: true,
        onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 1.2, stagger: 0.09, overwrite: true }),
      });
      gsap.utils.toArray<HTMLElement>('[data-heading]').forEach((h) => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: h, start: 'top 86%', once: true } });
        const line = h.querySelector('[data-heading-line]');
        if (line) tl.from(line, { scaleX: 0, duration: 1.1, ease: 'expo.inOut' }, 0);
        const masks = h.querySelectorAll('[data-mask]');
        if (masks.length) tl.from(masks, { yPercent: 112, duration: 1.4, stagger: 0.12, ease: 'expo.out' }, 0.15);
      });
    });

    // Deep links (/#projects): the browser jumps before fonts/pins settle, so re-apply the hash once layout is final.
    let hashFixed = false;
    const refresh = () => {
      ScrollTrigger.refresh();
      if (hashFixed || !location.hash || location.hash === '#top') return;
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) {
        hashFixed = true;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: 'auto' });
      }
    };
    if (document.readyState === 'complete') document.fonts?.ready.then(refresh).catch(() => undefined);
    else window.addEventListener('load', () => document.fonts?.ready.then(refresh).catch(refresh), { once: true });
    return () => {
      ctx.revert();
      html.classList.remove('js-anim');
    };
  }, [reduced]);

  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <HeroStage />
      <div className="grain" aria-hidden="true" />
      <Loader />
      <ScrollProgress />
      <Cursor />
      <Interactions />
      <Nav />
      <SharedCanvasHost />
      <main id="main" tabIndex={-1} className="relative z-10 outline-none">
        <Hero />
        <About />
        <Interlude kind="neural" />
        <Experience />
        <Interlude kind="code" flip />
        <Skills />
        <Interlude kind="chip" />
        <Projects />
        <Interlude kind="cloud" flip />
        <Education />
        <Contact />
      </main>
    </>
  );
}
