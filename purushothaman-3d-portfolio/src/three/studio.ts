import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * One procedural "photo studio" environment + a shared material library per renderer.
 * Materials receive the env map directly (instead of scene.environment) so they work inside drei <View> portals.
 * Reference counted: disposed when the last consumer unmounts (deferred a tick so StrictMode remounts are safe).
 */
export interface Studio {
  env: THREE.Texture;
  shadow: THREE.Texture;
  m: {
    chrome: THREE.MeshPhysicalMaterial;
    chromeFlat: THREE.MeshPhysicalMaterial;
    brushed: THREE.MeshPhysicalMaterial;
    gold: THREE.MeshPhysicalMaterial;
    goldBrushed: THREE.MeshPhysicalMaterial;
    graphite: THREE.MeshPhysicalMaterial;
    enamel: THREE.MeshPhysicalMaterial;
    paper: THREE.MeshPhysicalMaterial;
    frost: THREE.MeshPhysicalMaterial;
    ink: THREE.MeshStandardMaterial;
    line: THREE.MeshBasicMaterial;
    goldLine: THREE.MeshBasicMaterial;
    signal: THREE.MeshBasicMaterial;
  };
}

interface Entry {
  studio: Studio;
  refs: number;
  timer?: number;
}
const cache = new WeakMap<THREE.WebGLRenderer, Entry>();

function buildEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const disposables: { dispose: () => void }[] = [];
  const box = new THREE.BoxGeometry(30, 30, 30);
  const roomMat = new THREE.MeshBasicMaterial({ color: '#08080a', side: THREE.BackSide });
  scene.add(new THREE.Mesh(box, roomMat));
  disposables.push(box, roomMat);

  const plane = new THREE.PlaneGeometry(1, 1);
  disposables.push(plane);
  const panel = (w: number, h: number, color: string, intensity: number, pos: [number, number, number]) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    disposables.push(mat);
    const mesh = new THREE.Mesh(plane, mat);
    mesh.scale.set(w, h, 1);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel(12, 5, '#fff6ea', 3.2, [0, 11, 3]); // key softbox (warm)
  panel(4, 12, '#efe9df', 1.5, [-11, 2, 6]); // front-left fill
  panel(14, 0.7, '#ffffff', 4, [0, 4, 12]); // front strip → crisp specular streak
  panel(10, 5, '#f3eadb', 0.9, [2, -1, 13]); // soft frontal fill so camera-facing metal never reads black
  panel(3, 10, '#8f7cff', 1.4, [11, 1, -5]); // violet rim
  panel(3, 10, '#7fd8e8', 0.9, [-11, -1, -6]); // cyan rim
  panel(16, 6, '#d4b98a', 0.45, [0, -11, 0]); // champagne floor bounce

  const pmrem = new THREE.PMREMGenerator(gl);
  const rt = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());
  return rt.texture;
}

function buildShadow(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildStudio(gl: THREE.WebGLRenderer): Studio {
  const env = buildEnvironment(gl);
  const P = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial({ envMap: env, ...p });
  return {
    env,
    shadow: buildShadow(),
    m: {
      chrome: P({ color: '#eceef2', metalness: 1, roughness: 0.06, envMapIntensity: 1.25, clearcoat: 0.4 }),
      chromeFlat: P({ color: '#e6e8ec', metalness: 1, roughness: 0.05, envMapIntensity: 1.35, flatShading: true }),
      brushed: P({ color: '#c3c7ce', metalness: 1, roughness: 0.34, envMapIntensity: 1.05 }),
      gold: P({ color: '#d4b98a', metalness: 1, roughness: 0.2, envMapIntensity: 1.15 }),
      goldBrushed: P({ color: '#caa978', metalness: 1, roughness: 0.38, envMapIntensity: 1.05 }),
      graphite: P({ color: '#1b1c21', metalness: 0.7, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.9 }),
      enamel: P({ color: '#101116', metalness: 0.2, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1 }),
      paper: P({ color: '#e8e4db', metalness: 0, roughness: 0.62, envMapIntensity: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') }),
      frost: P({ color: '#d7dbe4', metalness: 0, roughness: 0.3, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
      ink: new THREE.MeshStandardMaterial({ color: '#16171b', roughness: 0.4, metalness: 0.2 }),
      line: new THREE.MeshBasicMaterial({ color: '#c9ccd3', transparent: true, opacity: 0.32, depthWrite: false }),
      goldLine: new THREE.MeshBasicMaterial({ color: '#d4b98a', transparent: true, opacity: 0.6, depthWrite: false }),
      signal: new THREE.MeshBasicMaterial({ color: '#9fe3ef', transparent: true, opacity: 0.9, toneMapped: false }),
    },
  };
}

function disposeStudio(s: Studio) {
  s.env.dispose();
  s.shadow.dispose();
  Object.values(s.m).forEach((m) => m.dispose());
}

export function useStudio(): Studio {
  const gl = useThree((s) => s.gl);
  const studio = useMemo(() => {
    let e = cache.get(gl);
    if (!e) {
      e = { studio: buildStudio(gl), refs: 0 };
      cache.set(gl, e);
    }
    return e.studio;
  }, [gl]);

  useEffect(() => {
    const e = cache.get(gl);
    if (!e) return;
    e.refs++;
    if (e.timer) window.clearTimeout(e.timer);
    return () => {
      e.refs--;
      if (e.refs <= 0) {
        e.timer = window.setTimeout(() => {
          if (e.refs <= 0) {
            disposeStudio(e.studio);
            cache.delete(gl);
          }
        }, 0);
      }
    };
  }, [gl]);

  return studio;
}

/** Ring band (bracelet-style) with chamfered edges, revolved around Y. */
export function bandGeometry(R: number, width: number, thick: number, segments = 128, chamfer = 0.008) {
  const c = Math.min(chamfer, width / 3, thick / 3);
  const h = width / 2;
  const pts = [
    [R, -h + c], [R + c, -h], [R + thick - c, -h], [R + thick, -h + c],
    [R + thick, h - c], [R + thick - c, h], [R + c, h], [R, h - c], [R, -h + c],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, segments);
}

/** Dispose helper for imperatively created geometries. */
export function useDisposable<T extends { dispose: () => void }>(factory: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const obj = useMemo(factory, deps);
  useEffect(() => () => obj.dispose(), [obj]);
  return obj;
}
