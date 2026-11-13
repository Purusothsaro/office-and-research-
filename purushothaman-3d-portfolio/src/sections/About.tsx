import { useLayoutEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { gsap } from '../lib/gsap';
import { useReducedMotion } from '../lib/device';
import { profile, stats } from '../data/content';
import { SectionHeading } from '../components/SectionHeading';

const focus = ['Legal Technology', 'Document Platforms', 'Office Suites', 'Payments', 'Court Automation', 'Mobile Apps', 'E-Signatures', 'OCR'];

export function About() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    if (reduced) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
        const end = Number(el.dataset.count);
        const obj = { v: 0 };
        gsap.to(obj, {
          v: end,
          duration: 2.2,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          onUpdate: () => {
            el.textContent = String(Math.round(obj.v));
          },
        });
      });
      // the lead paragraph "develops" word by word with scroll
      gsap.fromTo(
        '[data-lead-word]',
        { opacity: 0.14 },
        { opacity: 1, stagger: 0.05, ease: 'none', scrollTrigger: { trigger: '[data-lead]', start: 'top 82%', end: 'bottom 50%', scrub: true } },
      );
      gsap.fromTo('[data-spec]', { opacity: 0, x: -20 }, { opacity: 1, x: 0, stagger: 0.08, duration: 1, scrollTrigger: { trigger: '[data-specs]', start: 'top 85%' } });
      gsap.fromTo('[data-marquee]', { xPercent: 0 }, { xPercent: -12, ease: 'none', scrollTrigger: { trigger: '[data-marquee]', start: 'top bottom', end: 'bottom top', scrub: true } });
    }, root);
    return () => ctx.revert();
  }, [reduced]);

  const lead = 'I build software that helps people get real work done — from legal case management to document workflows and mobile experiences.';

  return (
    <section ref={root} id="about" aria-labelledby="about-title" className="relative py-[var(--section-y)]">
      <div className="container-x">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          {/* left: stage for the travelling Astrolabe (rendered by the fixed hero stage) */}
          <div className="relative hidden min-h-[70vh] lg:block" aria-hidden="true">
            <div data-specs className="absolute left-0 top-2 space-y-3">
              <p data-spec className="eyebrow !text-dim">Fig. 02 — Astrolabe, reconfigured</p>
              <p data-spec className="font-mono text-[11px] text-muted">Core · Chrome / faceted</p>
              <p data-spec className="font-mono text-[11px] text-muted">Rings · Champagne · Brushed · Graphite</p>
              <p data-spec className="font-mono text-[11px] text-muted">Bezel · 72 machined indices</p>
            </div>
          </div>

          <div>
            <SectionHeading id="about-title" index="01" eyebrow="About" title="Engineering" accent="with real purpose." />
            <p data-lead className="font-display text-[clamp(1.35rem,2.4vw,2.05rem)] font-medium leading-[1.3] tracking-[-0.01em] text-fg">
              {lead.split(' ').map((w, i) => (
                <span key={i} data-lead-word>
                  {w}{' '}
                </span>
              ))}
            </p>
            <div className="rule mt-12" data-reveal />
            <div className="mt-10 grid gap-8 text-[0.98rem] leading-[1.8] text-muted sm:grid-cols-2" data-reveal>
              <p>
                At <span className="text-fg">OctoGenie Private Limited</span>, I work across the full product lifecycle — frontend experiences, backend APIs, mobile applications, integrations and production infrastructure.
              </p>
              <p>
                My primary work is <span className="text-fg">Just4Lawyer</span>, a multi-tenant legal-practice platform shipped as a React web app and a Flutter mobile app on a Node.js and MongoDB API.
              </p>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4" data-reveal>
              <a href={profile.linkedin} target="_blank" rel="noreferrer" className="btn btn-ghost !h-12" data-magnetic>
                <span className="btn-inner">
                  LinkedIn <ArrowUpRight size={15} aria-hidden="true" />
                </span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <span className="eyebrow">{profile.location}</span>
            </div>
          </div>
        </div>

        <ul data-stage-end className="mt-28 grid grid-cols-2 border-t border-white/[0.08] lg:grid-cols-4" aria-label="Key facts">
          {stats.map((s, i) => (
            <li
              key={s.label}
              className={`border-b border-white/[0.08] py-9 pr-6 lg:border-b-0 ${i % 2 === 1 ? 'pl-6 lg:pl-0' : ''} ${i > 0 ? 'lg:border-l lg:pl-8' : ''}`}
              data-reveal
            >
              <p className="display text-[clamp(2.8rem,5.5vw,5rem)]">
                <span aria-hidden="true">
                  {'prefix' in s ? <span className="serif-accent text-gold">{s.prefix}</span> : null}
                  <span data-count={s.value} className="metal-text">
                    {reduced ? s.value : 0}
                  </span>
                  {'suffix' in s ? <span className="serif-accent text-gold">{s.suffix}</span> : null}
                </span>
                <span className="sr-only">
                  {'prefix' in s ? 'About ' : ''}
                  {s.value}
                  {'suffix' in s ? s.suffix : ''}
                </span>
              </p>
              <p className="mt-4 max-w-[18ch] text-sm leading-snug text-muted">{s.label}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="marquee mt-24 overflow-hidden py-4" aria-hidden="true">
        <div data-marquee>
          <div className="marquee-track">
            {[...focus, ...focus].map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-10 px-5 font-display text-4xl font-semibold uppercase tracking-[-0.02em] text-white/[0.09] [font-variation-settings:'wdth'_118] md:text-6xl"
              >
                {f}
                <span className="serif-accent text-2xl normal-case text-gold/50">✦</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
