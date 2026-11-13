import { lazy, Suspense, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Linkedin, Mail, MapPin, Phone, Send } from 'lucide-react';
import { deviceTier, hasWebGL, useInView, usePageVisible, useReducedMotion } from '../lib/device';
import { profile } from '../data/content';
import { SceneBoundary } from '../components/SceneBoundary';

const ContactScene = lazy(() => import('../three/ContactScene'));

export function Contact() {
  const root = useRef<HTMLElement>(null);
  const near = useInView(root, '400px', true); // mount the scene once it's approaching
  const inView = useInView(root, '0px');
  const visible = usePageVisible();
  const reduced = useReducedMotion();
  const [tier] = useState(deviceTier);
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(profile.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.location.href = `mailto:${profile.email}`;
    }
  };

  const links = [
    { icon: Mail, label: 'Email', value: profile.email, href: `mailto:${profile.email}` },
    { icon: Phone, label: 'Phone', value: profile.phone, href: `tel:${profile.phone.replace(/\s/g, '')}` },
    { icon: Linkedin, label: 'LinkedIn', value: 'purushothaman-senthilkumar', href: profile.linkedin, external: true },
    { icon: MapPin, label: 'Location', value: profile.location, href: 'https://www.google.com/maps/search/?api=1&query=Chennai%2C+Tamil+Nadu%2C+India', external: true },
  ];

  return (
    <section ref={root} id="contact" aria-labelledby="contact-title" className="relative isolate overflow-hidden pb-16 pt-[var(--section-y)]">
      <div className="absolute inset-x-0 bottom-0 -z-10 h-[75%] [mask-image:linear-gradient(to_bottom,transparent,#000_35%)]">
        {near && hasWebGL() ? (
          <SceneBoundary fallback={null}>
            <Suspense fallback={null}>
              <ContactScene tier={tier} reduced={reduced} active={inView && visible} />
            </Suspense>
          </SceneBoundary>
        ) : null}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-[30%] -z-10 h-[50vmax] w-[50vmax] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(20,28,58,.7),transparent_60%)]" />

      <div className="container-x">
        <div data-heading>
          <div className="mb-8 flex items-center gap-4">
            <span className="font-mono text-[11px] tracking-[0.2em] text-gold">06</span>
            <span data-heading-line className="h-px w-14 origin-left bg-gold/60" />
            <span className="eyebrow">Contact</span>
          </div>
          <h2 id="contact-title" className="display text-[clamp(2.5rem,7.6vw,7.6rem)]">
            <span className="mask-line">
              <span data-mask>Have an Idea?</span>
            </span>
            <span className="mask-line">
              <span data-mask>Let&apos;s Build Something</span>
            </span>
            <span className="mask-line">
              <span data-mask className="serif-accent text-[1.1em] text-gold">
                Extraordinary.
              </span>
            </span>
          </h2>
        </div>
        <p className="mt-10 max-w-xl text-lg leading-[1.75] text-muted" data-reveal>
          If you&apos;re building something useful in legal tech, documents, productivity or anything in between, I&apos;d like to hear about it.
        </p>

        <div className="mt-10 flex flex-wrap gap-3" data-reveal>
          <a className="btn btn-primary !h-14 !px-8" data-magnetic href={`mailto:${profile.email}?subject=${encodeURIComponent("Let's build something")}`}>
            <span className="btn-inner">
              Get in touch <Send size={15} aria-hidden="true" />
            </span>
          </a>
          <button type="button" onClick={copyEmail} className="btn btn-ghost !h-14" data-magnetic aria-live="polite">
            <span className="btn-inner">
              {copied ? <Check size={15} className="text-gold" aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? 'Email copied' : 'Copy email'}
            </span>
          </button>
        </div>

        <ul className="mt-20 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {links.map(({ icon: Icon, label, value, href, external }) => (
            <li key={label} data-reveal>
              <a
                href={href}
                {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                className="group flex h-full flex-col gap-8 rounded-[24px] border border-white/[0.08] bg-void/60 p-7 backdrop-blur-sm transition-[transform,border-color] duration-500 hover:-translate-y-1 hover:border-gold/45"
              >
                <span className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.02] text-gold">
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <ArrowUpRight size={18} className="text-muted transition-transform duration-500 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-fg" aria-hidden="true" />
                </span>
                <span>
                  <span className="eyebrow block">{label}</span>
                  <span className="mt-2 block break-words font-medium text-fg">{value}</span>
                  {external ? <span className="sr-only">(opens in a new tab)</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <footer className="container-x mt-28 flex flex-col items-center justify-between gap-4 border-t border-white/[0.08] pt-8 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-dim md:flex-row md:text-left">
        <span>© {new Date().getFullYear()} {profile.name}</span>
        <span>Designed &amp; engineered with React · Three.js · GSAP</span>
        <a href="#top" className="transition-colors hover:text-fg">
          Back to top ↑
        </a>
      </footer>
    </section>
  );
}
