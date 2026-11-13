import { useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerformanceMonitor, View } from '@react-three/drei';
import * as THREE from 'three';
import type { Tier } from './HeroScene';

/** Clears the whole canvas once per frame before the views draw (views only clear themselves when they hide). */
function FrameClear() {
  useFrame(({ gl }) => {
    gl.setScissorTest(false);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, false);
  }, 1);
  return null;
}

/**
 * One fixed, full-viewport, pointer-transparent canvas that renders every drei <View>
 * on the page (project scenes + interludes) via scissoring: one renderer, one GPU context.
 */
export default function SharedCanvas({ tier, active }: { tier: Tier; active: boolean }) {
  const [dpr, setDpr] = useState(tier === 'high' ? 1.6 : tier === 'mid' ? 1.4 : 1.15);
  return (
    <Canvas
      aria-hidden="true"
      dpr={dpr}
      frameloop={active ? 'always' : 'never'}
      gl={{ antialias: tier !== 'low', alpha: true, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 30 }}
    >
      <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(1, d - 0.25))} />
      <FrameClear />
      <View.Port />
    </Canvas>
  );
}
