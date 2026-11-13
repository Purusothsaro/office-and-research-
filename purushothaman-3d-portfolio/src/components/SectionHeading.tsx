interface Props {
  index: string;
  eyebrow: string;
  title: string;
  /** rendered in Instrument Serif italic, champagne */
  accent?: string;
  intro?: string;
  id?: string;
  className?: string;
}

/** Editorial heading: index + drawn hairline, uppercase display title with masked line reveal, serif accent. */
export function SectionHeading({ index, eyebrow, title, accent, intro, id, className = '' }: Props) {
  return (
    <header className={`mb-14 md:mb-20 ${className}`} data-heading>
      <div className="mb-7 flex items-center gap-4">
        <span className="font-mono text-[11px] tracking-[0.2em] text-gold">{index}</span>
        <span data-heading-line className="h-px w-14 origin-left bg-gold/60" />
        <span className="eyebrow">{eyebrow}</span>
      </div>
      <h2 id={id} className="display text-[clamp(2.3rem,6.2vw,6rem)] text-fg">
        <span className="mask-line">
          <span data-mask>{title}</span>
        </span>
        {accent ? (
          <span className="mask-line">
            <span data-mask className="serif-accent text-[1.12em] text-gold">
              {accent}
            </span>
          </span>
        ) : null}
      </h2>
      {intro ? (
        <p className="mt-7 max-w-xl text-base leading-[1.75] text-muted md:text-lg" data-reveal>
          {intro}
        </p>
      ) : null}
    </header>
  );
}
