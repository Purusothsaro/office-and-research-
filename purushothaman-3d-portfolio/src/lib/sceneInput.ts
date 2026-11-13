/**
 * Shared, mutable input for the WebGL scenes (no React re-renders).
 * hero:  0 → 1 while the hero scrolls out
 * about: 0 → 1 while the About section passes through the viewport
 * stage: opacity of the fixed hero stage (fades out after About)
 */
export const sceneInput = {
  px: 0,
  py: 0,
  hero: 0,
  about: 0,
  stage: 1,
  /** set once the loader curtain has lifted */
  revealed: false,
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

type Listener = () => void;
const listeners = new Set<Listener>();
export const onSceneScroll = (fn: Listener) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

let started = 0;
let stop: (() => void) | null = null;

/** Starts the global pointer/scroll feed; ref-counted so StrictMode double-mounts are safe. */
export function startSceneInput(): () => void {
  started++;
  if (started === 1) {
    let heroH = window.innerHeight;
    let aboutTop = heroH;
    let aboutH = heroH;
    let stageEnd = heroH * 2;
    const measure = () => {
      const hero = document.getElementById('top');
      const about = document.getElementById('about');
      heroH = hero?.offsetHeight || window.innerHeight;
      if (about) {
        const r = about.getBoundingClientRect();
        aboutTop = r.top + window.scrollY;
        aboutH = r.height;
      }
      const end = document.querySelector('[data-stage-end]');
      stageEnd = end ? end.getBoundingClientRect().top + window.scrollY : aboutTop + aboutH * 0.6;
      update();
    };
    const update = () => {
      const y = window.scrollY;
      const vh = window.innerHeight;
      sceneInput.hero = clamp01(y / heroH);
      sceneInput.about = clamp01((y - aboutTop + vh * 0.2) / Math.max(1, aboutH));
      // fade the stage out before the element marked [data-stage-end] rises into the object's zone
      sceneInput.stage = 1 - smooth(stageEnd - vh * 0.95, stageEnd - vh * 0.6, y);
      listeners.forEach((l) => l());
    };
    const onMove = (e: PointerEvent) => {
      sceneInput.px = (e.clientX / window.innerWidth) * 2 - 1;
      sceneInput.py = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    measure();
    stop = () => {
      ro.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('pointermove', onMove);
    };
  }
  return () => {
    started--;
    if (started === 0) {
      stop?.();
      stop = null;
    }
  };
}

/** Loader → hero handshake */
let revealResolve: () => void;
export const revealed = new Promise<void>((r) => (revealResolve = r));
export function markRevealed() {
  if (sceneInput.revealed) return;
  sceneInput.revealed = true;
  revealResolve();
}

/** Hero stage → loader handshake: resolves when the hero scene has drawn (or WebGL is unavailable). */
let sceneReadyResolve: () => void;
export const sceneReady = new Promise<void>((r) => (sceneReadyResolve = r));
export const markSceneReady = () => sceneReadyResolve();
