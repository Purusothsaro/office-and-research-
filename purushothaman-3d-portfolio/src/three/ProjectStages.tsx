import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera, RoundedBox, View } from '@react-three/drei';
import * as THREE from 'three';
import type { ProjectVisualKind } from '../data/content';
import { useDisposable, useStudio } from './studio';

const damp = THREE.MathUtils.damp;

interface SceneProps {
  hovered: boolean;
  reduced: boolean;
}

export type { SceneProps };

/* ---------- shared stage: camera, lights, idle sway, hover lean, soft shadow ---------- */
export function Stage({ children, hovered, reduced, camZ = 6.2, shadowY = -1.3 }: SceneProps & { children: ReactNode; camZ?: number; shadowY?: number }) {
  const { shadow } = useStudio();
  const g = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!g.current) return;
    const t = reduced ? 0 : state.clock.elapsedTime;
    g.current.rotation.y = damp(g.current.rotation.y, Math.sin(t * 0.25) * 0.32 + (hovered ? 0.35 : 0), 2.5, delta);
    g.current.rotation.x = damp(g.current.rotation.x, hovered ? -0.08 : 0, 2.5, delta);
    g.current.position.y = Math.sin(t * 0.6) * 0.04;
  });
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.35, camZ]} fov={32} rotation={[-0.05, 0, 0]} />
      <ambientLight intensity={0.1} />
      <directionalLight position={[-3, 5, 4]} intensity={1.5} color="#fff2df" />
      <directionalLight position={[1, 0.5, 6]} intensity={0.55} color="#f3eadb" />
      <pointLight position={[4, 0.5, -2]} intensity={3.2} color="#8f7cff" distance={10} />
      <pointLight position={[-4, -1, -1]} intensity={2.2} color="#7fd8e8" distance={10} />
      <group ref={g}>{children}</group>
      <mesh position={[0, shadowY, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[3.6, 3.6, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadow} transparent opacity={0.7} depthWrite={false} />
      </mesh>
    </>
  );
}

/* ---------- 01 Just4Lawyer: balance scale + case-file slabs ---------- */
function Lawyer({ hovered, reduced }: SceneProps) {
  const { m } = useStudio();
  const beam = useRef<THREE.Group>(null);
  const panL = useRef<THREE.Group>(null);
  const panR = useRef<THREE.Group>(null);
  const bowl = useDisposable(
    () =>
      new THREE.LatheGeometry(
        [[0, 0], [0.18, 0.005], [0.3, 0.04], [0.37, 0.1], [0.38, 0.115]].map(([x, y]) => new THREE.Vector2(x, y)),
        48,
      ),
    [],
  );
  useFrame((state, delta) => {
    const t = reduced ? 0 : state.clock.elapsedTime;
    const tilt = hovered ? 0 : Math.sin(t * 0.9) * 0.14;
    if (beam.current) beam.current.rotation.z = damp(beam.current.rotation.z, tilt, 3, delta);
    const r = beam.current?.rotation.z ?? 0;
    // pans hang plumb
    if (panL.current) panL.current.rotation.z = -r;
    if (panR.current) panR.current.rotation.z = -r;
  });
  const Pan = ({ side, refObj, load }: { side: number; refObj: React.RefObject<THREE.Group>; load: 'files' | 'seal' }) => (
    <group position={[side * 1.0, 0, 0]}>
      <group ref={refObj}>
        {[-1, 0, 1].map((k) => (
          <mesh key={k} material={m.brushed} position={[k * 0.15, -0.36, k === 0 ? 0.15 : -0.08]} rotation={[k === 0 ? -0.2 : 0.11, 0, k * 0.2]}>
            <cylinderGeometry args={[0.004, 0.004, 0.74, 6]} />
          </mesh>
        ))}
        <mesh geometry={bowl} material={m.gold} position={[0, -0.76, 0]} />
        {load === 'files' ? (
          [0, 1, 2].map((i) => (
            <RoundedBox key={i} args={[0.42, 0.045, 0.3]} radius={0.012} smoothness={2} material={i === 1 ? m.paper : m.graphite} position={[0, -0.6 + i * 0.05, 0]} rotation={[0, i * 0.18, 0]} />
          ))
        ) : (
          <mesh material={m.goldBrushed} position={[0, -0.62, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.05, 40]} />
          </mesh>
        )}
      </group>
    </group>
  );
  return (
    <Stage hovered={hovered} reduced={reduced}>
      <group position={[0, -0.1, 0]}>
        <mesh material={m.graphite} position={[0, -1.12, 0]}>
          <cylinderGeometry args={[0.55, 0.6, 0.08, 64]} />
        </mesh>
        <mesh material={m.brushed} position={[0, -1.05, 0]}>
          <cylinderGeometry args={[0.32, 0.36, 0.06, 64]} />
        </mesh>
        <mesh material={m.brushed} position={[0, -0.1, 0]}>
          <cylinderGeometry args={[0.035, 0.05, 1.9, 24]} />
        </mesh>
        <mesh material={m.gold} position={[0, 0.92, 0]}>
          <sphereGeometry args={[0.07, 32, 32]} />
        </mesh>
        <group ref={beam} position={[0, 0.8, 0]}>
          <mesh material={m.chrome} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.022, 0.022, 2.1, 16]} />
          </mesh>
          <Pan side={-1} refObj={panL} load="files" />
          <Pan side={1} refObj={panR} load="seal" />
        </group>
      </group>
    </Stage>
  );
}

/* ---------- 02 EZ-Draft: bent sheets + OCR scan plane + gold frame corners ---------- */
function Draft({ hovered, reduced }: SceneProps) {
  const { m } = useStudio();
  const sheets = useRef<(THREE.Group | null)[]>([]);
  const scan = useRef<THREE.Group>(null);
  const sheetGeo = useDisposable(() => {
    const g = new THREE.PlaneGeometry(1.5, 2, 12, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, -0.12 * Math.pow(x / 0.75, 2));
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const lineGeo = useDisposable(() => new THREE.BoxGeometry(1, 0.022, 0.004), []);
  const lines = useMemo(() => Array.from({ length: 11 }, (_, i) => ({ y: 0.72 - i * 0.13, w: i === 0 ? 0.6 : 0.7 + ((i * 37) % 10) / 30 })), []);
  const glowMat = useDisposable(
    () => new THREE.MeshBasicMaterial({ color: '#7fd8e8', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  );
  useFrame((state, delta) => {
    const t = reduced ? 0.4 : state.clock.elapsedTime;
    sheets.current.forEach((s, i) => {
      if (!s) return;
      const fan = hovered ? 1 : 0;
      s.position.x = damp(s.position.x, (i - 1.5) * 0.06 + fan * (i - 1.5) * 0.32, 3, delta);
      s.position.z = damp(s.position.z, -i * 0.12 - fan * i * 0.08, 3, delta);
      s.rotation.y = damp(s.rotation.y, fan * (i - 1.5) * -0.18, 3, delta);
    });
    if (scan.current) scan.current.position.y = Math.sin(t * (hovered ? 2.2 : 1.1)) * 0.9;
  });
  return (
    <Stage hovered={hovered} reduced={reduced}>
      <group rotation={[0, -0.25, 0]} position={[0, 0.05, 0]}>
        {[3, 2, 1, 0].map((i) => (
          <group key={i} ref={(el) => (sheets.current[i] = el)}>
            <mesh geometry={sheetGeo} material={i === 0 ? m.paper : i === 1 ? m.brushed : m.frost} />
            {i === 0 &&
              lines.map((l, j) => (
                <mesh key={j} geometry={lineGeo} material={j === 0 ? m.gold : m.ink} position={[-0.6 + l.w / 2, l.y, 0.006 - 0.12 * Math.pow((-0.6 + l.w / 2) / 0.75, 2)]} scale={[l.w, j === 0 ? 1.6 : 1, 1]} />
              ))}
          </group>
        ))}
        {/* scan plane */}
        <group ref={scan} position={[0, 0, 0.12]}>
          <mesh material={m.signal}>
            <boxGeometry args={[1.66, 0.008, 0.008]} />
          </mesh>
          <mesh material={glowMat} position={[0, -0.09, 0]}>
            <planeGeometry args={[1.66, 0.18]} />
          </mesh>
        </group>
        {/* gold frame corners (OCR detection frame) */}
        {[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sy], i) => (
          <group key={i} position={[sx * 0.86, sy * 1.1, 0.18]}>
            <mesh material={m.gold} position={[-sx * 0.08, 0, 0]}>
              <boxGeometry args={[0.18, 0.018, 0.018]} />
            </mesh>
            <mesh material={m.gold} position={[0, -sy * 0.08, 0]}>
              <boxGeometry args={[0.018, 0.18, 0.018]} />
            </mesh>
          </group>
        ))}
      </group>
    </Stage>
  );
}

/* ---------- 03 eCourts: fluted columns (District / High / Supreme) joined by a sync conduit ---------- */
function flutedColumn(r: number, h: number) {
  const g = new THREE.CylinderGeometry(r, r * 1.04, h, 72, 1, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr < 1e-4) continue;
    const a = Math.atan2(z, x);
    const k = 1 - 0.075 * Math.pow(Math.abs(Math.cos(a * 9)), 3);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function Courts({ hovered, reduced }: SceneProps) {
  const { m } = useStudio();
  const cols = useMemo(() => [{ x: -1.05, h: 1.15 }, { x: 0, h: 1.6 }, { x: 1.05, h: 2.05 }], []);
  const base = -1.15;
  const geos = useDisposable(() => {
    const list = cols.map((c) => flutedColumn(0.16, c.h));
    return { list, dispose: () => list.forEach((g) => g.dispose()) };
  }, [cols]);
  const curve = useMemo(() => {
    const top = (c: { x: number; h: number }) => base + c.h + 0.12;
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(cols[0].x, top(cols[0]), 0),
      new THREE.Vector3(-0.52, top(cols[1]) + 0.35, 0.1),
      new THREE.Vector3(cols[1].x, top(cols[1]), 0),
      new THREE.Vector3(0.52, top(cols[2]) + 0.3, 0.1),
      new THREE.Vector3(cols[2].x, top(cols[2]), 0),
    ]);
  }, [cols]);
  const tube = useDisposable(() => new THREE.TubeGeometry(curve, 160, 0.009, 8, false), [curve]);
  const beads = useRef<(THREE.Mesh | null)[]>([]);
  const speed = useRef(0.12);
  useFrame((state, delta) => {
    speed.current = damp(speed.current, hovered ? 0.34 : 0.12, 3, delta);
    const t = reduced ? 0 : state.clock.elapsedTime;
    beads.current.forEach((b, i) => {
      if (!b) return;
      const u = (t * speed.current + i / 3) % 1;
      b.position.copy(curve.getPointAt(u));
    });
  });
  return (
    <Stage hovered={hovered} reduced={reduced} shadowY={-1.2}>
      <group position={[0, -0.1, 0]}>
        <RoundedBox args={[3.2, 0.06, 0.9]} radius={0.02} smoothness={2} material={m.graphite} position={[0, base - 0.03, 0]} />
        {cols.map((c, i) => (
          <group key={i} position={[c.x, base, 0]}>
            <mesh material={m.brushed} position={[0, 0.03, 0]}>
              <boxGeometry args={[0.42, 0.06, 0.42]} />
            </mesh>
            <mesh geometry={geos.list[i]} material={i === 2 ? m.chrome : m.brushed} position={[0, c.h / 2 + 0.06, 0]} />
            <mesh material={m.gold} position={[0, c.h + 0.09, 0]}>
              <boxGeometry args={[0.44, 0.06, 0.44]} />
            </mesh>
          </group>
        ))}
        <mesh geometry={tube} material={m.line} />
        {[0, 1, 2].map((i) => (
          <mesh key={i} ref={(el) => (beads.current[i] = el)} material={i === 0 ? m.gold : m.chrome}>
            <sphereGeometry args={[0.045, 20, 20]} />
          </mesh>
        ))}
      </group>
    </Stage>
  );
}

/* ---------- 04 eSign: fountain pen drawing a tube-geometry signature + gold seal ---------- */
function ESign({ hovered, reduced }: SceneProps) {
  const { m } = useStudio();
  const curve = useMemo(() => {
    const pts = [
      [-0.62, -0.25], [-0.5, 0.05], [-0.42, -0.2], [-0.3, 0.12], [-0.22, -0.18], [-0.1, 0.02],
      [0.0, -0.16], [0.1, 0.1], [0.18, -0.2], [0.3, 0.06], [0.42, -0.12], [0.62, -0.04],
    ];
    return new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0.03)), false, 'catmullrom', 0.6);
  }, []);
  const sig = useDisposable(() => new THREE.TubeGeometry(curve, 240, 0.011, 6, false), [curve]);
  const nib = useDisposable(() => new THREE.LatheGeometry([[0, 0], [0.012, 0.03], [0.04, 0.16], [0.045, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 32), []);
  const grip = useDisposable(() => new THREE.LatheGeometry([[0.045, 0.2], [0.05, 0.24], [0.05, 0.42], [0.058, 0.44]].map(([x, y]) => new THREE.Vector2(x, y)), 32), []);
  const body = useDisposable(() => new THREE.LatheGeometry([[0.058, 0.44], [0.062, 0.6], [0.06, 1.25], [0.045, 1.32], [0, 1.34]].map(([x, y]) => new THREE.Vector2(x, y)), 32), []);
  const pen = useRef<THREE.Group>(null);
  const seal = useRef<THREE.Group>(null);
  const prog = useRef(0);
  const total = sig.index!.count;
  useFrame((state, delta) => {
    const t = reduced ? 3 : state.clock.elapsedTime;
    const speed = hovered ? 0.55 : 0.28;
    const cycle = (t * speed) % 1.5; // draw, then hold
    const p = reduced ? 1 : Math.min(1, cycle);
    prog.current = p;
    sig.setDrawRange(0, Math.floor((p * total) / 6) * 6);
    const tip = curve.getPointAt(Math.max(0.001, p));
    if (pen.current) {
      pen.current.position.set(tip.x, tip.y, tip.z);
      pen.current.position.z = damp(pen.current.position.z, p >= 1 ? 0.45 : 0.03, 6, delta);
    }
    if (seal.current) {
      const target = p >= 1 ? 1 : 0.001;
      seal.current.scale.setScalar(damp(seal.current.scale.x, target, 5, delta));
      seal.current.rotation.z = (reduced ? 0 : state.clock.elapsedTime) * 0.4;
    }
  });
  return (
    <Stage hovered={hovered} reduced={reduced}>
      <group rotation={[-0.42, 0.18, 0]} position={[0, -0.05, 0]}>
        <RoundedBox args={[1.9, 2.4, 0.03]} radius={0.015} smoothness={2} material={m.paper} />
        {[0.82, 0.7, 0.58, 0.46, 0.34].map((y, i) => {
          const w = i === 0 ? 0.5 : 1.3 - (i % 2) * 0.25;
          return (
            <mesh key={i} material={m.ink} position={[-0.72 + w / 2, y, 0.017]}>
              <boxGeometry args={[w, 0.022, 0.002]} />
            </mesh>
          );
        })}
        <mesh material={m.gold} position={[0, -0.45, 0.017]}>
          <boxGeometry args={[1.4, 0.01, 0.002]} />
        </mesh>
        <mesh geometry={sig} material={m.ink} position={[0, -0.2, 0]} />
        <group ref={pen} rotation={[0.55, 0, -0.45]}>
          <group position={[0, -0.2, 0]}>
            <mesh geometry={nib} material={m.gold} />
            <mesh geometry={grip} material={m.chrome} />
            <mesh geometry={body} material={m.enamel} />
            <mesh material={m.gold} position={[0, 1.0, 0]}>
              <cylinderGeometry args={[0.064, 0.064, 0.04, 32]} />
            </mesh>
          </group>
        </group>
        <group ref={seal} position={[0.55, -0.82, 0.06]}>
          <mesh material={m.gold} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.19, 0.19, 0.05, 48]} />
          </mesh>
          <mesh material={m.chrome} position={[0, 0, 0.03]}>
            <torusGeometry args={[0.14, 0.012, 8, 48]} />
          </mesh>
        </group>
      </group>
    </Stage>
  );
}

/* ---------- 05 OctoGenie Office: four-block cube (Docs / Sheets / Slides / PDF) that explodes on hover ---------- */
function Office({ hovered, reduced }: SceneProps) {
  const { m } = useStudio();
  const cluster = useRef<THREE.Group>(null);
  const blocks = useRef<(THREE.Group | null)[]>([]);
  const cells = useMemo(
    () => [
      { pos: [-0.43, 0.43], mat: m.chrome, glyph: 'doc' },
      { pos: [0.43, 0.43], mat: m.brushed, glyph: 'sheet' },
      { pos: [-0.43, -0.43], mat: m.graphite, glyph: 'slide' },
      { pos: [0.43, -0.43], mat: m.gold, glyph: 'pdf' },
    ],
    [m],
  );
  useFrame((state, delta) => {
    const t = reduced ? 0 : state.clock.elapsedTime;
    if (cluster.current) {
      cluster.current.rotation.y = damp(cluster.current.rotation.y, Math.sin(t * 0.3) * 0.5 + 0.5, 2, delta);
      cluster.current.rotation.x = damp(cluster.current.rotation.x, 0.35 + Math.sin(t * 0.2) * 0.1, 2, delta);
    }
    blocks.current.forEach((b, i) => {
      if (!b) return;
      const [x, y] = cells[i].pos;
      const k = hovered ? 1.42 : 1;
      b.position.x = damp(b.position.x, x * k, 4, delta);
      b.position.y = damp(b.position.y, y * k, 4, delta);
      b.position.z = damp(b.position.z, hovered ? (i - 1.5) * 0.12 : 0, 4, delta);
      b.rotation.z = damp(b.rotation.z, hovered ? (i % 2 ? 0.12 : -0.12) : 0, 4, delta);
    });
  });
  const dark = m.enamel;
  const Glyph = ({ kind, onGold }: { kind: string; onGold: boolean }) => {
    const mat = onGold ? dark : kind === 'slide' ? m.gold : dark;
    const z = 0.41;
    if (kind === 'doc')
      return (
        <>
          {[0.18, 0.06, -0.06, -0.18].map((y, i) => (
            <mesh key={i} material={mat} position={[i === 0 ? -0.06 : 0, y, z]}>
              <boxGeometry args={[i === 0 ? 0.32 : 0.44, 0.035, 0.01]} />
            </mesh>
          ))}
        </>
      );
    if (kind === 'sheet')
      return (
        <>
          {[-1, 0, 1].flatMap((r) =>
            [-1, 0, 1].map((c) => (
              <mesh key={`${r}${c}`} material={r === 1 ? m.gold : mat} position={[c * 0.15, r * 0.15, z]}>
                <boxGeometry args={[0.12, 0.12, 0.01]} />
              </mesh>
            )),
          )}
        </>
      );
    if (kind === 'slide')
      return (
        <>
          <mesh material={mat} position={[0, 0.04, z]}>
            <boxGeometry args={[0.46, 0.3, 0.01]} />
          </mesh>
          <mesh material={mat} position={[0, -0.2, z]}>
            <boxGeometry args={[0.2, 0.03, 0.01]} />
          </mesh>
        </>
      );
    return (
      <>
        <mesh material={mat} position={[-0.03, -0.02, z]}>
          <boxGeometry args={[0.3, 0.4, 0.01]} />
        </mesh>
        <mesh material={m.chrome} position={[0.1, 0.16, z + 0.006]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
        </mesh>
      </>
    );
  };
  return (
    <Stage hovered={hovered} reduced={reduced} camZ={6.6}>
      <group ref={cluster} scale={0.9}>
        {cells.map((c, i) => (
          <group key={c.glyph} ref={(el) => (blocks.current[i] = el)} position={[c.pos[0], c.pos[1], 0]}>
            <RoundedBox args={[0.8, 0.8, 0.8]} radius={0.07} smoothness={3} material={c.mat} />
            <Glyph kind={c.glyph} onGold={c.mat === m.gold} />
          </group>
        ))}
      </group>
    </Stage>
  );
}

/* ---------- 06 WhatsApp Feedback: extruded chat bubbles + orbiting extruded rating stars ---------- */
function bubbleShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r * 0.6);
  s.lineTo(x - 0.18, y - 0.16); // tail
  s.lineTo(x + r, y);
  return s;
}
function starShape(R: number, r: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rad = i % 2 ? r : R;
    const px = Math.cos(a) * rad;
    const py = Math.sin(a) * rad;
    if (i === 0) s.moveTo(px, py);
    else s.lineTo(px, py);
  }
  s.closePath();
  return s;
}

function Feedback({ hovered, reduced }: SceneProps) {
  const { m } = useStudio();
  const bubble = useDisposable(() => {
    const g = new THREE.ExtrudeGeometry(bubbleShape(1.6, 1.0, 0.3), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 4, curveSegments: 16 });
    g.center();
    return g;
  }, []);
  const star = useDisposable(() => {
    const g = new THREE.ExtrudeGeometry(starShape(0.13, 0.055), { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2 });
    g.center();
    return g;
  }, []);
  const stars = useRef<(THREE.Mesh | null)[]>([]);
  const dots = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((state, delta) => {
    const t = reduced ? 9 : state.clock.elapsedTime;
    const lit = hovered ? 5 : Math.floor((t * 1.1) % 7); // rating fills in, holds, resets
    stars.current.forEach((s, i) => {
      if (!s) return;
      s.material = i < lit ? m.gold : m.graphite;
      const arcA = Math.PI * (0.78 - i * 0.14);
      const tx = hovered ? (i - 2) * 0.34 : Math.cos(arcA) * 1.25;
      const ty = hovered ? 1.0 : 0.15 + Math.sin(arcA) * 0.95;
      s.position.x = damp(s.position.x, tx, 4, delta);
      s.position.y = damp(s.position.y, ty + Math.sin(t * 1.4 + i) * 0.03, 4, delta);
      s.rotation.y = reduced ? 0 : t * 0.8 + i;
    });
    dots.current.forEach((d, i) => {
      if (d) d.position.y = 0.05 + Math.max(0, Math.sin(t * 5 - i * 0.7)) * 0.06;
    });
  });
  return (
    <Stage hovered={hovered} reduced={reduced} camZ={7}>
      <group position={[-0.15, -0.3, 0]} scale={0.78}>
        <mesh geometry={bubble} material={m.chrome} />
        {[-0.28, 0, 0.28].map((x, i) => (
          <mesh key={i} ref={(el) => (dots.current[i] = el)} material={m.enamel} position={[x, 0.05, 0.13]}>
            <sphereGeometry args={[0.07, 24, 24]} />
          </mesh>
        ))}
        <mesh geometry={bubble} material={m.gold} position={[0.85, -0.75, -0.45]} scale={[-0.55, 0.55, 0.55]} />
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} ref={(el) => (stars.current[i] = el)} geometry={star} material={m.graphite} position={[0, 1, 0.1]} />
        ))}
      </group>
    </Stage>
  );
}

const scenes: Record<ProjectVisualKind, (p: SceneProps) => JSX.Element> = {
  lawyer: Lawyer,
  draft: Draft,
  courts: Courts,
  esign: ESign,
  office: Office,
  feedback: Feedback,
};

/** DOM-side placeholder whose rectangle the shared canvas renders into. */
export function ProjectStage({ kind, hovered, reduced, index }: { kind: ProjectVisualKind; hovered: boolean; reduced: boolean; index: number }) {
  const Scene = scenes[kind];
  return (
    <View className="absolute inset-0" index={index + 2}>
      <Scene hovered={hovered} reduced={reduced} />
    </View>
  );
}

