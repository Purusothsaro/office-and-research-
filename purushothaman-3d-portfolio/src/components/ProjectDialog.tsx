import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import type { Project } from '../data/content';
import { ProjectVisual } from './ProjectVisual';

interface Props {
  project: Project | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  position: string;
}

export function ProjectDialog({ project, onClose, onPrev, onNext, position }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const scrollBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (project && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = 'hidden';
    } else if (!project && d.open) {
      d.close();
    }
  }, [project]);

  useEffect(() => {
    scrollBox.current?.scrollTo({ top: 0 });
  }, [project?.number]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onDialogClose = () => {
      document.documentElement.style.overflow = '';
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };
    d.addEventListener('close', onDialogClose);
    d.addEventListener('keydown', onKey);
    return () => {
      d.removeEventListener('close', onDialogClose);
      d.removeEventListener('keydown', onKey);
    };
  }, [onClose, onNext, onPrev]);

  return (
    <dialog
      ref={ref}
      className="case-dialog"
      aria-labelledby="case-title"
      onClick={(e) => {
        // click on backdrop closes
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      {project ? (
        <div ref={scrollBox} className="max-h-[calc(100dvh-32px)] overflow-y-auto" style={{ ['--accent' as string]: project.accent }}>
          <div className="relative h-[240px] sm:h-[320px]">
            <ProjectVisual kind={project.visual} accent={project.accent} className="!rounded-none" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b0b0d] to-transparent" />
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="glass absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full transition-transform hover:rotate-90"
              aria-label="Close case study"
              autoFocus
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-6 sm:p-10">
            <p className="eyebrow" style={{ color: project.accent }}>
              {project.number} · {project.type}
            </p>
            <h3 id="case-title" className="display mt-3 text-[clamp(2rem,5vw,3.4rem)]">
              {project.title}
            </h3>
            <p className="serif-accent mt-3 text-2xl text-gold">{project.tagline}</p>
            <p className="mt-6 max-w-2xl leading-relaxed text-muted">{project.description}</p>

            <h4 className="eyebrow mt-10">What I built</h4>
            <ul className="mt-4 grid gap-3">
              {project.details.map((d) => (
                <li key={d} className="flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-[0.95rem] leading-relaxed text-fg/85">
                  <Check size={18} className="mt-0.5 shrink-0" style={{ color: project.accent }} aria-hidden="true" />
                  {d}
                </li>
              ))}
            </ul>

            <h4 className="eyebrow mt-10">Technology</h4>
            <ul className="mt-4 flex flex-wrap gap-2">
              {project.stack.map((s) => (
                <li key={s} className="chip">{s}</li>
              ))}
            </ul>

            <div className="mt-10 flex items-center justify-between gap-4 border-t border-white/[0.08] pt-6">
              <button type="button" onClick={onPrev} className="btn btn-ghost !h-11 !px-4 !text-sm" aria-label="Previous project">
                <ArrowLeft size={16} /> Prev
              </button>
              <span className="font-mono text-xs text-muted">{position}</span>
              <button type="button" onClick={onNext} className="btn btn-ghost !h-11 !px-4 !text-sm" aria-label="Next project">
                Next <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
