import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/device';
import { skillGroups, type SkillCategory } from '../data/content';
import { SectionHeading } from '../components/SectionHeading';

type Filter = 'All' | SkillCategory;
const filters: Filter[] = ['All', ...skillGroups.map((g) => g.title)];
const totalSkills = skillGroups.reduce((n, g) => n + g.items.length, 0);

/* ---------- Tech Orbit: CSS-3D sphere of skill labels (drag / pointer to rotate) ---------- */
function TechOrbit({ active }: { active: Filter }) {
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const all = useMemo(() => skillGroups.flatMap((g) => g.items.map((name) => ({ name, cat: g.title }))), []);

  const points = useMemo(() => {
    const n = all.length;
    return all.map((_, i) => {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = Math.PI * (3 - Math.sqrt(5)) * i;
      return { x: Math.cos(th) * r, y, z: Math.sin(th) * r };
    });
  }, [all]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let radius = el.clientWidth * 0.38;
    let ax = -0.25, ay = 0;
    let vx = 0, vy = reduced ? 0 : 0.003;
    let dragging = false;
    let lx = 0, ly = 0, hoverX = 0, hoverY = 0;
    let raf = 0;
    let running = false;

    const render = () => {
      const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
      points.forEach((p, i) => {
        const node = itemsRef.current[i];
        if (!node) return;
        const x1 = p.x * cy + p.z * sy;
        const z1 = -p.x * sy + p.z * cy;
        const y2 = p.y * cx - z1 * sx;
        const z2 = p.y * sx + z1 * cx;
        const depth = (z2 + 1) / 2;
        const s = 0.62 + depth * 0.5;
        node.style.transform = `translate(-50%, -50%) translate3d(${x1 * radius}px, ${y2 * radius}px, 0) scale(${s})`;
        node.style.opacity = String(0.12 + depth * 0.88);
        node.style.zIndex = String(Math.round(depth * 100));
      });
    };
    const tick = () => {
      if (!dragging) {
        vy += ((reduced ? 0 : 0.003) + hoverX * 0.005 - vy) * 0.04;
        vx += (hoverY * 0.0035 - vx) * 0.04;
      }
      ay += vy;
      ax = Math.max(-1.1, Math.min(1.1, ax + vx));
      render();
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running || reduced) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (dragging) {
        vy = (e.clientX - lx) * 0.005;
        vx = (e.clientY - ly) * -0.004;
        lx = e.clientX;
        ly = e.clientY;
        if (reduced) {
          ay += vy;
          ax += vx;
          render();
        }
      } else if (e.pointerType === 'mouse') {
        hoverX = ((e.clientX - r.left) / r.width - 0.5) * 2;
        hoverY = ((e.clientY - r.top) / r.height - 0.5) * 2;
      }
    };
    const onUp = () => (dragging = false);
    const onLeave = () => {
      hoverX = 0;
      hoverY = 0;
    };
    const ro = new ResizeObserver(() => {
      radius = el.clientWidth * 0.38;
      render();
    });
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()));
    render();
    ro.observe(el);
    io.observe(el);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [points, reduced]);

  return (
    <div className="relative">
      <div ref={box} className="orbit relative mx-auto aspect-square w-full max-w-[560px] cursor-grab select-none active:cursor-grabbing" data-cursor-label="Drag" aria-hidden="true">
        <div className="absolute inset-[10%] rounded-full border border-white/[0.06]" />
        <div className="absolute inset-[24%] rounded-full border border-white/[0.04]" />
        <div className="absolute inset-[10%] rounded-full" style={{ transform: 'rotateX(72deg)', border: '1px solid rgba(212,185,138,.22)' }} />
        <div className="absolute left-1/2 top-1/2 h-px w-[84%] -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(212,185,138,.3),transparent)]" />
        <div
          style={{ zIndex: 50 }}
          className="absolute left-1/2 top-1/2 grid h-28 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-void/85 text-center backdrop-blur"
        >
          <span>
            <span className="display block text-2xl">{active === 'All' ? totalSkills : skillGroups.find((g) => g.title === active)?.items.length}</span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.2em] text-gold">{active === 'All' ? 'Tools' : active}</span>
          </span>
        </div>
        {all.map((s, i) => {
          const on = active === 'All' || active === s.cat;
          return (
            <span key={`${s.cat}-${s.name}`} ref={(n) => (itemsRef.current[i] = n)} className={`orbit-item ${active !== 'All' && on ? 'is-active' : ''} ${!on ? 'is-dim' : ''}`}>
              {s.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function Skills() {
  const [active, setActive] = useState<Filter>('All');
  const shown = active === 'All' ? skillGroups : skillGroups.filter((g) => g.title === active);

  return (
    <section id="skills" aria-labelledby="skills-title" className="relative py-[var(--section-y)]">
      <div className="container-x">
        <SectionHeading
          id="skills-title"
          index="03"
          eyebrow="Technical skills"
          title="The toolkit,"
          accent="full-stack."
          intro="Technologies used across production web, mobile, backend, cloud and integration work."
        />

        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-20">
          {/* editorial category index */}
          <div role="group" aria-label="Filter skills by category" data-reveal>
            <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
              {filters.map((f) => (
                <button key={f} type="button" className="filter-btn shrink-0" aria-pressed={active === f} onClick={() => setActive(f)}>
                  {f}
                </button>
              ))}
            </div>
            <div className="hidden border-t border-white/[0.07] lg:block">
              {filters.map((f, i) => {
                const count = f === 'All' ? totalSkills : skillGroups.find((g) => g.title === f)?.items.length;
                return (
                  <button key={f} type="button" className="cat-btn" aria-pressed={active === f} onClick={() => setActive(f)}>
                    <span className="font-mono text-[10px] text-gold/80">{String(i).padStart(2, '0')}</span>
                    <span className="display text-[1.35rem]">{f}</span>
                    <span className="font-mono text-[10px] text-dim">{String(count).padStart(2, '0')}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div data-reveal>
            <TechOrbit active={active} />
          </div>
        </div>

        <div key={active} className={`mt-20 grid gap-px overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.06] ${shown.length > 1 ? 'md:grid-cols-2 xl:grid-cols-3' : ''}`} aria-live="polite">
          {shown.map((g, gi) => (
            <article key={g.title} className="skill-card-enter bg-void/95 p-7 md:p-8" style={{ animationDelay: `${gi * 80}ms` }}>
              <div className="flex items-baseline justify-between">
                <h3 className="display text-xl">{g.title}</h3>
                <span className="font-mono text-[10px] tracking-[0.2em] text-dim">{String(g.items.length).padStart(2, '0')}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{g.blurb}</p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {g.items.map((item, ii) => (
                  <li key={item} className="chip chip-enter" style={{ animationDelay: `${gi * 80 + 150 + ii * 35}ms` }}>
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
