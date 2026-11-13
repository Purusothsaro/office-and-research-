import { certification, education } from '../data/content';
import { SectionHeading } from '../components/SectionHeading';

export function Education() {
  return (
    <section id="education" aria-labelledby="education-title" className="relative py-[var(--section-y)]">
      <div className="container-x">
        <SectionHeading id="education-title" index="05" eyebrow="Education" title="The" accent="foundations." />

        <ol className="border-t border-white/[0.08]">
          {education.map((e, i) => (
            <li
              key={e.title}
              data-reveal
              className="group relative grid grid-cols-[3rem_1fr] items-baseline gap-x-6 gap-y-2 border-b border-white/[0.08] py-8 md:grid-cols-[5rem_1fr_auto] md:py-10"
            >
              <span className="absolute inset-0 -z-10 origin-left scale-x-0 bg-[linear-gradient(90deg,rgba(212,185,138,.07),transparent_70%)] transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-x-100" />
              <span className="font-mono text-[11px] text-gold/80">0{i + 1}</span>
              <div>
                <h3 className="display text-[clamp(1.25rem,2.4vw,2rem)] transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover:translate-x-2">{e.title}</h3>
                <p className="mt-2 text-sm text-muted md:text-base">{e.school}</p>
              </div>
              <p className="col-start-2 md:col-start-auto md:text-right">
                <span className="serif-accent text-3xl text-fg md:text-4xl">{e.year}</span>
                {e.note ? <span className="mt-1 block font-mono text-[11px] text-muted">{e.note}</span> : null}
              </p>
            </li>
          ))}
        </ol>

        <div data-reveal className="mt-14 grid gap-6 rounded-[28px] border border-white/[0.08] p-8 sm:grid-cols-[auto_1fr_auto] sm:items-center md:p-10">
          <span className="grid h-14 w-14 place-items-center rounded-full border border-gold/40" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-gold" fill="none" stroke="currentColor" strokeWidth="1.2">
              <circle cx="12" cy="9" r="5.5" />
              <path d="M8.5 13.5 7 21l5-2.5L17 21l-1.5-7.5" />
            </svg>
          </span>
          <div>
            <p className="eyebrow text-gold">Certification</p>
            <h3 className="display mt-2 text-[clamp(1.3rem,2.4vw,2rem)]">{certification.title}</h3>
          </div>
          <p className="text-muted">{certification.issuer}</p>
        </div>
      </div>
    </section>
  );
}
