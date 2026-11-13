import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Tier } from './HeroScene';

interface Props {
  tier: Tier;
  reduced: boolean;
  active: boolean;
}

function WaveField({ tier, reduced }: Omit<Props, 'active'>) {
  const cols = tier === 'high' ? 140 : tier === 'mid' ? 90 : 60;
  const rows = tier === 'high' ? 70 : tier === 'mid' ? 45 : 30;
  const pointer = useRef(new THREE.Vector2(0, 0));
  const pointerTarget = useRef(new THREE.Vector2(0, 0));

  const { geometry, material } = useMemo(() => {
    const count = cols * rows;
    const pos = new Float32Array(count * 3);
    let i = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        pos[i++] = (x / (cols - 1) - 0.5) * 22;
        pos[i++] = 0;
        pos[i++] = (y / (rows - 1) - 0.5) * 11;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
        uPx: { value: Math.min(window.devicePixelRatio, 1.75) },
        uA: { value: new THREE.Color('#8d9098') },
        uB: { value: new THREE.Color('#e6cfa4') },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec2 uPointer; uniform float uPx;
        varying float vH; varying float vFade;
        void main() {
          vec3 p = position;
          float w = sin(p.x * 0.45 + uTime * 0.7) * 0.35 + cos(p.z * 0.6 + uTime * 0.5) * 0.3
                  + sin((p.x + p.z) * 0.25 - uTime * 0.4) * 0.25;
          float d = distance(p.xz, uPointer);
          w += sin(d * 2.2 - uTime * 3.0) * 0.35 * exp(-d * 0.45);
          p.y = w;
          vH = w;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.2 + (w + 0.8) * 2.2) * uPx * (10.0 / -mv.z);
          vFade = smoothstep(11.0, 3.0, abs(p.x)) * smoothstep(5.5, 1.0, abs(p.z));
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uA; uniform vec3 uB;
        varying float vH; varying float vFade;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d);
          vec3 c = mix(uA, uB, clamp(vH * 0.8 + 0.5, 0.0, 1.0));
          gl_FragColor = vec4(c, a * vFade * 0.75);
        }`,
    });
    return { geometry, material };
  }, [cols, rows]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      pointerTarget.current.set((e.clientX / window.innerWidth - 0.5) * 16, (e.clientY / window.innerHeight - 0.5) * 8);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [reduced]);

  useFrame((state, delta) => {
    if (reduced) return;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    pointer.current.lerp(pointerTarget.current, Math.min(1, delta * 3));
    material.uniforms.uPointer.value.copy(pointer.current);
  });

  return <points geometry={geometry} material={material} />;
}

export default function ContactScene({ tier, reduced, active }: Props) {
  return (
    <Canvas
      aria-hidden="true"
      dpr={tier === 'high' ? 1.5 : 1.15}
      frameloop={active ? (reduced ? 'demand' : 'always') : 'never'}
      camera={{ position: [0, 3.2, 7.5], fov: 50, near: 0.1, far: 50 }}
      onCreated={({ camera }) => camera.lookAt(0, -0.5, 0)}
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance', stencil: false, depth: false }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <WaveField tier={tier} reduced={reduced} />
    </Canvas>
  );
}
