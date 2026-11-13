# Purushothaman Senthilkumar — 3D Portfolio (v3 · "Astrolabe")

An immersive, 3D portfolio built with **React 18 + TypeScript + Vite 6 + Tailwind CSS v4 + Three.js (React Three Fiber / Drei) + GSAP ScrollTrigger**.

- `PROJECT_PLAN.md`: audit of v1, build stages, performance plan, definition of done.
- `DESIGN_SYSTEM.md`: color/type tokens, surfaces, 3D language, motion spec, accessibility rules.
- `legacy/`: the original v1 single-file site, kept for reference (not built).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit + vite build → dist/
npm run preview
```

## Where things live

| Path | What |
| --- | --- |
| `src/data/content.ts` | **All text content**: profile, stats, skills, projects, experience, education. Edit here only. |
| `src/three/HeroScene.tsx` | "Astrolabe" hero sculpture (lazy-loaded), drawn on a fixed stage so it travels from the hero into About |
| `src/three/ProjectStages.tsx` | Six custom-geometry project scenes, all rendered by **one** shared canvas (drei `View`) |
| `src/three/studio.ts` | Procedural studio environment + shared metal materials (ref-counted, disposed when unused) |
| `src/three/ContactScene.tsx` | GPU particle wave behind Contact (lazy-loaded on approach) |
| `src/lib/sceneInput.ts` | Pointer + section-based scroll progress that drives the 3D, loader ↔ hero handshake |
| `src/components/Loader.tsx`, `Interactions.tsx`, `Cursor.tsx` | Loading curtain, magnetic buttons + button light, desktop cursor |
| `src/components/ProjectVisual.tsx` | CSS-3D illustrations, used in the case-study dialog and as the no-WebGL fallback |
| `src/sections/*` | Page sections |
| `src/lib/device.ts` | Reduced-motion, WebGL detection, device tier, in-view hooks |

## Behaviour notes

- 3D scenes pause when off-screen or when the tab is hidden; DPR and particle counts scale by device tier, and drop automatically if the frame rate falls.
- No WebGL, or a WebGL error → CSS fallback composition.
- `prefers-reduced-motion` → no scroll animations, pinning, auto-rotation, or cursor effects; all content is shown immediately.
- Projects scroll horizontally (pinned) on screens ≥ 1024px and stack vertically below that.

## Before publishing

- Confirm the phone number and email should be public.
- Add a GitHub URL or live demo links in `content.ts` if you want them shown (the resume did not include any).
