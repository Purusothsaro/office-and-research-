import { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { gsap, ScrollTrigger } from '../lib/gsap';
import { useFinePointer, useReducedMotion } from '../lib/device';
import { useViewActivity } from '../lib/viewActivity';
import { useSharedWebGL } from '../components/SharedCanvasHost';
import { projectFilters, projects, type Project, type ProjectFilter } from '../data/content';
import { SectionHeading } from '../components/SectionHeading';
import { ProjectVisual } from '../components/ProjectVisual';
import { ProjectDialog } from '../components/ProjectDialog';
import { useTilt } from '../components/useTilt';

const ProjectStage = lazy(() => import('../three/ProjectStages').then((m) => ({ default: m.ProjectStage })));

const figNames: Record<Project['visual'], string> = {
  lawyer: 'Balance & case files',
  draft: 'Sheets under OCR scan',
  courts: 'District · High · Supreme',
  esign: 'Pen, signature & seal',
  office: 'Docs · Sheets · Slides · PDF',
  feedback: 'Conversation & rating',
};

function ProjectCard({ project, index, total, webgl, onOpen }: { project: Project; index: number; total: number; webgl: boolean; onOpen: () => void }) {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const { ref, onPointerMove, onPointerLeave } = useTilt<HTMLDivElement>(5, fine);
  const css = <ProjectVisual kind={project.visual} accent={project.accent} />;
  const stageRef = useRef<HTMLDivElement>(null);
  useViewActivity(stageRef);

  return (
    <article
      data-card
      className="group relative grid w-full shrink-0 overflow-hidden rounded-[32px] border border-white/[0.07] bg-graphite/70 backdrop-blur-sm lg:h-[min(660px,calc(100svh-190px))] lg:w-[min(1180px,86vw)] lg:grid-cols-[0.95fr_1.1fr]"
      style={{ ['--accent' as string]: project.accent }}
      aria-labelledby={`p-${project.number}-title`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {/* copy */}
      <div className="relative z-10 flex min-h-0 flex-col p-7 sm:p-9 lg:p-11">
        <div className="flex items-center justify-between">
          <span className="eyebrow">
            <span className="text-gold">{project.number}</span> / {String(total).padStart(2, '0')}
          </span>
          <span className="eyebrow">{project.category}</span>
        </div>
        <div className="mt-8 lg:mt-auto">
          <h3 id={`p-${project.number}-title`} className={`display ${project.title.length > 14 ? "text-[clamp(1.7rem,2.9vw,2.8rem)]" : "text-[clamp(2rem,4vw,3.8rem)]"}`}>
            <span className="mask-line">
              <span data-card-title>{project.title}</span>
            </span>
          </h3>
          <p className="serif-accent mt-3 text-[1.45rem] text-gold">{project.tagline}</p>
        </div>
        <p className="mt-5 max-w-md text-[0.93rem] leading-[1.7] text-muted">{project.description}</p>
        <ul className="mt-5 space-y-2 border-t border-white/[0.07] pt-5">
          {project.highlights.map((h, i) => (
            <li key={h} className="grid grid-cols-[1.8rem_1fr] text-sm leading-relaxed text-fg/80">
              <span className="font-mono text-[10px] text-gold/80">{String(i + 1).padStart(2, '0')}</span>
              {h}
            </li>
          ))}
        </ul>
        <ul className="mt-6 flex flex-wrap gap-1.5" aria-label="Technology stack">
          {project.stack.slice(0, 6).map((s) => (
            <li key={s} data-tag className="chip !h-7 !text-[0.7rem]">
              {s}
            </li>
          ))}
          {project.stack.length > 6 ? (
            <li data-tag className="chip !h-7 !text-[0.7rem] text-muted">
              +{project.stack.length - 6}
            </li>
          ) : null}
        </ul>
        <button type="button" onClick={onOpen} className="btn btn-ghost mt-7 self-start !h-12" aria-haspopup="dialog" aria-label={`View case study: ${project.title}`} data-magnetic>
          <span className="btn-inner">
            <Plus size={15} aria-hidden="true" /> Case study
          </span>
        </button>
      </div>

      {/* visual */}
      <div className="relative order-first h-[300px] p-3 sm:h-[380px] lg:order-none lg:h-auto lg:p-4">
        <div ref={stageRef} data-pv className="h-full">
          <div
            ref={ref}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onClick={onOpen}
            className="tilt glow-card relative h-full cursor-pointer overflow-hidden rounded-[24px] bg-[radial-gradient(120%_90%_at_50%_0%,#1a1b21,#0b0b0d_70%)]"
            data-cursor-label="Explore"
          >
            <div className="grid-bg absolute inset-0 opacity-40" aria-hidden="true" />
            {webgl ? (
              <Suspense fallback={css}>
                <ProjectStage kind={project.visual} hovered={hovered} reduced={reduced} index={index} />
              </Suspense>
            ) : (
              css
            )}
            <div className="pointer-events-none absolute inset-x-5 bottom-4 flex items-end justify-between" aria-hidden="true">
              <span className="eyebrow !text-dim">Fig. {project.number} — {figNames[project.visual]}</span>
              <span className="eyebrow !text-dim hidden sm:block">Hover to interact</span>
            </div>
          </div>
        </div>
        <span className="pointer-events-none absolute right-8 top-6 font-serif text-[6rem] italic leading-none text-white/[0.05] lg:text-[9rem]" aria-hidden="true">
          {project.number}
        </span>
      </div>
    </article>
  );
}

export function Projects() {
  const [filter, setFilter] = useState<ProjectFilter>('All');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const webgl = useSharedWebGL();
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);

  const shown = projects.filter((p) => filter === 'All' || p.category === filter);


  useLayoutEffect(() => {
    const mm = gsap.matchMedia();
    mm.add({ desktop: '(min-width: 1024px)', reduce: '(prefers-reduced-motion: reduce)' }, (ctx) => {
      const { desktop, reduce } = ctx.conditions as { desktop: boolean; reduce: boolean };
      const pin = pinRef.current;
      const track = trackRef.current;
      if (!pin || !track || reduce) return;
      const cards = gsap.utils.toArray<HTMLElement>('[data-card]', track);

      const enterCard = (card: HTMLElement, st: ScrollTrigger.Vars) => {
        const title = card.querySelector('[data-card-title]');
        const tags = card.querySelectorAll('[data-tag]');
        const tl = gsap.timeline({ scrollTrigger: { ...st, toggleActions: 'play none none reverse' } });
        if (title) tl.from(title, { yPercent: 110, duration: 1.2, ease: 'expo.out' }, 0);
        if (tags.length) tl.from(tags, { y: 12, opacity: 0, duration: 0.7, stagger: 0.05, ease: 'power3.out' }, 0.25);
      };

      if (!desktop) {
        cards.forEach((c) => {
          // transforms only: the shared WebGL canvas follows the element's box, so clip-paths would not clip the 3D
          gsap.fromTo(
            c.querySelector('[data-pv]'),
            { scale: 0.86, yPercent: 6 },
            { scale: 1, yPercent: 0, ease: 'none', scrollTrigger: { trigger: c, start: 'top 95%', end: 'top 45%', scrub: true } },
          );
          enterCard(c, { trigger: c, start: 'top 75%' });
        });
        return;
      }

      const distance = () => Math.max(0, track.scrollWidth - pin.clientWidth);
      if (distance() < 40) {
        gsap.from(cards, { y: 60, opacity: 0, stagger: 0.1, duration: 1.1, scrollTrigger: { trigger: pin, start: 'top 80%' } });
        return;
      }

      const total = cards.length;
      const tween = gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: pin,
          pin: true,
          scrub: 0.9,
          start: 'top top',
          end: () => `+=${distance()}`,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            if (barRef.current) barRef.current.style.transform = `scaleX(${self.progress})`;
            if (counterRef.current) {
              const idx = Math.min(total, Math.floor(self.progress * total * 0.999) + 1);
              counterRef.current.textContent = String(idx).padStart(2, '0');
            }
          },
        },
      });
      // giant background word drifts against the track (depth)
      if (wordRef.current) gsap.fromTo(wordRef.current, { xPercent: 0 }, { xPercent: -28, ease: 'none', scrollTrigger: { trigger: pin, start: 'top top', end: () => `+=${distance()}`, scrub: true } });

      cards.forEach((card, i) => {
        const pv = card.querySelector('[data-pv]');
        if (pv) {
          gsap.fromTo(
            pv,
            { scale: 0.8, xPercent: 10, rotateY: -10 },
            {
              scale: 1,
              xPercent: 0,
              rotateY: 0,
              ease: 'none',
              scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left 100%', end: 'left 35%', scrub: true },
            },
          );
        }
        if (i === 0) enterCard(card, { trigger: pin, start: 'top 70%' });
        else enterCard(card, { trigger: card, containerAnimation: tween, start: 'left 75%' });
      });
    });
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      cancelAnimationFrame(id);
      mm.revert();
    };
  }, [filter]);

  const close = useCallback(() => setOpenIndex(null), []);
  const prev = useCallback(() => setOpenIndex((i) => (i === null ? i : (i - 1 + shown.length) % shown.length)), [shown.length]);
  const next = useCallback(() => setOpenIndex((i) => (i === null ? i : (i + 1) % shown.length)), [shown.length]);

  return (
    <section ref={sectionRef} id="projects" aria-labelledby="projects-title" className="relative pt-[var(--section-y)]">
      <div className="container-x">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <SectionHeading
            id="projects-title"
            index="04"
            eyebrow="Selected work"
            title="Products,"
            accent="not just projects."
            intro="Legal technology, document platforms, automation and productivity — shipped to production."
          />
          <div className="mb-14 flex flex-wrap gap-2 md:mb-20" role="group" aria-label="Filter projects by category" data-reveal>
            {projectFilters.map((f) => (
              <button key={f} type="button" className="filter-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={pinRef} className="relative overflow-hidden pb-[var(--section-y)] lg:flex lg:h-[100svh] lg:flex-col lg:justify-center lg:pb-0">
        <div
          ref={wordRef}
          className="year-outline pointer-events-none absolute left-[4vw] top-1/2 hidden -translate-y-1/2 whitespace-nowrap text-[22vw] uppercase opacity-60 lg:block"
          aria-hidden="true"
        >
          Selected Work
        </div>
        <div className="container-x relative mb-6 hidden items-center gap-6 lg:flex" aria-hidden="true">
          <span className="font-mono text-xs text-muted">
            <span ref={counterRef} className="text-fg">01</span> / {String(shown.length).padStart(2, '0')}
          </span>
          <div className="h-px flex-1 overflow-hidden bg-white/10">
            <div ref={barRef} className="h-full origin-left bg-gold" style={{ transform: 'scaleX(0)' }} />
          </div>
          <span className="eyebrow">Scroll</span>
        </div>
        <div
          ref={trackRef}
          key={filter}
          className="relative flex flex-col gap-6 px-[var(--gutter)] lg:w-max lg:flex-row lg:gap-10 lg:pl-[max(var(--gutter),calc((100vw-1360px)/2+var(--gutter)))]"
        >
          {shown.map((p, i) => (
            <ProjectCard key={p.number} project={p} index={i} total={shown.length} webgl={webgl} onOpen={() => setOpenIndex(i)} />
          ))}
          <a
            href="#contact"
            data-cursor-label="Talk"
            className="group relative flex min-h-[240px] w-full shrink-0 flex-col justify-between overflow-hidden rounded-[32px] border border-white/[0.08] p-9 transition-colors duration-500 hover:border-gold/50 lg:h-[min(660px,calc(100svh-190px))] lg:w-[440px] lg:p-12"
          >
            <span className="eyebrow">Next chapter</span>
            <span>
              <span className="display block text-[clamp(2rem,3.4vw,3.2rem)]">Your product</span>
              <span className="serif-accent block text-[clamp(2.2rem,3.8vw,3.6rem)] text-gold">could be next.</span>
              <span className="mt-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-fg/80 transition-colors group-hover:text-gold">
                Start a conversation <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </span>
          </a>
        </div>
      </div>

      <ProjectDialog
        project={openIndex !== null ? shown[openIndex] ?? null : null}
        onClose={close}
        onPrev={prev}
        onNext={next}
        position={openIndex !== null ? `${String(openIndex + 1).padStart(2, '0')} / ${String(shown.length).padStart(2, '0')}` : ''}
      />
    </section>
  );
}
