import { useLayoutEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '../lib/gsap';
import { useReducedMotion } from '../lib/device';
import { experience } from '../data/content';
import { SectionHeading } from '../components/SectionHeading';
import { useTilt } from '../components/useTilt';

function RoleCard({ job }: { job: (typeof experience)[number] }) {
  const { ref, onPointerMove, onPointerLeave } = useTilt<HTMLElement>(3);
  return (
    <article ref={ref} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className="tilt glow-card rounded-[28px] bg-graphite/80 p-7 backdrop-blur-sm md:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{job.company}</p>
          <h3 className="display mt-3 text-[clamp(1.5rem,2.6vw,2.3rem)]">{job.role}</h3>
          <p className="mt-2 text-sm text-muted">{job.location}</p>
        </div>
        {job.current ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            <span className="pulse-dot !h-1.5 !w-1.5" /> Current
          </span>
        ) : null}
      </div>
      <p className="mt-6 leading-[1.75] text-fg/75">{job.summary}</p>
      <div className="rule my-7" />
      <ul className="space-y-3.5">
        {job.points.map((p, i) => (
          <li key={p} className="grid grid-cols-[2rem_1fr] text-[0.95rem] leading-[1.7] text-muted">
            <span className="pt-[0.2em] font-mono text-[10px] text-gold/80">{String(i + 1).padStart(2, '0')}</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-8 flex flex-wrap gap-2" aria-label="Technologies">
        {job.tags.map((t) => (
          <li key={t} className="chip">{t}</li>
        ))}
      </ul>
    </article>
  );
}

export function Experience() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const nodes = gsap.utils.toArray<HTMLElement>('[data-node]');
      if (reduced) {
        nodes.forEach((n) => n.classList.add('is-on'));
        gsap.set('[data-fill]', { scaleY: 1 });
        return;
      }
      gsap.fromTo('[data-fill]', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '[data-rail-wrap]', start: 'top 62%', end: 'bottom 62%', scrub: 0.6 } });
      nodes.forEach((n) => {
        ScrollTrigger.create({ trigger: n, start: 'top 62%', onEnter: () => n.classList.add('is-on'), onLeaveBack: () => n.classList.remove('is-on') });
      });
      gsap.utils.toArray<HTMLElement>('[data-job]').forEach((el) => {
        gsap.fromTo(
          el,
          { clipPath: 'inset(10% 6% 10% 6% round 28px)', opacity: 0, y: 50 },
          { clipPath: 'inset(0% 0% 0% 0% round 28px)', opacity: 1, y: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 84%' } },
        );
      });
      gsap.utils.toArray<HTMLElement>('[data-year]').forEach((el) => {
        gsap.fromTo(el, { yPercent: 30 }, { yPercent: -30, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
    }, root);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section ref={root} id="experience" aria-labelledby="experience-title" className="relative py-[var(--section-y)]">
      <div className="container-x">
        <SectionHeading
          id="experience-title"
          index="02"
          eyebrow="Experience"
          title="Career"
          accent="in production."
          intro="Production engineering across legal SaaS, documents, automation and Salesforce."
        />

        <ol data-rail-wrap className="relative">
          <div className="timeline-rail left-[6px] md:left-[calc(30%+6px)]" aria-hidden="true">
            <div data-fill className="timeline-fill" />
          </div>
          {experience.map((job) => (
            <li key={job.company} className="relative grid gap-6 pb-20 pl-10 last:pb-0 md:grid-cols-[30%_1fr] md:gap-0 md:pl-0">
              <div data-node className="timeline-node absolute left-0 top-3 md:left-[30%]" aria-hidden="true" />
              <div className="md:pr-14 md:text-right">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold">{job.period}</p>
                <p data-year className="year-outline mt-4 hidden text-[clamp(4rem,9vw,8.5rem)] md:block" aria-hidden="true">
                  {job.period.match(/\d{4}/)?.[0]}
                </p>
              </div>
              <div data-job className="md:pl-14">
                <RoleCard job={job} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
