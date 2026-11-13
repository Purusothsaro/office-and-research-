import { lazy, Suspense, useEffect, useState } from 'react';
import { deviceTier, hasWebGL, usePageVisible } from '../lib/device';
import { useAnyViewNear } from '../lib/viewActivity';
import { SceneBoundary } from './SceneBoundary';

const SharedCanvas = lazy(() => import('../three/SharedCanvas'));

let failed = false;
const failSubs = new Set<() => void>();
/** True when WebGL is available and the shared canvas has not crashed. Components use it to pick 3D vs CSS fallback. */
export function useSharedWebGL() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const update = () => setOk(!failed && hasWebGL());
    update();
    failSubs.add(update);
    return () => {
      failSubs.delete(update);
    };
  }, []);
  return ok;
}

/** Mounts the single shared canvas once; it renders only while a registered view is near the viewport. */
export function SharedCanvasHost() {
  const webgl = useSharedWebGL();
  const near = useAnyViewNear();
  const visible = usePageVisible();
  const [tier] = useState(deviceTier);
  const [mounted, setMounted] = useState(false);
  const active = webgl && near && visible;

  // mount lazily the first time any view approaches, then keep it (avoids context churn)
  useEffect(() => {
    if (active) setMounted(true);
  }, [active]);

  if (!webgl || !mounted) return null;
  return (
    <div style={{ visibility: active ? 'visible' : 'hidden' }} aria-hidden="true">
      <SceneBoundary
        fallback={null}
        onError={() => {
          failed = true;
          failSubs.forEach((f) => f());
        }}
      >
        <Suspense fallback={null}>
          <SharedCanvas tier={tier} active={active} />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
