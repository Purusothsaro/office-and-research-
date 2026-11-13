/**
 * Minimal PDF content-stream interpreter used to remove specific text runs.
 *
 * It tokenises the stream, tracks the graphics/text state needed to know where
 * each text-showing operator starts (CTM, text matrix, font size, spacing,
 * fill colour), and rewrites the stream with chosen operators replaced by a
 * glyph-free TJ that preserves the text advance, so following text doesn't
 * move. Text inside form XObjects or Type3 glyph procedures is not reached.
 */

export type Matrix = [number, number, number, number, number, number];

export interface FontMetrics {
  /** Glyph width in 1/1000 text-space units for a character code. */
  width(code: number): number;
  /** Bytes per character code (2 for Type0/CID fonts). */
  bytesPerCode: 1 | 2;
}

export interface ShowOp {
  /** Text origin in user space. */
  x: number;
  y: number;
  /** Effective font size in user space. */
  size: number;
  /** Total advance in user space along the baseline. */
  advance: number;
  /** Fill colour as RGB 0..1. */
  color: [number, number, number];
  /** Byte span of the operands + operator in the source. */
  start: number;
  end: number;
  /** Replacement that keeps the text position when this op is removed. */
  replacement: string;
}

type Token =
  | { kind: "num"; value: number; start: number; end: number }
  | { kind: "str"; bytes: number[]; start: number; end: number }
  | { kind: "name"; value: string; start: number; end: number }
  | { kind: "arr-start" | "arr-end" | "dict"; start: number; end: number }
  | { kind: "op"; value: string; start: number; end: number }
  | { kind: "arr"; items: Token[]; start: number; end: number };

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

function* tokens(src: Uint8Array): Generator<Token> {
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (WS.has(c)) {
      i++;
      continue;
    }
    if (c === 0x25) {
      // Comment to end of line.
      while (i < n && src[i] !== 0x0a && src[i] !== 0x0d) i++;
      continue;
    }
    const start = i;
    if (c === 0x28) {
      // Literal string with nesting and escapes.
      const bytes: number[] = [];
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const b = src[i]!;
        if (b === 0x5c) {
          const e = src[i + 1]!;
          i += 2;
          const map: Record<number, number> = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12, 0x28: 0x28, 0x29: 0x29, 0x5c: 0x5c };
          if (map[e] !== undefined) bytes.push(map[e]);
          else if (e >= 0x30 && e <= 0x37) {
            let oct = e - 0x30;
            for (let k = 0; k < 2 && src[i]! >= 0x30 && src[i]! <= 0x37; k++) oct = oct * 8 + (src[i++]! - 0x30);
            bytes.push(oct & 0xff);
          } else if (e === 0x0d) {
            if (src[i] === 0x0a) i++;
          } else if (e !== 0x0a) bytes.push(e);
          continue;
        }
        if (b === 0x28) depth++;
        if (b === 0x29 && --depth === 0) {
          i++;
          break;
        }
        bytes.push(b);
        i++;
      }
      yield { kind: "str", bytes, start, end: i };
      continue;
    }
    if (c === 0x3c && src[i + 1] === 0x3c) {
      // Dictionary (only inside inline images / marked content); skip to matching >>.
      let depth = 0;
      while (i < n) {
        if (src[i] === 0x3c && src[i + 1] === 0x3c) {
          depth++;
          i += 2;
        } else if (src[i] === 0x3e && src[i + 1] === 0x3e) {
          depth--;
          i += 2;
          if (depth === 0) break;
        } else i++;
      }
      yield { kind: "dict", start, end: i };
      continue;
    }
    if (c === 0x3c) {
      // Hex string.
      i++;
      let hex = "";
      while (i < n && src[i] !== 0x3e) {
        if (!WS.has(src[i]!)) hex += String.fromCharCode(src[i]!);
        i++;
      }
      i++;
      if (hex.length % 2) hex += "0";
      const bytes: number[] = [];
      for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2), 16) || 0);
      yield { kind: "str", bytes, start, end: i };
      continue;
    }
    if (c === 0x5b || c === 0x5d) {
      i++;
      yield { kind: c === 0x5b ? "arr-start" : "arr-end", start, end: i };
      continue;
    }
    if (c === 0x2f) {
      i++;
      while (i < n && !WS.has(src[i]!) && !DELIM.has(src[i]!)) i++;
      yield { kind: "name", value: new TextDecoder().decode(src.subarray(start + 1, i)), start, end: i };
      continue;
    }
    while (i < n && !WS.has(src[i]!) && !DELIM.has(src[i]!)) i++;
    if (i === start) {
      i++;
      continue;
    }
    const word = new TextDecoder().decode(src.subarray(start, i));
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) yield { kind: "num", value: Number(word), start, end: i };
    else {
      yield { kind: "op", value: word, start, end: i };
      if (word === "ID") {
        // Inline image data: skip to whitespace + "EI" + whitespace/end.
        i++;
        while (i < n && !(WS.has(src[i - 1]!) && src[i] === 0x45 && src[i + 1] === 0x49 && (i + 2 >= n || WS.has(src[i + 2]!)))) i++;
        const eiStart = i;
        i += 2;
        yield { kind: "op", value: "EI", start: eiStart, end: i };
      }
    }
  }
}

const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** Finds every text-showing operator with its position and byte span. */
export function findShowOps(src: Uint8Array, fontFor: (name: string) => FontMetrics | null): ShowOp[] {
  const ops: ShowOp[] = [];
  let ctm: Matrix = IDENTITY;
  const stack: { ctm: Matrix; color: [number, number, number]; ts: typeof ts }[] = [];
  let ts = { tc: 0, tw: 0, th: 1, tl: 0, tfs: 0, rise: 0, font: null as FontMetrics | null };
  let color: [number, number, number] = [0, 0, 0];
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let operands: Token[] = [];
  let arrayDepth = 0;
  let array: Token[] = [];

  const advanceOf = (bytes: number[]): number => {
    const f = ts.font;
    let tx = 0;
    const per = f?.bytesPerCode ?? 1;
    for (let k = 0; k + per - 1 < bytes.length; k += per) {
      const code = per === 2 ? (bytes[k]! << 8) | bytes[k + 1]! : bytes[k]!;
      const w = f ? f.width(code) : 500;
      tx += ((w / 1000) * ts.tfs + ts.tc + (per === 1 && code === 32 ? ts.tw : 0)) * ts.th;
    }
    return tx;
  };
  const nextLine = () => {
    tlm = mul([1, 0, 0, 1, 0, -ts.tl], tlm);
    tm = tlm;
  };
  const record = (start: number, end: number, tx: number, prefix: string) => {
    const trm = mul(tm, ctm);
    const [x, y] = apply(trm, 0, ts.rise);
    const scaleY = Math.hypot(trm[2], trm[3]);
    const scaleX = Math.hypot(trm[0], trm[1]);
    const kern = ts.tfs * ts.th !== 0 ? (-tx * 1000) / (ts.tfs * ts.th) : 0;
    ops.push({ x, y, size: ts.tfs * scaleY, advance: tx * scaleX, color, start, end, replacement: `${prefix}[${fmt(kern)}] TJ` });
    tm = mul([1, 0, 0, 1, tx, 0], tm);
  };

  for (const t of tokens(src)) {
    if (t.kind === "arr-start") {
      arrayDepth++;
      if (arrayDepth === 1) array = [t];
      continue;
    }
    if (t.kind === "arr-end") {
      arrayDepth--;
      if (arrayDepth === 0) operands.push({ kind: "arr", items: array.slice(1), start: array[0]!.start, end: t.end });
      continue;
    }
    if (arrayDepth > 0) {
      array.push(t);
      continue;
    }
    if (t.kind !== "op") {
      operands.push(t);
      continue;
    }
    const nums = operands.filter((o): o is Extract<Token, { kind: "num" }> => o.kind === "num").map((o) => o.value);
    const opStart = operands[0]?.start ?? t.start;
    switch (t.value) {
      case "q":
        stack.push({ ctm, color, ts: { ...ts } });
        break;
      case "Q": {
        const s = stack.pop();
        if (s) {
          ctm = s.ctm;
          color = s.color;
          ts = s.ts;
        }
        break;
      }
      case "cm":
        if (nums.length === 6) ctm = mul(nums as Matrix, ctm);
        break;
      case "BT":
        tm = tlm = IDENTITY;
        break;
      case "Tf": {
        const name = operands.find((o) => o.kind === "name") as Extract<Token, { kind: "name" }> | undefined;
        ts.font = name ? fontFor(name.value) : null;
        ts.tfs = nums[0] ?? ts.tfs;
        break;
      }
      case "Tc":
        ts.tc = nums[0] ?? 0;
        break;
      case "Tw":
        ts.tw = nums[0] ?? 0;
        break;
      case "Tz":
        ts.th = (nums[0] ?? 100) / 100;
        break;
      case "TL":
        ts.tl = nums[0] ?? 0;
        break;
      case "Ts":
        ts.rise = nums[0] ?? 0;
        break;
      case "Td":
        tlm = mul([1, 0, 0, 1, nums[0] ?? 0, nums[1] ?? 0], tlm);
        tm = tlm;
        break;
      case "TD":
        ts.tl = -(nums[1] ?? 0);
        tlm = mul([1, 0, 0, 1, nums[0] ?? 0, nums[1] ?? 0], tlm);
        tm = tlm;
        break;
      case "Tm":
        if (nums.length === 6) tm = tlm = nums as Matrix;
        break;
      case "T*":
        nextLine();
        break;
      case "g":
        color = [nums[0] ?? 0, nums[0] ?? 0, nums[0] ?? 0];
        break;
      case "rg":
        if (nums.length === 3) color = nums as [number, number, number];
        break;
      case "k":
        if (nums.length === 4) {
          const [c, m, y, k] = nums as [number, number, number, number];
          color = [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
        }
        break;
      case "sc":
      case "scn":
        if (nums.length === 3) color = nums as [number, number, number];
        else if (nums.length === 1) color = [nums[0]!, nums[0]!, nums[0]!];
        break;
      case "Tj": {
        const s = operands.find((o) => o.kind === "str") as Extract<Token, { kind: "str" }> | undefined;
        if (s) record(opStart, t.end, advanceOf(s.bytes), "");
        break;
      }
      case "'": {
        nextLine();
        const s = operands.find((o) => o.kind === "str") as Extract<Token, { kind: "str" }> | undefined;
        if (s) record(opStart, t.end, advanceOf(s.bytes), "");
        break;
      }
      case '"': {
        ts.tw = nums[0] ?? ts.tw;
        ts.tc = nums[1] ?? ts.tc;
        nextLine();
        const s = operands.find((o) => o.kind === "str") as Extract<Token, { kind: "str" }> | undefined;
        if (s) record(opStart, t.end, advanceOf(s.bytes), `${fmt(ts.tw)} Tw ${fmt(ts.tc)} Tc `);
        break;
      }
      case "TJ": {
        const arr = operands.find((o): o is Extract<Token, { kind: "arr" }> => o.kind === "arr");
        let tx = 0;
        for (const item of arr?.items ?? []) {
          if (item.kind === "str") tx += advanceOf(item.bytes);
          else if (item.kind === "num") tx += (-item.value / 1000) * ts.tfs * ts.th;
        }
        record(opStart, t.end, tx, "");
        break;
      }
    }
    // A ' or " also moved to the next line, which a plain TJ won't repeat.
    if (t.value === "'" || t.value === '"') ops[ops.length - 1]!.replacement = `T* ${ops[ops.length - 1]!.replacement}`;
    operands = [];
  }
  return ops;
}

/** Returns the stream with the given operators replaced by their position-preserving equivalents. */
export function removeShowOps(src: Uint8Array, remove: ShowOp[]): Uint8Array {
  const sorted = [...remove].sort((a, b) => a.start - b.start);
  const parts: Uint8Array[] = [];
  const enc = new TextEncoder();
  let pos = 0;
  for (const op of sorted) {
    if (op.start < pos) continue;
    parts.push(src.subarray(pos, op.start), enc.encode(op.replacement));
    pos = op.end;
  }
  parts.push(src.subarray(pos));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export interface TextTarget {
  /** Item transform from pdf.js: [a, b, c, d, x, y] in user space. */
  transform: Matrix;
  width: number;
  size: number;
}

/** Show operators that start on the target's baseline within its width. */
export function opsForTarget(ops: ShowOp[], target: TextTarget): ShowOp[] {
  const [a, b, c, d, ex, ey] = target.transform;
  const ul = Math.hypot(a, b) || 1;
  const vl = Math.hypot(c, d) || 1;
  const u = [a / ul, b / ul];
  const v = [c / vl, d / vl];
  return ops.filter((op) => {
    const dx = op.x - ex;
    const dy = op.y - ey;
    const along = dx * u[0]! + dy * u[1]!;
    const perp = dx * v[0]! + dy * v[1]!;
    const sizeOk = op.size === 0 || target.size === 0 || (op.size / target.size > 0.6 && op.size / target.size < 1.6);
    return sizeOk && Math.abs(perp) < Math.max(1, target.size * 0.4) && along >= -1.5 && along <= Math.max(1, target.width - 0.5);
  });
}
