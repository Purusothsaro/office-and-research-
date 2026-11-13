# Design System — "Astrolabe" (v3)

Luxury, cinematic, quiet. Metal and light on graphite. The identity object is an **astrolabe**: an instrument for precise navigation. It stands for engineering complex systems (legal SaaS, documents, court automation, signatures) with precision.

## 1. Color tokens (`src/index.css` → `@theme`)

| Token | Value | Use |
| --- | --- | --- |
| `void` | `#060607` | Page background (near-black) |
| `ink` | `#0c0d10` | Raised surfaces |
| `graphite` | `#15161a` | Cards |
| `steel` | `#23252b` | Hairline-strong / inputs |
| `midnight` | `#0a1020` | Deep shadow washes |
| `fg` | `#ecebe7` | Primary text (warm white) |
| `muted` | `#9b9a96` | Secondary text (AA on void) |
| `dim` | `#66655f` | Tertiary / labels |
| `silver` | `#c9ccd3` | Metallic detail |
| `gold` | `#d4b98a` | Champagne accent: one per view, never a fill |
| `violet` / `cyan` | `#8f7cff` / `#7fd8e8` | **Light only**: rim lights and 1px signals |

Metallic text: `linear-gradient(100deg, #f2efe8, #c9ccd3 35%, #d4b98a 70%, #f5e7cc)`.

## 2. Typography

| Role | Font | Spec |
| --- | --- | --- |
| Display | Archivo (width 112–125, wght 600–800) | UPPERCASE, -0.02em, line-height 0.9 |
| Accent | Instrument Serif *italic* | One or two words per heading, mixed case |
| Body | Manrope 400–600 | 1rem–1.125rem / 1.7 |
| Label | JetBrains Mono 400 | 0.68rem uppercase, +0.2em |

## 3. Surfaces

- **Card**: graphite, 1px `rgba(255,255,255,.07)` hairline, 24–32px radius; on hover the hairline brightens to a 1px champagne arc under the pointer. No coloured glows.
- **Glass** (nav, dialog): 4% white fill, 18px blur.
- **Buttons**: primary = champagne metal (gradient light → dark gold, dark text), ghost = hairline; both magnetic with a pointer-following specular highlight.

## 4. 3D language

- Materials: chrome (metalness 1, roughness .06), brushed silver (roughness .32, anisotropy .7), champagne gold, graphite enamel, frosted glass. All lit by one procedural studio environment (warm key softbox, cool violet/cyan rim strips).
- **Hero — Astrolabe**: faceted chrome core on a gold-capped spindle, three nested rings (gold band, brushed band, graphite bezel with 72 machined ticks) rotating on independent gimbal axes, two elliptical orbits with beads, sparse bokeh dust, soft contact shadow. Scroll fans the rings into stacked layers, orbits the camera, and carries the object into About.
- **Projects**: one composition per product, each built from custom geometry:
  Just4Lawyer = balance scale + case-file slabs · EZ-Draft = bent sheets + scan plane · eCourts = fluted columns joined by a sync conduit with travelling beads · eSign = fountain pen drawing a tube-geometry signature + gold seal · OctoGenie Office = four-block cube that explodes on hover · WhatsApp Feedback = extruded chat bubbles + orbiting extruded stars.

## 5. Motion

| Pattern | Spec |
| --- | --- |
| Loader | 0–100 counter, then a curtain lift (`power4.inOut`, 1.1s); hero intro chains after it |
| Line mask reveal | Lines rise from `yPercent:105` in an overflow mask, stagger .12s, `expo.out` 1.4s |
| Section heading | Eyebrow hairline draws (scaleX), then lines mask-reveal |
| Project transition | Visual clip-path `inset(12% round 32px)` → `inset(0)`, tags stagger in |
| Scroll stage | Hero object state is a function of section progress (no time-based tweens), damped toward its target |
| Micro | 250–450ms; magnetic pull ≤ 30% of the offset; cursor ring 0.18 lerp |
| Reduced motion | No loader animation, no pin, no scrub, no auto-rotation; content immediately visible |

## 6. Accessibility

Semantic landmarks, single `h1`, skip link, visible champagne focus rings, canvases `aria-hidden`, native `<dialog>`, ≥ 4.5:1 body contrast, touch devices get no cursor/magnetic effects.
