import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { markSceneReady, sceneInput } from '../lib/sceneInput';
import { bandGeometry, useDisposable, useStudio } from './studio';

export type Tier = 'low' | 'mid' | 'high';

interface Props {
  tier: Tier;
  reduced: boolean;
  active: boolean;
}

const damp = THREE.MathUtils.damp;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 4);
/** pick the representation of `target` (mod 2π) closest to `ref`, so blends never spin through extra turns */
const nearest = (target: number, ref: number) => target + Math.round((ref - target) / (Math.PI * 2)) * Math.PI * 2;

/* ---------------- Astrolabe ---------------- */
function Astrolabe({ reduced, tier }: { reduced: boolean; tier: Tier }) {
  const { m, shadow } = useStudio();
  const { viewport, size } = useThree();
  const desktop = size.width >= 1024;

  const root = useRef<THREE.Group>(null);
  const tiltG = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const cage = useRef<THREE.LineSegments>(null);
  const ringA = useRef<THREE.Group>(null);
  const ringB = useRef<THREE.Group>(null);
  const ringC = useRef<THREE.Group>(null);
  const orbitA = useRef<THREE.Group>(null);
  const orbitB = useRef<THREE.Group>(null);
  const beadA = useRef<THREE.Mesh>(null);
  const beadB = useRef<THREE.Mesh>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const t0 = useRef<number | null>(null);

  const seg = tier === 'low' ? 72 : 128;
  const bandA = useDisposable(() => bandGeometry(0.86, 0.075, 0.035, seg), [seg]);
  const bandB = useDisposable(() => bandGeometry(1.18, 0.13, 0.03, seg), [seg]);
  const bandC = useDisposable(() => bandGeometry(1.56, 0.05, 0.07, seg), [seg]);
  const coreGeo = useDisposable(() => new THREE.IcosahedronGeometry(0.5, 0), []);
  const cageGeo = useDisposable(() => {
    const ico = new THREE.IcosahedronGeometry(0.68, 1);
    const edges = new THREE.EdgesGeometry(ico);
    ico.dispose();
    return edges;
  }, []);
  const cageMat = useDisposable(() => new THREE.LineBasicMaterial({ color: '#c9ccd3', transparent: true, opacity: 0.16 }), []);
  const orbitGeoA = useDisposable(() => new THREE.TorusGeometry(2.3, 0.0035, 6, 220), []);
  const orbitGeoB = useDisposable(() => new THREE.TorusGeometry(1.95, 0.003, 6, 200), []);
  const tickGeo = useDisposable(() => new THREE.BoxGeometry(0.012, 0.012, 1), []);

  // 72 machined ticks around the bezel (instanced: one draw call)
  const ticks = useMemo(() => {
    const mesh = new THREE.InstancedMesh(tickGeo, m.gold, 72);
    const o = new THREE.Object3D();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const long = i % 6 === 0;
      const len = long ? 0.13 : 0.06;
      const r = 1.56 + 0.07 + 0.02 + len / 2;
      o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      o.rotation.set(0, -a + Math.PI / 2, 0);
      o.scale.set(long ? 1.6 : 1, 1, len);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [tickGeo, m.gold]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (t0.current === null && sceneInput.revealed) t0.current = t;
    const intro = reduced ? 1 : t0.current === null ? 0 : easeOut((t - t0.current) / 2.6);
    const { px, py, hero, about } = sceneInput;
    const k = reduced ? 0 : 1;
    const time = reduced ? 0 : t;

    // explode: rings fan into stacked layers while the hero scrolls out, then settle through About
    const e = smooth(0.08, 0.85, hero) * (1 - 0.55 * smooth(0.35, 0.9, about));

    // ----- placement: hero (right) → About (left column) -----
    const vw = viewport.width;
    const heroX = desktop ? Math.min(vw * 0.3, 4.2) : 0;
    const aboutX = desktop ? -Math.min(vw * 0.25, 3.5) : 0;
    const heroY = desktop ? -0.05 : viewport.height * 0.27;
    const x = THREE.MathUtils.lerp(heroX, aboutX, smooth(0.15, 1, hero));
    const y = THREE.MathUtils.lerp(heroY, desktop ? 0 : 0.3, smooth(0.2, 1, hero)) + about * 0.6;
    const baseScale = desktop ? 0.74 : Math.min(0.62, vw / 4.6);
    const s = baseScale * (0.72 + 0.28 * intro) * (1 - 0.14 * smooth(0.2, 1, hero));

    if (root.current) {
      const r = root.current;
      r.position.x = damp(r.position.x, x, 3, delta);
      r.position.y = damp(r.position.y, y + (1 - intro) * -0.6, 3, delta);
      r.scale.setScalar(damp(r.scale.x, s, 4, delta));
    }
    if (tiltG.current) {
      const g = tiltG.current;
      g.rotation.y = damp(g.rotation.y, px * 0.38 * k + hero * 0.85 - about * 0.5 + (1 - intro) * -1.2, 2.2, delta);
      g.rotation.x = damp(g.rotation.x, py * 0.22 * k + 0.18 + hero * 0.32 - about * 0.2, 2.2, delta);
      g.rotation.z = damp(g.rotation.z, -px * 0.05 * k + hero * 0.12, 2, delta);
    }

    if (core.current) {
      core.current.rotation.y = time * 0.32;
      core.current.rotation.x = time * 0.19;
      core.current.position.z = damp(core.current.position.z, e * 0.9, 3, delta);
    }
    if (cage.current) {
      cage.current.rotation.y = -time * 0.12;
      cage.current.rotation.z = time * 0.07;
      cage.current.scale.setScalar(1 + e * 0.25);
    }

    // rings: independent gimbal motion with natural timing, blended toward an aligned "layers" pose
    const anim: [number, number, number][] = [
      [time * 0.35 + Math.sin(time * 0.5) * 0.25, 0.45 + Math.sin(time * 0.21) * 0.2, 0],
      [1.15 + Math.sin(time * 0.33) * 0.3, time * 0.22, time * 0.11],
      [Math.PI / 2 + Math.sin(time * 0.27) * 0.28, Math.sin(time * 0.19) * 0.32, time * 0.06],
    ];
    const layerZ = [0.45, -0.25, -0.95];
    [ringA, ringB, ringC].forEach((ref, i) => {
      const g = ref.current;
      if (!g) return;
      const [ax, ay, az] = anim[i];
      g.rotation.set(
        THREE.MathUtils.lerp(ax, nearest(Math.PI / 2, ax), e),
        THREE.MathUtils.lerp(ay, nearest(0, ay), e),
        az,
      );
      g.position.z = damp(g.position.z, layerZ[i] * e * 1.4, 3, delta);
    });

    [orbitA, orbitB].forEach((ref) => {
      const g = ref.current;
      if (g) g.scale.setScalar(damp(g.scale.x, (1 + e * 0.22) * (0.6 + 0.4 * intro), 3, delta));
    });
    if (beadA.current) {
      const a = time * 0.42 + 0.6;
      beadA.current.position.set(Math.cos(a) * 2.3, Math.sin(a) * 2.3, 0);
    }
    if (beadB.current) {
      const a = -time * 0.29 + 2.2;
      beadB.current.position.set(Math.cos(a) * 1.95, Math.sin(a) * 1.95, 0);
    }
    if (shadowRef.current) {
      (shadowRef.current.material as THREE.MeshBasicMaterial).opacity = 0.75 * intro * (1 - e * 0.6);
    }
  });

  return (
    <group ref={root} position={[desktop ? 2.4 : 0, 0, 0]} scale={0.6}>
      <group ref={tiltG}>
        {/* spindle with gold caps */}
        <mesh material={m.chrome}>
          <cylinderGeometry args={[0.016, 0.016, 3.5, 12]} />
        </mesh>
        <mesh material={m.gold} position={[0, 1.78, 0]}>
          <sphereGeometry args={[0.055, 24, 24]} />
        </mesh>
        <mesh material={m.gold} position={[0, -1.78, 0]}>
          <sphereGeometry args={[0.055, 24, 24]} />
        </mesh>

        {/* faceted chrome core + fine cage */}
        <mesh ref={core} geometry={coreGeo} material={m.chromeFlat} />
        <lineSegments ref={cage} geometry={cageGeo} material={cageMat} />

        {/* nested rings */}
        <group ref={ringA}>
          <mesh geometry={bandA} material={m.gold} />
        </group>
        <group ref={ringB}>
          <mesh geometry={bandB} material={m.brushed} />
        </group>
        <group ref={ringC}>
          <mesh geometry={bandC} material={m.graphite} />
          <primitive object={ticks} />
        </group>

        {/* orbits */}
        <group rotation={[1.32, 0.22, 0]}>
          <group ref={orbitA}>
            <mesh geometry={orbitGeoA} material={m.line} />
            <mesh ref={beadA} material={m.chrome}>
              <sphereGeometry args={[0.05, 24, 24]} />
            </mesh>
          </group>
        </group>
        <group rotation={[0.42, -0.72, 0.3]}>
          <group ref={orbitB}>
            <mesh geometry={orbitGeoB} material={m.goldLine} />
            <mesh ref={beadB} material={m.gold}>
              <sphereGeometry args={[0.042, 24, 24]} />
            </mesh>
          </group>
        </group>
      </group>

      {/* soft contact shadow */}
      <mesh ref={shadowRef} position={[0, -2.25, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[4.2, 4.2, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadow} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ---------------- Bokeh dust: sparse, slow, depth-scaled (cheap fake depth-of-field) ---------------- */
function Dust({ count, reduced }: { count: number; reduced: boolean }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const geometry = useDisposable(() => {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 9;
      pos[i * 3 + 2] = -6 + Math.random() * 11;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count]);
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uScroll: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float seed; uniform float uTime; uniform float uPx; uniform float uScroll;
          varying float vSeed; varying float vBlur; varying float vAlpha;
          void main() {
            vec3 p = position;
            p.y += sin(uTime * 0.12 + seed * 6.28) * 0.35 + uScroll * (0.6 + seed * 1.6);
            p.x += cos(uTime * 0.09 + seed * 9.0) * 0.25;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float dist = -mv.z;
            float focus = abs(dist - 8.0);
            vBlur = clamp(focus / 5.0, 0.0, 1.0);
            gl_PointSize = (1.4 + seed * 1.6 + vBlur * 9.0) * uPx * (8.0 / dist);
            vAlpha = mix(0.55, 0.07, vBlur) * (0.6 + 0.4 * sin(uTime * 0.4 + seed * 30.0));
            vSeed = seed;
          }`,
        fragmentShader: /* glsl */ `
          varying float vSeed; varying float vBlur; varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float edge = mix(0.12, 0.45, vBlur);
            float a = 1.0 - smoothstep(0.5 - edge, 0.5, d);
            vec3 silver = vec3(0.86, 0.87, 0.9);
            vec3 champagne = vec3(0.92, 0.82, 0.64);
            gl_FragColor = vec4(mix(silver, champagne, step(0.6, vSeed)), a * vAlpha);
          }`,
      }),
    [],
  );
  useFrame((state) => {
    material.uniforms.uPx.value = dpr;
    material.uniforms.uScroll.value = sceneInput.hero + sceneInput.about;
    if (!reduced) material.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/** Tells the loader the hero has actually drawn a frame. */
function FirstFrame() {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    requestAnimationFrame(() => markSceneReady());
  });
  return null;
}

/* ---------------- Camera: mouse parallax + section-based dolly ---------------- */
function CameraRig({ reduced }: { reduced: boolean }) {
  useFrame((state, delta) => {
    const { px, py, hero, about } = sceneInput;
    const k = reduced ? 0 : 1;
    const cam = state.camera;
    cam.position.x = damp(cam.position.x, px * 0.45 * k, 2, delta);
    cam.position.y = damp(cam.position.y, -py * 0.3 * k + hero * 0.5, 2, delta);
    cam.position.z = damp(cam.position.z, 8.4 - hero * 0.7 + about * 0.5, 2, delta);
    cam.lookAt(0, hero * 0.25, 0);
  });
  return null;
}

export default function HeroScene({ tier, reduced, active }: Props) {
  const [dpr, setDpr] = useState(tier === 'high' ? 1.75 : tier === 'mid' ? 1.5 : 1.2);
  return (
    <Canvas
      aria-hidden="true"
      dpr={dpr}
      frameloop={active ? (reduced ? 'demand' : 'always') : 'never'}
      camera={{ position: [0, 0, 8.4], fov: 35, near: 0.1, far: 40 }}
      gl={{ antialias: tier !== 'low', alpha: true, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(1, d - 0.3))} />
      <ambientLight intensity={0.08} />
      <directionalLight position={[-4, 6, 5]} intensity={1.6} color="#fff1dc" />
      <pointLight position={[5, -1, -3]} intensity={10} color="#8f7cff" distance={14} />
      <pointLight position={[-6, -2, -2]} intensity={6} color="#7fd8e8" distance={14} />
      <FirstFrame />
      <CameraRig reduced={reduced} />
      <Astrolabe reduced={reduced} tier={tier} />
      <Dust count={tier === 'high' ? 260 : tier === 'mid' ? 160 : 90} reduced={reduced} />
    </Canvas>
  );
}
