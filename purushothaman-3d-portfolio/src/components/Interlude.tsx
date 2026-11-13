import { lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { ScrollTrigger } from '../lib/gsap';
import { useReducedMotion } from '../lib/device';
import { useViewActivity } from '../lib/viewActivity';
import { useSharedWebGL } from './SharedCanvasHost';
import type { InterludeKind } from '../three/InterludeScenes';

const InterludeStage = lazy(() => import('../three/InterludeScenes'));

/** Captions use only technologies and work named in the resume. */
const copy: Record<InterludeKind, { no: string; label: string; title: string; accent: string; line: string; tags: string[] }> = {
  neural: {
    no: '01',
    label: 'Intelligence',
    title: 'Smarter',
    accent: 'documents & workflows.',
    line: 'AI-assisted drafting, OCR digitisation of scanned files and automated court-case tracking — intelligence applied where legal teams spend their time.',
    tags: ['AI-assisted drafting', 'Tesseract.js OCR', 'Playwright automation'],
  },
  code: {
    no: '02',
    label: 'Craft',
    title: 'Typed, tested,',
    accent: 'shipped.',
    line: 'Web, API and mobile code across one product: React and TypeScript on the front, Node.js and Express behind it, Flutter in the pocket.',
    tags: ['React', 'TypeScript', 'Node.js', 'Flutter'],
  },
  chip: {
    no: '03',
    label: 'Systems',
    title: 'Realtime',
    accent: 'by design.',
    line: 'APIs, sockets and background sync that keep web, mobile and court data in step — including offline-first mobile sync.',
    tags: ['REST APIs', 'Socket.IO', 'JWT', 'Offline-first sync'],
  },
  cloud: {
    no: '04',
    label: 'Infrastructure',
    title: 'Running',
    accent: 'in production.',
    line: 'Containerised services behind Nginx and PM2, files on S3 served through CloudFront, deployed with GitHub Actions.',
    tags: ['Docker', 'Nginx', 'AWS S3', 'CloudFront', 'GitHub Actions'],
  },
};

/** SVG stand-ins when WebGL is unavailable. */
function Fallback({ kind }: { kind: InterludeKind }) {
  const stroke = '#d4b98a';
  return (
    <svg viewBox="0 0 400 200" className="absolute inset-0 m-auto h-[70%] w-[70%] opacity-70" aria-hidden="true">
      {kind === 'neural' &&
        [0, 1, 2, 3].map((l) =>
          Array.from({ length: 4 }, (_, i) => <circle key={`${l}-${i}`} cx={70 + l * 85} cy={40 + i * 40} r="5" fill="none" stroke={stroke} />),
        )}
      {kind === 'code' && <text x="200" y="125" textAnchor="middle" fontSize="90" fill="none" stroke={stroke} fontFamily="monospace">{'</>'}</text>}
      {kind === 'chip' && (
        <>
          <rect x="150" y="50" width="100" height="100" rx="8" fill="none" stroke={stroke} />
          <rect x="175" y="75" width="50" height="50" rx="4" fill="none" stroke="#c9ccd3" />
        </>
      )}
      {kind === 'cloud' &&
        [0, 1, 2, 3].map((i) => <rect key={i} x="130" y={140 - i * 28} width="140" height="20" rx="4" fill="none" stroke={i === 3 ? stroke : '#c9ccd3'} />)}
    </svg>
  );
}

/** A 3D band between sections — AI / IT-software themed — with caption and scroll-linked motion. */
export function Interlude({ kind, flip = false }: { kind: InterludeKind; flip?: boolean }) {
  const c = copy[kind];
  const reduced = useReducedMotion();
  const webgl = useSharedWebGL();
  const frame = useRef<HTMLDivElement>(null);
  const progress = useRef(0.5);
  useViewActivity(frame);

  useLayoutEffect(() => {
    if (reduced || !frame.current) return;
    const st = ScrollTrigger.create({
      trigger: frame.current,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        progress.current = self.progress;
      },
    });
    return () => st.kill();
  }, [reduced]);

  return (
    <aside aria-label={`Interlude: ${c.label}`} className="relative py-10 md:py-16">
      <div className={`container-x grid items-center gap-8 lg:gap-16 ${flip ? 'lg:grid-cols-[1.55fr_1fr]' : 'lg:grid-cols-[1fr_1.55fr]'}`}>
        <div className={flip ? 'lg:order-2' : ''} data-reveal>
          <p className="eyebrow">
            <span className="text-gold">Interlude {c.no}</span> — {c.label}
          </p>
          <p className="display mt-5 text-[clamp(1.7rem,3.2vw,2.8rem)]">
            {c.title} <span className="serif-accent text-[1.1em] text-gold">{c.accent}</span>
          </p>
          <p className="mt-5 max-w-md text-[0.95rem] leading-[1.75] text-muted">{c.line}</p>
          <ul className="mt-6 flex flex-wrap gap-1.5" aria-label="Related technologies">
            {c.tags.map((t) => (
              <li key={t} className="chip !h-7 !text-[0.7rem]">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div
          ref={frame}
          className="relative h-[34vh] min-h-[240px] overflow-hidden rounded-[28px] border border-white/[0.07] bg-[radial-gradient(120%_100%_at_50%_0%,#16171c,#09090b_70%)] md:h-[42vh] md:max-h-[460px]"
        >
          <div className="grid-bg absolute inset-0 opacity-40" aria-hidden="true" />
          {webgl ? (
            <Suspense fallback={<Fallback kind={kind} />}>
              <InterludeStage kind={kind} progress={progress} reduced={reduced} />
            </Suspense>
          ) : (
            <Fallback kind={kind} />
          )}
          <span className="eyebrow pointer-events-none absolute bottom-4 left-5 !text-dim" aria-hidden="true">
            Fig. I-{c.no}
          </span>
        </div>
      </div>
    </aside>
  );
}
