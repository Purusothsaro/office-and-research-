import type { CSSProperties, ReactNode } from "react";
import { defaultTextColor, slideBackground, THEMES, type Deck, type Paragraph, type ShapeElement, type Slide, type SlideElement, type TextBody } from "../model";

export const PX_PER_IN = 96;
const ptToPx = (pt: number, scale: number) => (pt * PX_PER_IN * scale) / 72;

const SAFE_COLOR = /^#[0-9a-f]{6}$/i;
const safe = (c: string | null | undefined, fallback: string) => (c && SAFE_COLOR.test(c) ? c : fallback);

export function paragraphStyle(p: Paragraph, scale: number): CSSProperties {
  return {
    textAlign: p.align ?? "left",
    margin: 0,
    paddingLeft: p.bullet ? ptToPx(18 + (p.level ?? 0) * 24, scale) : 0,
    position: "relative",
    minHeight: "1em",
  };
}

export function TextBodyView({ body, scale, color, font }: { body: TextBody; scale: number; color: string; font: string }) {
  return (
    <>
      {body.paragraphs.map((p, i) => {
        const size = p.runs[0]?.size ?? 18;
        return (
          <p key={i} style={{ ...paragraphStyle(p, scale), fontSize: ptToPx(size, scale), lineHeight: 1.2 }}>
            {p.bullet && (
              <span aria-hidden style={{ position: "absolute", left: ptToPx(4 + (p.level ?? 0) * 24, scale) }}>
                •
              </span>
            )}
            {p.runs.map((r, j) => (
              <span
                key={j}
                style={{
                  fontWeight: r.bold ? 700 : undefined,
                  fontStyle: r.italic ? "italic" : undefined,
                  textDecoration: r.underline ? "underline" : undefined,
                  color: safe(r.color, color),
                  fontSize: r.size ? ptToPx(r.size, scale) : undefined,
                  fontFamily: r.font ?? font,
                  whiteSpace: "pre-wrap",
                }}
              >
                {r.text}
              </span>
            ))}
            {p.runs.every((r) => !r.text) && <br />}
          </p>
        );
      })}
    </>
  );
}

function ShapeSvg({ el, w, h }: { el: ShapeElement; w: number; h: number }) {
  const s = Math.max(0, el.strokeWidth);
  const fill = el.fill && SAFE_COLOR.test(el.fill) ? el.fill : "none";
  const stroke = el.stroke && SAFE_COLOR.test(el.stroke) ? el.stroke : "none";
  const half = s / 2;
  let body: ReactNode;
  switch (el.shape) {
    case "rect":
      body = <rect x={half} y={half} width={Math.max(0, w - s)} height={Math.max(0, h - s)} />;
      break;
    case "roundRect":
      body = <rect x={half} y={half} width={Math.max(0, w - s)} height={Math.max(0, h - s)} rx={Math.min(w, h) * 0.12} />;
      break;
    case "ellipse":
      body = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - half)} ry={Math.max(0, h / 2 - half)} />;
      break;
    case "triangle":
      body = <polygon points={`${w / 2},${half} ${w - half},${h - half} ${half},${h - half}`} />;
      break;
    case "line":
      body = <line x1={0} y1={h / 2} x2={w} y2={h / 2} />;
      break;
    case "arrow": {
      const head = Math.min(Math.max(h, 8), w / 3);
      body = (
        <>
          <line x1={0} y1={h / 2} x2={w - head} y2={h / 2} />
          <polygon points={`${w - head},${h / 2 - head / 2} ${w},${h / 2} ${w - head},${h / 2 + head / 2}`} fill={stroke} stroke="none" />
        </>
      );
      break;
    }
  }
  return (
    <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }} fill={fill} stroke={stroke} strokeWidth={el.shape === "line" || el.shape === "arrow" ? Math.max(1, s) : s} aria-hidden>
      {body}
    </svg>
  );
}

export function ElementView({ deck, slide, el, scale, editing }: { deck: Deck; slide: Slide; el: SlideElement; scale: number; editing?: ReactNode }) {
  const k = PX_PER_IN * scale;
  const w = el.w * k;
  const h = el.h * k;
  const theme = THEMES[deck.theme];
  const style: CSSProperties = { position: "absolute", left: el.x * k, top: el.y * k, width: w, height: h, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined };
  const textBox = (body: TextBody | undefined, color: string, center = false) => (
    <div
      className="slide-text"
      style={{
        position: "absolute",
        inset: 0,
        padding: 4 * scale,
        display: "flex",
        flexDirection: "column",
        justifyContent: (body?.valign ?? (center ? "middle" : "top")) === "middle" ? "center" : body?.valign === "bottom" ? "flex-end" : "flex-start",
        fontFamily: theme.font,
        color,
        overflow: "hidden",
        textAlign: center ? "center" : undefined,
      }}
    >
      {editing ?? (body && <TextBodyView body={body} scale={scale} color={color} font={theme.font} />)}
    </div>
  );
  switch (el.kind) {
    case "text":
      return (
        <div style={style} data-element-id={el.id}>
          {textBox(el.body, defaultTextColor(deck, slide, el))}
        </div>
      );
    case "shape":
      return (
        <div style={style} data-element-id={el.id}>
          <ShapeSvg el={el} w={w} h={h} />
          {(el.body || editing) && textBox(el.body, defaultTextColor(deck, slide, el), true)}
        </div>
      );
    case "image":
      return (
        <div style={style} data-element-id={el.id}>
          <img src={el.src} alt={el.alt ?? ""} draggable={false} style={{ width: "100%", height: "100%", objectFit: "fill" }} />
        </div>
      );
    case "table":
      return (
        <div style={style} data-element-id={el.id}>
          <table className="slide-table" style={{ fontSize: ptToPx(14, scale), fontFamily: theme.font, color: theme.text }}>
            <tbody>
              {el.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} style={el.header && r === 0 ? { background: theme.accent, color: "#fff", fontWeight: 700 } : undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Static rendering of a slide (thumbnails, presenter, print). */
export function SlideView({ deck, slide, scale, children, className }: { deck: Deck; slide: Slide; scale: number; children?: ReactNode; className?: string }) {
  const k = PX_PER_IN * scale;
  return (
    <div className={`slide-view ${className ?? ""}`} style={{ position: "relative", width: deck.width * k, height: deck.height * k, background: safe(slideBackground(deck, slide), "#ffffff"), overflow: "hidden" }}>
      {slide.elements.map((el) => (
        <ElementView key={el.id} deck={deck} slide={slide} el={el} scale={scale} />
      ))}
      {children}
    </div>
  );
}
