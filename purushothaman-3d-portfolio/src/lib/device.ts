import { useEffect, useState } from 'react';

const mq = (q: string) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null);

export function prefersReducedMotion(): boolean {
  return !!mq('(prefers-reduced-motion: reduce)')?.matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => !!mq(query)?.matches);
  useEffect(() => {
    const m = mq(query);
    if (!m) return;
    const on = () => setMatches(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');
export const useFinePointer = () => useMediaQuery('(hover: hover) and (pointer: fine)');

let webglCache: boolean | null = null;
export function hasWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    webglCache = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

/** Rough device tier used to scale 3D detail. */
export function deviceTier(): 'low' | 'mid' | 'high' {
  if (typeof window === 'undefined') return 'mid';
  const small = window.innerWidth < 768;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (small || cores <= 4 || mem <= 4) return small && cores <= 4 ? 'low' : 'mid';
  return 'high';
}

/** True while the element is within (or near) the viewport. */
export function useInView<T extends Element>(ref: React.RefObject<T>, rootMargin = '0px', once = false): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) io.disconnect();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, once]);
  return inView;
}

/** True while the document tab is visible. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}
