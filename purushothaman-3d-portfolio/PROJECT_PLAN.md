# Project Plan — Purushothaman Senthilkumar 3D Portfolio (v2)

## 1. Audit of the existing portfolio (v1)

| Area | v1 state | Decision |
| --- | --- | --- |
| Stack | React 18 + Vite 6 + raw Three.js, JSX, one 337-line `main.jsx`, minified CSS | Migrate to TypeScript + Tailwind v4 + React Three Fiber/Drei + GSAP. v1 kept in `legacy/` for reference only (not built). |
| Content | Resume-derived profile, 6 skill groups, 6 projects, 2 roles, education, certification | **Kept verbatim as the single source of truth**, moved to `src/data/content.ts`. Nothing new invented. |
| Hero 3D | Icosahedron + wireframe + 2 rings + 260 particles | Replaced with an original composition (see Design System §5). |
| Project filters | Working filter buttons (All / Legal Tech / Documents / Automation / Productivity) | **Kept**, now also re-measures the horizontal showcase. |
| Contact links | Working `mailto:` / `tel:` / LinkedIn | **Kept**, plus a copy-email button. |
| Mobile menu | Toggle menu | Kept, now with focus handling, Esc to close, and active-section indicator. |
| Gaps | No reduced-motion support, no WebGL fallback, renderer always running, no code splitting, no active nav state | All addressed below. |

No resume file was present in the workspace; the v1 site states its content was populated from the supplied resume, so that content is treated as the resume.

## 2. Research note (Dribbble / REA)

Dribbble's terms prohibit automated scraping, so REA was **not** pointed at Dribbble. The design direction is based on recurring, generic patterns of high-end 3D portfolios (cinematic dark stage, one strong hero object, editorial type, pinned horizontal case studies, restrained glass). No specific shot is reproduced.
REA is used on **our own build** for verification: page inspection, console errors, screenshots at desktop and mobile widths.

## 3. Information architecture

`Nav` (fixed) → `Hero` → `About` → `Experience` → `Skills` → `Projects` (pinned horizontal on desktop) → `Education` → `Contact` → `Footer`

Nav order matches the brief: About, Experience, Skills, Projects, Education, Contact.

## 4. Build stages

1. **Foundation**: TS/Tailwind/Vite config, design tokens, content module, GSAP registration, device/motion hooks.
2. **Hero**: lazy-loaded R3F scene "Folio Monolith", HTML headline with 3D character reveal, CTAs, meta, scroll cue, WebGL fallback.
3. **Nav + global**: active-section indicator, smooth anchor scrolling, scroll progress bar, cursor glow (fine pointers only).
4. **About**: editorial intro, counters (resume-backed only), floating CSS-3D glass shapes with pointer parallax.
5. **Experience**: timeline with scroll-scrubbed line drawing and node activation.
6. **Skills**: category filters, animated cards, interactive CSS-3D "tech orbit" sphere (drag/pointer rotate, category highlighting).
7. **Projects**: horizontal pinned showcase (desktop), stacked (mobile / reduced motion), tilt cards, original CSS-3D product visuals, `<dialog>` case-study details, filters.
8. **Education + Contact**: certification, contact with lazy R3F wave field, functional links.
9. **QA**: `tsc`, production build, REA screenshots + console audit at 1440 / 390 widths, reduced-motion pass.

## 5. Performance plan

- `three`, `@react-three/*` and `gsap` are separate chunks. Both 3D scenes are `React.lazy` and only mount when needed (contact scene mounts on approach).
- Canvas `frameloop` switches to `never` when off-screen (IntersectionObserver) and when the tab is hidden.
- DPR capped (desktop 1.75, mobile 1.25); particle counts and transmission disabled on mobile / low-core devices.
- No HDR downloads: reflections come from a local `Lightformer` environment.
- All geometries/materials are R3F-managed, so they're disposed automatically on unmount.
- `prefers-reduced-motion`: no GSAP scroll animations, no auto-rotation, no pinning, and static scenes.
- WebGL unavailable or a context error → CSS fallback composition (error boundary).
- No raster images, so nothing can break and there are no image-driven layout shifts; fonts use `display=swap` with fallback stacks.

## 6. Definition of done

- `npm run build` passes (`tsc --noEmit` + Vite).
- No console errors on load/scroll.
- Every nav link, filter, card, dialog, and contact link works with mouse, keyboard, and touch.
- Layout verified at desktop, tablet, and mobile widths.

---

# v3 — Luxury redesign ("Astrolabe")

## Audit of v2 (what holds it back)

| Problem in v2 | Fix in v3 |
| --- | --- |
| Neon violet/cyan gradients, glowing borders, gradient buttons, purple cursor blob, read as a "template" | Graphite and black with silver/champagne metal; violet and cyan only as faint rim light |
| Hero glass "pages" + 3D "PS" letters compete with the headline; the composition is busy | One sculptural object: a metal astrolabe/gyroscope with nested rings, a chrome core, bezel ticks and orbits |
| Hero object ends at the hero edge | Fixed stage: the object reconfigures on scroll (rings spread into layers, camera orbits) and moves into the About section, then fades out |
| Project visuals are flat CSS layers | Real WebGL compositions with custom geometry, in **one shared canvas** (drei `View`, scissored), so one renderer serves all six |
| Too many particles, additive glow | ~250 slow dust motes with normal blending; near ones are larger and softer (cheap bokeh instead of a DOF post-pass) |
| No loader, no magnetic buttons, plain cursor | Loader with counter and curtain lift; magnetic buttons with lighting that follows the pointer; dot + ring cursor with context labels |
| Uniform rounded-sans typography | Editorial pairing: expanded Archivo (uppercase display) + Instrument Serif italic accents + Manrope body + JetBrains Mono labels |

## Component plan

- `three/studio.ts` (new): one procedural PMREM studio environment plus shared metal materials (chrome, brushed silver, champagne gold, graphite, frosted). Reference-counted and disposed when unused.
- `three/HeroScene.tsx` (rewrite): the Astrolabe; driven by `lib/sceneInput.ts` (pointer + section-based scroll progress).
- `three/ProjectStages.tsx` (new): six custom-geometry scenes + `ProjectsCanvas` (single fixed canvas with `View.Port`).
- `components/Loader.tsx`, `components/Interactions.tsx` (magnetic + button light), `components/Cursor.tsx` (rewrite).
- Sections: Hero (new copy + masked line reveal), About (layout gives the travelling object a stage), Skills (editorial category index + restyled orbit), Experience (large serif years, champagne rail), Projects (WebGL views, clip-path reveals, animated tags), Contact (champagne/silver wave).

## Not done, on purpose

- No `@react-three/postprocessing` depth-of-field: a full-screen DOF pass on every frame costs too much for a portfolio. Atmospheric depth comes from fog and the depth-scaled bokeh motes instead.
- Framer Motion not added: GSAP already covers every animation, so a second animation runtime adds weight for nothing.
