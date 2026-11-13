import { useEffect, useSyncExternalStore, type RefObject } from 'react';

/**
 * Registry of DOM placeholders that the shared WebGL canvas draws into.
 * The canvas only renders while at least one of them is near the viewport.
 */
const near = new Set<Element>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function useViewActivity(ref: RefObject<Element>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) near.add(el);
        else near.delete(el);
        emit();
      },
      { rootMargin: '150px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      near.delete(el);
      emit();
    };
  }, [ref]);
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
export const useAnyViewNear = () => useSyncExternalStore(subscribe, () => near.size > 0, () => false);
