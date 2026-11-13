import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { deviceTier, hasWebGL, usePageVisible, useReducedMotion } from '../lib/device';
import { markSceneReady, onSceneScroll, sceneInput, startSceneInput } from '../lib/sceneInput';
import { SceneBoundary } from './SceneBoundary';

const HeroScene = lazy(() => import('../three/HeroScene'));

/** Static CSS astrolabe shown when WebGL is unavailable or fails. */
function AstrolabeFallback() {
  const rings = [
    { size: '46vmin', border: 'rgba(212,185,138,.55)', rot: 'rotateX(68deg) rotateY(12deg)' },
    { size: '38vmin', border: 'rgba(201,204,211,.4)', rot: 'rotateX(20deg) rotateY(60deg)' },
    { size: '30vmin', border: 'rgba(212,185,138,.35)', rot: 'rotateX(80deg) rotateY(-30deg)' },
  ];
  return (
    <div className="absolute inset-0 lg:left-[40%]" style={{ perspective: '1200px' }} aria-hidden="true">
      <div className="absolute left-1/2 top-[30%] h-0 w-0 lg:top-1/2" style={{ transformStyle: 'preserve-3d' }}>
        {rings.map((r, i) => (
          <div
            key={i}
            className="fallback-ring"
            style={{ width: r.size, height: r.size, marginLeft: `calc(${r.size} / -2)`, marginTop: `calc(${r.size} / -2)`, border: `1px solid ${r.border}`, transform: r.rot }}
          />
        ))}
        <div className="absolute -ml-[5vmin] -mt-[5vmin] h-[10vmin] w-[10vmin] rotate-45 rounded-md bg-[linear-gradient(135deg,#f4f1ea,#8d9098_55%,#2a2b30)] shadow-[0_30px_60px_-20px_rgba(0,0,0,.9)]" />
      </div>
    </div>
  );
}

/**
 * Fixed, full-viewport stage behind the page. The Astrolabe lives here so it can travel
 * from the hero into the About section, then fade out (sceneInput.stage).
 */
export function HeroStage() {
  const wrap = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const visible = usePageVisible();
  const [tier] = useState(deviceTier);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => startSceneInput(), []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const ok = hasWebGL();
      setWebgl(ok);
      if (!ok) markSceneReady();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 1023px)');
    const apply = () => {
      const fadeForText = mobile.matches ? 1 - 0.65 * Math.min(1, sceneInput.hero * 1.4) : 1;
      const o = sceneInput.stage * fadeForText;
      if (wrap.current) wrap.current.style.opacity = o.toFixed(3);
      const a = sceneInput.stage > 0.01;
      setActive((prev) => (prev === a ? prev : a));
    };
    apply();
    return onSceneScroll(apply);
  }, []);

  return (
    <div ref={wrap} className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      <div className="grid-bg absolute inset-0 opacity-50" />
      {webgl === true && (
        <SceneBoundary fallback={<AstrolabeFallback />}>
          <Suspense fallback={null}>
            <HeroScene tier={tier} reduced={reduced} active={active && visible} />
          </Suspense>
        </SceneBoundary>
      )}
      {webgl === false && <AstrolabeFallback />}
      <div className="vignette absolute inset-0" />
    </div>
  );
}
