import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera, RoundedBox, View } from '@react-three/drei';
import * as THREE from 'three';
import { useDisposable, useStudio } from './studio';

export type InterludeKind = 'neural' | 'code' | 'chip' | 'cloud';

interface Props {
  /** 0 → 1 as the band passes through the viewport */
  progress: MutableRefObject<number>;
  reduced: boolean;
}

const damp = THREE.MathUtils.damp;

/* ---------- shared band stage: wide framing, lights, soft shadow ---------- */
function BandStage({ children, camZ = 7 }: { children: React.ReactNode; camZ?: number }) {
  const { shadow } = useStudio();
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.3, camZ]} fov={30} rotation={[-0.04, 0, 0]} />
      <ambientLight intensity={0.1} />
      <directionalLight position={[-3, 5, 4]} intensity={1.4} color="#fff2df" />
      <directionalLight position={[1, 0.5, 6]} intensity={0.5} color="#f3eadb" />
      <pointLight position={[4, 1, -2]} intensity={3} color="#8f7cff" distance={10} />
      <pointLight position={[-4, -1, -1]} intensity={2} color="#7fd8e8" distance={10} />
      {children}
      <mesh position={[0, -1.45, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[5, 3, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadow} transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </>
  );
}

/* ---------- 01 Intelligence: neural network with travelling signals ---------- */
function Neural({ progress, reduced }: Props) {
  const { m } = useStudio();
  const group = useRef<THREE.Group>(null);
  const layers = useMemo(() => [4, 6, 6, 4, 2], []);
  const nodes = useMemo(() => {
    const out: THREE.Vector3[][] = [];
    layers.forEach((n, li) => {
      const x = (li - (layers.length - 1) / 2) * 1.05;
      out.push(Array.from({ length: n }, (_, i) => new THREE.Vector3(x, (i - (n - 1) / 2) * 0.42, Math.sin(li * 1.7 + i) * 0.25)));
    });
    return out;
  }, [layers]);

  const nodeGeo = useDisposable(() => new THREE.SphereGeometry(1, 24, 24), []);
  const nodeMesh = useMemo(() => {
    const flat = nodes.flat();
    const mesh = new THREE.InstancedMesh(nodeGeo, m.chrome, flat.length);
    const o = new THREE.Object3D();
    flat.forEach((p, i) => {
      o.position.copy(p);
      o.scale.setScalar(i % 5 === 0 ? 0.075 : 0.06);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [nodes, nodeGeo, m.chrome]);

  const edges = useDisposable(() => {
    const pts: number[] = [];
    for (let l = 0; l < nodes.length - 1; l++)
      for (const a of nodes[l]) for (const b of nodes[l + 1]) pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [nodes]);
  const edgeMat = useDisposable(() => new THREE.LineBasicMaterial({ color: '#c9ccd3', transparent: true, opacity: 0.13 }), []);

  // signals: each walks a random path layer → layer
  const PULSES = 16;
  const pulseGeo = useDisposable(() => new THREE.SphereGeometry(0.032, 12, 12), []);
  const pulses = useMemo(() => {
    const mesh = new THREE.InstancedMesh(pulseGeo, m.gold, PULSES);
    const state = Array.from({ length: PULSES }, (_, i) => ({ path: [] as number[], t: -i * 0.35 }));
    const pick = () => nodes.map((layer) => Math.floor(Math.random() * layer.length));
    state.forEach((s) => (s.path = pick()));
    return { mesh, state, pick };
  }, [pulseGeo, m.gold, nodes]);

  const tmp = useMemo(() => ({ o: new THREE.Object3D(), v: new THREE.Vector3() }), []);
  useFrame((state, delta) => {
    const p = progress.current;
    if (group.current) {
      group.current.rotation.y = damp(group.current.rotation.y, -0.55 + p * 1.1, 3, delta);
      group.current.rotation.x = damp(group.current.rotation.x, 0.12 - p * 0.1, 3, delta);
    }
    if (reduced) return;
    const t = state.clock.elapsedTime;
    pulses.state.forEach((s, i) => {
      s.t += delta * 1.1;
      if (s.t >= nodes.length - 1) {
        s.t = 0;
        s.path = pulses.pick();
      }
      const seg = Math.max(0, Math.floor(s.t));
      const f = Math.max(0, s.t - seg);
      const a = nodes[seg][s.path[seg]];
      const b = nodes[Math.min(seg + 1, nodes.length - 1)][s.path[Math.min(seg + 1, nodes.length - 1)]];
      tmp.v.copy(a).lerp(b, f);
      tmp.o.position.copy(tmp.v);
      tmp.o.scale.setScalar(s.t < 0 ? 0.0001 : 0.8 + Math.sin(t * 6 + i) * 0.2);
      tmp.o.updateMatrix();
      pulses.mesh.setMatrixAt(i, tmp.o.matrix);
    });
    pulses.mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <BandStage>
      <group ref={group} position={[-0.1, 0.05, 0]} scale={1.25}>
        <lineSegments geometry={edges} material={edgeMat} />
        <primitive object={nodeMesh} />
        <primitive object={pulses.mesh} />
        {/* output halo */}
        <mesh material={m.goldLine} position={[nodes[nodes.length - 1][0].x + 0.55, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.38, 0.006, 6, 64]} />
        </mesh>
      </group>
    </BandStage>
  );
}

/* ---------- 02 Craft: extruded </> with floating code lines and a blinking cursor ---------- */
function chevron(dir: 1 | -1) {
  const pts: [number, number][] = [
    [0.3, 0.62], [-0.42, 0], [0.3, -0.62], [0.42, -0.5], [-0.18, 0], [0.42, 0.5],
  ];
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x * dir, y) : s.lineTo(x * dir, y)));
  s.closePath();
  return s;
}
function slash() {
  const s = new THREE.Shape();
  [[0.14, 0.72], [0.3, 0.72], [-0.14, -0.72], [-0.3, -0.72]].forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}
function Code({ progress, reduced }: Props) {
  const { m } = useStudio();
  const extrude = { depth: 0.2, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 3 };
  const lt = useDisposable(() => new THREE.ExtrudeGeometry(chevron(1), extrude).center(), []);
  const gt = useDisposable(() => new THREE.ExtrudeGeometry(chevron(-1), extrude).center(), []);
  const sl = useDisposable(() => new THREE.ExtrudeGeometry(slash(), extrude).center(), []);
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  const mid = useRef<THREE.Mesh>(null);
  const cursor = useRef<THREE.Mesh>(null);
  const lines = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({ w: 0.5 + ((i * 53) % 10) / 9, x: -2.3 + ((i * 37) % 7) * 0.12 + (i % 3) * 1.6, y: 1.0 - (i % 5) * 0.48, z: -0.9 - (i % 3) * 0.35 })),
    [],
  );
  useFrame((state, delta) => {
    const p = progress.current;
    const t = reduced ? 0 : state.clock.elapsedTime;
    const spread = 0.82 + p * 0.35;
    if (left.current) {
      left.current.position.x = damp(left.current.position.x, -spread, 3, delta);
      left.current.rotation.y = damp(left.current.rotation.y, 0.5 - p * 0.9, 3, delta);
    }
    if (right.current) {
      right.current.position.x = damp(right.current.position.x, spread, 3, delta);
      right.current.rotation.y = damp(right.current.rotation.y, -0.5 + p * 0.9, 3, delta);
    }
    if (mid.current) {
      mid.current.rotation.y = damp(mid.current.rotation.y, (p - 0.5) * 1.2 + Math.sin(t * 0.6) * 0.15, 3, delta);
      mid.current.position.y = Math.sin(t * 0.8) * 0.05;
    }
    if (cursor.current) cursor.current.visible = reduced || Math.sin(t * 5) > -0.2;
  });
  return (
    <BandStage>
      {lines.map((l, i) => (
        <mesh key={i} material={i % 4 === 0 ? m.goldLine : m.line} position={[l.x, l.y, l.z]}>
          <boxGeometry args={[l.w, 0.04, 0.01]} />
        </mesh>
      ))}
      <mesh ref={left} geometry={lt} material={m.chrome} position={[-0.82, 0, 0]} />
      <mesh ref={mid} geometry={sl} material={m.gold} />
      <mesh ref={right} geometry={gt} material={m.chrome} position={[0.82, 0, 0]} />
      <mesh ref={cursor} material={m.signal} position={[1.55, -0.45, 0.1]}>
        <boxGeometry args={[0.16, 0.3, 0.04]} />
      </mesh>
    </BandStage>
  );
}

/* ---------- 03 Systems: processor die with pins, gold traces and data pulses ---------- */
function Chip({ progress, reduced }: Props) {
  const { m } = useStudio();
  const board = useRef<THREE.Group>(null);
  const die = useRef<THREE.Group>(null);
  const PINS = 10;
  const pinGeo = useDisposable(() => new THREE.BoxGeometry(0.05, 0.03, 0.16), []);
  const pins = useMemo(() => {
    const mesh = new THREE.InstancedMesh(pinGeo, m.chrome, PINS * 4);
    const o = new THREE.Object3D();
    let k = 0;
    for (let side = 0; side < 4; side++)
      for (let i = 0; i < PINS; i++) {
        const u = (i - (PINS - 1) / 2) * 0.13;
        const a = (side * Math.PI) / 2;
        o.position.set(Math.cos(a) * 0.86 + -Math.sin(a) * u, 0, Math.sin(a) * 0.86 + Math.cos(a) * u);
        o.rotation.set(0, -a + Math.PI / 2, 0);
        o.updateMatrix();
        mesh.setMatrixAt(k++, o.matrix);
      }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [pinGeo, m.chrome]);
  // traces: L-shaped gold runs from pins to the board edge
  const traces = useMemo(() => {
    const out: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
    for (let side = 0; side < 4; side++)
      for (let i = 0; i < PINS; i += 2) {
        const u = (i - (PINS - 1) / 2) * 0.13;
        const a = (side * Math.PI) / 2;
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const tan = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        const from = dir.clone().multiplyScalar(0.95).add(tan.clone().multiplyScalar(u));
        const len = side % 2 === 0 ? 1.4 + (i % 4) * 0.25 : 0.55 + (i % 4) * 0.12;
        out.push({ from, to: from.clone().add(dir.clone().multiplyScalar(len)) });
      }
    return out;
  }, []);
  const traceGeo = useDisposable(() => new THREE.BoxGeometry(1, 0.008, 0.022), []);
  const pulseRefs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((state, delta) => {
    const p = progress.current;
    if (board.current) {
      board.current.rotation.x = damp(board.current.rotation.x, 0.95 - p * 0.35, 3, delta);
      board.current.rotation.y = damp(board.current.rotation.y, -0.35 + p * 0.7, 3, delta);
    }
    if (die.current) die.current.position.y = damp(die.current.position.y, 0.06 + Math.sin(p * Math.PI) * 0.25, 3, delta);
    const t = reduced ? 0.5 : state.clock.elapsedTime;
    pulseRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const tr = traces[(i * 3) % traces.length];
      const u = (t * 0.5 + i * 0.37) % 1;
      mesh.position.lerpVectors(tr.from, tr.to, u);
    });
  });
  return (
    <BandStage camZ={6.6}>
      <group ref={board} position={[0, -0.15, 0]} rotation={[0.95, -0.35, 0]}>
        <RoundedBox args={[4.4, 0.06, 2.6]} radius={0.03} smoothness={2} material={m.ink} position={[0, -0.05, 0]} />
        {traces.map((tr, i) => {
          const mid = tr.from.clone().add(tr.to).multiplyScalar(0.5);
          const len = tr.from.distanceTo(tr.to);
          const ang = Math.atan2(tr.to.z - tr.from.z, tr.to.x - tr.from.x);
          return <mesh key={i} geometry={traceGeo} material={m.goldBrushed} position={[mid.x, -0.01, mid.z]} rotation={[0, -ang, 0]} scale={[len, 1, 1]} />;
        })}
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} ref={(el) => (pulseRefs.current[i] = el)} material={m.signal}>
            <boxGeometry args={[0.07, 0.02, 0.03]} />
          </mesh>
        ))}
        <group ref={die}>
          <primitive object={pins} />
          <RoundedBox args={[1.62, 0.12, 1.62]} radius={0.03} smoothness={2} material={m.graphite} />
          <RoundedBox args={[0.9, 0.04, 0.9]} radius={0.02} smoothness={2} material={m.brushed} position={[0, 0.08, 0]} />
          {Array.from({ length: 16 }, (_, i) => (
            <mesh key={i} material={i === 5 || i === 10 ? m.gold : m.graphite} position={[((i % 4) - 1.5) * 0.18, 0.105, (Math.floor(i / 4) - 1.5) * 0.18]}>
              <boxGeometry args={[0.13, 0.012, 0.13]} />
            </mesh>
          ))}
        </group>
      </group>
    </BandStage>
  );
}

/* ---------- 04 Infrastructure: server stack, status LEDs, data packets rising to a cloud ring ---------- */
function Cloud({ progress, reduced }: Props) {
  const { m } = useStudio();
  const slabs = useRef<(THREE.Group | null)[]>([]);
  const leds = useRef<(THREE.Mesh | null)[]>([]);
  const packets = useRef<(THREE.Mesh | null)[]>([]);
  const ring = useRef<THREE.Group>(null);
  const root = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    const p = progress.current;
    const t = reduced ? 0 : state.clock.elapsedTime;
    if (root.current) root.current.rotation.y = damp(root.current.rotation.y, -0.6 + p * 1.0, 3, delta);
    slabs.current.forEach((s, i) => {
      if (s) s.position.y = damp(s.position.y, -1.0 + i * (0.36 + p * 0.12), 3, delta);
    });
    leds.current.forEach((l, i) => {
      if (l) l.visible = reduced || Math.sin(t * (2 + (i % 5)) + i * 1.3) > -0.3;
    });
    packets.current.forEach((pk, i) => {
      if (!pk) return;
      const u = (t * 0.35 + i / 4) % 1;
      pk.position.set(Math.sin(i * 2.1) * 0.5, -0.9 + u * 2.6, Math.cos(i * 2.1) * 0.35);
      pk.rotation.y = t + i;
      pk.scale.setScalar(Math.sin(u * Math.PI) * 1);
    });
    if (ring.current) ring.current.rotation.z = t * 0.3;
  });
  return (
    <BandStage camZ={7.4}>
      <group ref={root}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} ref={(el) => (slabs.current[i] = el)} position={[0, -1 + i * 0.36, 0]}>
            <RoundedBox args={[1.9, 0.26, 1.15]} radius={0.03} smoothness={2} material={i === 3 ? m.brushed : m.graphite} />
            <mesh material={m.ink} position={[0, 0, 0.578]}>
              <boxGeometry args={[1.6, 0.14, 0.004]} />
            </mesh>
            {Array.from({ length: 5 }, (_, k) => (
              <mesh key={k} ref={(el) => (leds.current[i * 5 + k] = el)} material={k === 0 ? m.gold : m.signal} position={[-0.68 + k * 0.09, 0, 0.585]}>
                <sphereGeometry args={[0.018, 8, 8]} />
              </mesh>
            ))}
            <mesh material={m.goldLine} position={[0.45, 0, 0.583]}>
              <boxGeometry args={[0.5, 0.012, 0.004]} />
            </mesh>
          </group>
        ))}
        {Array.from({ length: 4 }, (_, i) => (
          <mesh key={i} ref={(el) => (packets.current[i] = el)} material={i % 2 ? m.gold : m.chrome}>
            <boxGeometry args={[0.07, 0.07, 0.07]} />
          </mesh>
        ))}
        <group position={[0, 1.15, 0]} rotation={[Math.PI / 2.3, 0, 0]}>
          <group ref={ring}>
            <mesh material={m.gold}>
              <torusGeometry args={[0.9, 0.022, 12, 96]} />
            </mesh>
            <mesh material={m.line}>
              <torusGeometry args={[1.25, 0.004, 6, 96]} />
            </mesh>
            {[0, 1, 2].map((k) => (
              <mesh key={k} material={m.chrome} position={[Math.cos((k * Math.PI * 2) / 3) * 1.25, Math.sin((k * Math.PI * 2) / 3) * 1.25, 0]}>
                <sphereGeometry args={[0.05, 16, 16]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </BandStage>
  );
}

const scenes: Record<InterludeKind, (p: Props) => JSX.Element> = { neural: Neural, code: Code, chip: Chip, cloud: Cloud };

/** DOM placeholder for an interlude scene rendered by the shared canvas. */
export default function InterludeStage({ kind, progress, reduced }: { kind: InterludeKind } & Props) {
  const Scene = scenes[kind];
  return (
    <View className="absolute inset-0" index={20}>
      <Scene progress={progress} reduced={reduced} />
    </View>
  );
}
