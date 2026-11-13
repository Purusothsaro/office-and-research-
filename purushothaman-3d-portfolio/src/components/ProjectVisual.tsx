import { useId, useRef } from 'react';
import {
  Bell,
  Calendar,
  CheckCircle2,
  Cloud,
  FileSpreadsheet,
  FileText,
  FileType2,
  Landmark,
  MessageCircle,
  Presentation,
  Scale,
  ScanText,
  ShieldCheck,
  Star,
} from 'lucide-react';
import type { ProjectVisualKind } from '../data/content';
import { useInView } from '../lib/device';

const L = ({ w, accent = false, className = '' }: { w: string; accent?: boolean; className?: string }) => (
  <div className={`pv-line ${accent ? 'accent' : ''} ${className}`} style={{ width: w }} />
);

function Layer({ z, className = '', style, children }: { z: number; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className={`pv-layer ${className}`} style={{ ['--z' as string]: z, ...style }}>
      {children}
    </div>
  );
}

function Lawyer() {
  return (
    <>
      <Layer z={0} className="pv-panel left-[8%] top-[12%] h-[68%] w-[66%] overflow-hidden">
        <div className="flex h-full">
          <div className="w-[22%] space-y-2 border-r border-white/10 p-3">
            <div className="mb-4 h-5 w-5 rounded-md bg-[var(--accent)]" />
            {[70, 55, 80, 60, 45].map((w, i) => <L key={i} w={`${w}%`} accent={i === 1} />)}
          </div>
          <div className="flex-1 p-3">
            <div className="mb-3 flex items-center justify-between"><L w="40%" /><div className="h-4 w-12 rounded-full bg-white/10" /></div>
            {[0, 1, 2, 3, 4].map((r) => (
              <div key={r} className="mb-2 flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1.5">
                <span className={`h-2 w-2 rounded-full ${r % 3 === 0 ? 'bg-emerald-400' : r % 3 === 1 ? 'bg-amber-300' : 'bg-cyan'}`} />
                <L w={`${30 + ((r * 17) % 30)}%`} />
                <L w="18%" className="ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </Layer>
      <Layer z={45} className="pv-panel right-[10%] top-[8%] w-[34%] p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold text-fg/80"><Calendar size={11} /> Hearings</div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 28 }, (_, i) => (
            <span key={i} className={`aspect-square rounded-[3px] ${[4, 11, 17, 23].includes(i) ? 'bg-[var(--accent)]' : 'bg-white/10'}`} />
          ))}
        </div>
      </Layer>
      <Layer z={95} className="bottom-[8%] right-[16%] w-[22%]">
        <div className="pv-panel aspect-[9/17] rounded-[18px] p-2" style={{ animation: 'float-y 5s ease-in-out infinite' }}>
          <div className="mx-auto mb-2 h-1 w-6 rounded-full bg-white/30" />
          <div className="mb-2 grid place-items-center rounded-lg bg-[var(--accent)]/30 py-2"><Scale size={16} className="text-white" /></div>
          {[0, 1, 2, 3].map((i) => <div key={i} className="mb-1.5 h-4 rounded-md bg-white/10" />)}
        </div>
      </Layer>
    </>
  );
}

function Draft() {
  return (
    <>
      {[0, 1].map((i) => (
        <Layer key={i} z={i * 18} className="pv-panel left-[22%] top-[10%] h-[78%] w-[46%]" style={{ marginLeft: `${(1 - i) * -18}px`, marginTop: `${(1 - i) * -12}px`, opacity: 0.5 + i * 0.2 }}>
          <span />
        </Layer>
      ))}
      <Layer z={42} className="pv-panel left-[22%] top-[10%] h-[78%] w-[46%] overflow-hidden bg-[#141729] p-4">
        <L w="55%" accent />
        <div className="mt-4 space-y-2">
          {[92, 86, 95, 70, 88, 60, 90, 78, 84].map((w, i) => <L key={i} w={`${w}%`} />)}
        </div>
        <div className="absolute inset-x-3 h-[2px] bg-cyan shadow-[0_0_18px_4px_rgba(34,211,238,.6)]" style={{ animation: 'scan 2.8s ease-in-out infinite alternate' }} />
      </Layer>
      <Layer z={90} className="right-[10%] top-[18%]">
        <div className="pv-panel flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-semibold"><ScanText size={13} className="text-cyan" /> OCR</div>
      </Layer>
      <Layer z={110} className="bottom-[14%] right-[12%]">
        <div className="pv-panel flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-[10px]" style={{ animation: 'float-y 4.5s ease-in-out infinite' }}>
          <FileText size={13} /> DOCX <span className="text-cyan">→</span> <FileType2 size={13} /> PDF
        </div>
      </Layer>
    </>
  );
}

function Courts() {
  const uid = useId().replace(/:/g, '');
  const nodes = [
    { label: 'District', x: '12%', y: '58%', z: 20 },
    { label: 'High', x: '40%', y: '20%', z: 50 },
    { label: 'Supreme', x: '66%', y: '50%', z: 80 },
  ];
  return (
    <>
      <Layer z={0} className="inset-[8%]">
        <svg viewBox="0 0 400 300" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`cg${uid}`} x1="0" x2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
          </defs>
          <path id={`cp${uid}`} d="M40 190 C 120 190, 120 70, 190 70 S 280 170, 330 160" fill="none" stroke={`url(#cg${uid})`} strokeWidth="1.5" strokeDasharray="4 6" opacity=".8" />
          {[0, 1, 2].map((i) => (
            <circle key={i} r="4" fill="#22d3ee">
              <animateMotion dur="3.6s" begin={`${i * 1.2}s`} repeatCount="indefinite" rotate="auto">
                <mpath href={`#cp${uid}`} />
              </animateMotion>
            </circle>
          ))}
        </svg>
      </Layer>
      {nodes.map((n) => (
        <Layer key={n.label} z={n.z} style={{ left: n.x, top: n.y }}>
          <div className="pv-panel flex items-center gap-2 px-3 py-2">
            <Landmark size={14} style={{ color: 'var(--accent)' }} />
            <div>
              <p className="text-[10px] font-semibold leading-none">{n.label}</p>
              <p className="mt-1 font-mono text-[8px] leading-none text-muted">CNR sync</p>
            </div>
          </div>
        </Layer>
      ))}
      <Layer z={120} className="bottom-[8%] right-[8%] w-[42%]">
        <div className="pv-panel p-3" style={{ animation: 'float-y 5s ease-in-out infinite' }}>
          <div className="flex items-center gap-2 text-[10px] font-semibold">
            <Bell size={12} className="text-amber-300" /> Daily hearing summary
          </div>
          <div className="mt-2 space-y-1.5"><L w="90%" /><L w="70%" /></div>
          <div className="mt-2 flex gap-1.5 font-mono text-[8px] text-muted"><span className="rounded bg-white/10 px-1.5 py-0.5">Email</span><span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-emerald-300">WhatsApp</span></div>
        </div>
      </Layer>
    </>
  );
}

function ESign() {
  return (
    <>
      <Layer z={0} className="pv-panel left-[16%] top-[8%] h-[84%] w-[52%] bg-[#141729] p-4">
        <L w="45%" accent />
        <div className="mt-3 space-y-2">{[90, 84, 92, 76, 88].map((w, i) => <L key={i} w={`${w}%`} />)}</div>
        <div className="absolute bottom-[12%] left-[8%] h-[20%] w-[44%] rounded-md border border-dashed border-violet-400/80 bg-violet-500/10">
          <svg viewBox="0 0 120 40" className="h-full w-full" aria-hidden="true">
            <path d="M6 28 C 16 6, 22 34, 32 18 S 46 8, 50 24 S 64 30, 70 14 S 86 30, 96 18 L 112 22" fill="none" stroke="#c4b5fd" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="400" style={{ animation: 'draw 3.4s ease-in-out infinite' }} />
          </svg>
        </div>
        <div className="absolute bottom-[12%] right-[8%] h-[20%] w-[34%] rounded-md border border-dashed border-cyan/80 bg-cyan/10" style={{ animation: 'blink 2s ease-in-out infinite' }} />
      </Layer>
      <Layer z={60} className="left-[6%] top-[20%]">
        <div className="pv-panel flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-semibold"><span className="h-2 w-2 rounded-full bg-violet-400" /> Signer 1</div>
      </Layer>
      <Layer z={60} className="right-[16%] top-[30%]">
        <div className="pv-panel flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-semibold"><span className="h-2 w-2 rounded-full bg-cyan" /> Signer 2</div>
      </Layer>
      <Layer z={120} className="bottom-[12%] right-[6%] w-[36%]">
        <div className="pv-panel p-3" style={{ animation: 'float-y 5.5s ease-in-out infinite' }}>
          <div className="flex items-center gap-2 text-[10px] font-semibold"><ShieldCheck size={13} className="text-emerald-300" /> Aadhaar eSign</div>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-[8px] text-muted"><CheckCircle2 size={10} className="text-emerald-300" /> Audit trail PDF</div>
        </div>
      </Layer>
    </>
  );
}

function Office() {
  const apps = [
    { Icon: FileText, label: 'Docs', color: '#60a5fa', pos: 'left-[10%] top-[10%]', z: 20 },
    { Icon: FileSpreadsheet, label: 'Sheets', color: '#34d399', pos: 'right-[12%] top-[14%]', z: 60 },
    { Icon: Presentation, label: 'Slides', color: '#fb923c', pos: 'left-[14%] bottom-[10%]', z: 90 },
    { Icon: FileType2, label: 'PDF', color: '#f87171', pos: 'right-[10%] bottom-[12%]', z: 40 },
  ];
  return (
    <>
      <Layer z={-20} className="left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] opacity-40 blur-2xl"><span /></Layer>
      {apps.map(({ Icon, label, color, pos, z }, i) => (
        <Layer key={label} z={z} className={`${pos} w-[38%]`}>
          <div className="pv-panel p-3" style={{ animation: `float-y ${4 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>
            <div className="flex items-center gap-2 text-[10px] font-semibold">
              <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: `${color}33` }}><Icon size={13} style={{ color }} /></span>
              {label}
            </div>
            {label === 'Sheets' ? (
              <div className="mt-2 grid grid-cols-4 gap-[3px]">{Array.from({ length: 12 }, (_, k) => <span key={k} className="h-2.5 rounded-[2px] bg-white/10" style={k % 5 === 0 ? { background: `${color}66` } : undefined} />)}</div>
            ) : label === 'Slides' ? (
              <div className="mt-2 flex gap-1.5"><span className="h-8 flex-1 rounded bg-white/10" /><span className="h-8 w-1/3 rounded" style={{ background: `${color}55` }} /></div>
            ) : (
              <div className="mt-2 space-y-1.5"><L w="90%" /><L w="75%" /><L w="85%" /></div>
            )}
          </div>
        </Layer>
      ))}
    </>
  );
}

function Feedback() {
  const msgs = [
    { me: false, w: '64%', d: 0 },
    { me: true, w: '48%', d: 0.9 },
    { me: false, w: '70%', d: 1.8 },
  ];
  return (
    <>
      <Layer z={0} className="pv-panel left-[14%] top-[6%] h-[88%] w-[40%] overflow-hidden rounded-[22px] p-3">
        <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-2 text-[10px] font-semibold"><MessageCircle size={13} className="text-emerald-300" /> Feedback chat</div>
        <div className="space-y-2">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.me ? 'justify-end' : ''}`} style={{ animation: `rise 5.4s ease-in-out ${m.d}s infinite both` }}>
              <div className={`rounded-xl px-2.5 py-2 ${m.me ? 'bg-emerald-500/25' : 'bg-white/10'}`} style={{ width: m.w }}>
                <L w="90%" />
                <L w="60%" className="mt-1" />
              </div>
            </div>
          ))}
          <div className="flex gap-1 pt-1" style={{ animation: 'rise 5.4s ease-in-out 2.7s infinite both' }}>
            {Array.from({ length: 5 }, (_, i) => <Star key={i} size={13} className={i < 4 ? 'fill-amber-300 text-amber-300' : 'text-white/30'} />)}
          </div>
        </div>
      </Layer>
      <Layer z={70} className="right-[8%] top-[22%] w-[38%]">
        <div className="pv-panel p-3" style={{ animation: 'float-y 5s ease-in-out infinite' }}>
          <div className="flex items-center gap-2 text-[10px] font-semibold"><Cloud size={13} className="text-sky-300" /> CRM record</div>
          <div className="mt-2 space-y-1.5"><L w="80%" /><L w="60%" accent /><L w="70%" /></div>
        </div>
      </Layer>
      <Layer z={110} className="bottom-[14%] right-[14%]">
        <div className="pv-panel rounded-full px-3 py-1.5 font-mono text-[9px] text-emerald-300">● synced</div>
      </Layer>
    </>
  );
}

const map: Record<ProjectVisualKind, () => JSX.Element> = {
  lawyer: Lawyer,
  draft: Draft,
  courts: Courts,
  esign: ESign,
  office: Office,
  feedback: Feedback,
};

export function ProjectVisual({ kind, accent, className = '' }: { kind: ProjectVisualKind; accent: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, '100px');
  const Comp = map[kind];
  return (
    <div
      ref={ref}
      className={`pv ${inView ? '' : 'pv-paused'} ${className}`}
      style={{ ['--accent' as string]: accent }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(80%_70%_at_70%_20%,color-mix(in_srgb,var(--accent)_28%,transparent),transparent_70%)]" />
      <div className="grid-bg absolute inset-0 opacity-50" />
      <div className="pv-scene">
        <Comp />
      </div>
    </div>
  );
}
