import type { FileFormat, FileKind } from "@octo/core";
import { FileSpreadsheet, FileText, Presentation, Waypoints, type LucideIcon } from "lucide-react";

const KIND_STYLE: Record<Exclude<FileKind, "pdf">, { icon: LucideIcon; bg: string; fg: string }> = {
  document: { icon: FileText, bg: "bg-blue-50", fg: "text-kind-document" },
  spreadsheet: { icon: FileSpreadsheet, bg: "bg-green-50", fg: "text-kind-spreadsheet" },
  presentation: { icon: Presentation, bg: "bg-orange-50", fg: "text-kind-presentation" },
  workspace: { icon: Waypoints, bg: "bg-violet-50", fg: "text-violet-700" },
};

const PDF_STYLE = { bg: "bg-red-50", fg: "text-kind-pdf" };

function PdfMark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      {/* A filled band, unlike the ruled lines of the document icon, so PDFs read differently at a glance. */}
      <rect x="3" y="12" width="13" height="6" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FileIcon({ kind, format, size = "md" }: { kind: FileKind; format?: FileFormat; size?: "sm" | "md" | "lg" }) {
  const style = kind === "pdf" ? PDF_STYLE : KIND_STYLE[kind];
  const Icon = kind === "pdf" ? null : KIND_STYLE[kind].icon;
  const box = { sm: "size-8 rounded-md", md: "size-11 rounded-lg", lg: "h-[4.5rem] w-14 rounded-xl" }[size];
  const glyph = { sm: "size-4", md: "size-5", lg: "size-6" }[size];
  const showFormat = Boolean(format) && size !== "sm";
  return (
    // The inset ring keeps the tile's outline visible where the white format strip meets a white card.
    <span className={`relative inline-flex shrink-0 flex-col overflow-hidden ring-1 ring-inset ring-current/15 ${box} ${style.bg} ${style.fg}`} aria-hidden>
      <span className="flex min-h-0 flex-1 items-center justify-center">
        {Icon ? <Icon className={glyph} strokeWidth={1.75} /> : <PdfMark className={glyph} />}
      </span>
      {showFormat && (
        <span className={`border-t border-current/15 bg-white/70 text-center font-bold uppercase leading-none tracking-wide ${size === "lg" ? "py-1 text-[10px]" : "py-0.5 text-[8px]"}`}>
          {format}
        </span>
      )}
    </span>
  );
}

export function kindTextClass(kind: FileKind): string {
  return kind === "pdf" ? PDF_STYLE.fg : KIND_STYLE[kind].fg;
}
