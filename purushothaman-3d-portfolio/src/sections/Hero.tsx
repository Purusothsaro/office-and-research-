import { useLayoutEffect, useRef } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { gsap } from '../lib/gsap';
import { useReducedMotion } from '../lib/device';
import { revealed } from '../lib/sceneInput';
import { profile } from '../data/content';

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    if (reduced) return;
    const ctx = gsap.context(() => {
      // initial state is set synchronously so nothing flashes under the loader
      gsap.set('[data-hero-line]', { yPercent: 112 });
      gsap.set('[data-hero-fade]', { y: 24, opacity: 0 });
      gsap.set('[data-hero-rule]', { scaleX: 0 });

      const tl = gsap.timeline({ paused: true });
      tl.to('[data-hero-line]', { yPercent: 0, duration: 1.5, stagger: 0.12, ease: 'expo.out' })
        .to('[data-hero-rule]', { scaleX: 1, duration: 1.4, ease: 'expo.inOut' }, 0.35)
        .to('[data-hero-fade]', { y: 0, opacity: 1, duration: 1.1, stagger: 0.07, ease: 'expo.out' }, 0.55);
      revealed.then(() => tl.play());

      // scroll-out: lines drift at different rates (parallax), copy dims
      gsap.utils.toArray<HTMLElement>('[data-hero-row]').forEach((row, i) => {
        gsap.to(row, {
          y: -(60 + i * 45),
          ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
        });
      });
      gsap.to('[data-hero-copy]', {
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: '20% top', end: '75% top', scrub: true },
      });
    }, root);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section ref={root} id="top" aria-labelledby="hero-title" className="relative flex min-h-[116svh] flex-col lg:min-h-[100svh]">
      <div data-hero-copy className="container-x relative flex flex-1 flex-col justify-end pb-32 pt-36 lg:pb-28">
        <div data-hero-fade className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-fg/80">
            <span className="pulse-dot" /> Open to building what&apos;s next
          </span>
          <span className="hidden h-px w-12 bg-white/20 sm:block" />
          <span className="eyebrow hidden sm:inline">{profile.role}</span>
        </div>

        <h1 id="hero-title" className="display text-[clamp(2.3rem,7.1vw,8.4rem)] text-fg">
          <span className="sr-only">Engineering the Digital Experience.</span>
          <span aria-hidden="true">
            <span data-hero-row className="mask-line">
              <span data-hero-line>Engineering</span>
            </span>
            <span data-hero-row className="mask-line">
              <span data-hero-line>
                <span className="serif-accent pr-[0.18em] text-gold" style={{ fontSize: '1.08em' }}>
                  the
                </span>
                Digital
              </span>
            </span>
            <span data-hero-row className="mask-line">
              <span data-hero-line className="metal-text">Experience.</span>
            </span>
          </span>
        </h1>

        <div data-hero-rule className="rule mt-10 w-full max-w-3xl origin-left" />

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,34rem)_1fr] lg:items-end">
          <p data-hero-fade className="max-w-xl text-base leading-[1.75] text-muted sm:text-lg">
            Full Stack Software Engineer building scalable products, intelligent platforms and meaningful digital experiences.
          </p>
          <div data-hero-fade className="flex flex-wrap gap-3 lg:justify-end lg:pr-[8%]">
            <a href="#projects" className="btn btn-primary" data-magnetic>
              <span className="btn-inner">
                Explore projects <ArrowDownRight size={16} aria-hidden="true" />
              </span>
            </a>
            <a href="#contact" className="btn btn-ghost" data-magnetic>
              <span className="btn-inner">
                Contact me <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </a>
          </div>
        </div>
      </div>

      {/* bottom rail */}
      <div className="container-x absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 pb-7">
        <dl data-hero-fade className="flex flex-wrap gap-x-10 gap-y-2">
          <div>
            <dt className="eyebrow !text-dim">Location</dt>
            <dd className="mt-1 text-sm text-fg/85">Chennai, India</dd>
          </div>
          <div>
            <dt className="eyebrow !text-dim">Experience</dt>
            <dd className="mt-1 text-sm text-fg/85">{profile.experience} · OctoGenie</dd>
          </div>
        </dl>
        <a
          data-hero-fade
          href="#about"
          className="flex flex-col items-center gap-3 text-muted transition-colors hover:text-fg"
          aria-label="Scroll to About section"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.3em]">Scroll</span>
          <span className="scroll-cue-line" />
        </a>
        <span data-hero-fade className="eyebrow hidden md:block">{profile.coords}</span>
      </div>
    </section>
  );
}
