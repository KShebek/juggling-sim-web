# CLAUDE.md

Sandbox juggling simulator for the browser: siteswap, hand order (handswap), sync and
multiplex, played with keyboard or a game controller (Nintendo Switch Pro). No score in Free
Juggle. Read `CONTEXT.md` (design), `DECISIONS.md` (what's settled, newest first) and
`ROADMAP.md` (what's next) before changing behaviour.

## Commands
```
npm test          # node tests/run.js — core tests (86), must stay green
npm run build     # node tools/build.js — bundles everything into dist/juggle.html
npm run serve     # local server; open the localhost URL (ES modules don't load from file://)
```
`dist/juggle.html` is the double-click version; it's gitignored, so rebuild after UI changes.
Node 18+, no dependencies.

## Layout
- `src/core/` — engine. Notation parsing/validation, hand order, compile, state, schedule,
  timing, geometry, config, and the headless `Engine` (`createEngine(config)`, `update(dt)`
  returns events, `snapshot()`, input methods `throwNow`, `setNext`, `setNextFor`, `pickup`,
  `setPirouette`, `spin`). **No browser APIs in core.**
- `src/input/` — `bindings.js` (defaults, saved in localStorage, rebinding), `keyboard.js`,
  `gamepad.js` (two controller schemes: **dial** and **buttons**), `router.js` (maps actions to
  the engine per level).
- `src/render/renderer.js` — canvas drawing (juggler, hands, balls, floor, ladder, dials/button
  diamonds, preview arcs, readout).
- `src/modes/free-juggle.js` — the Free Juggle screen: panel wiring, engine (re)build, frame loop.
- `index.html` — page + panel markup and CSS. `tools/build.js` — the bundler. `tests/run.js`.
- `archive/` — the original single-file sims 1–3, unchanged; reference only.

## Conventions
- Plain JavaScript ES modules, no runtime dependencies.
- **Imports/exports must be single-line** (`import { a, b } from './x.js';`, `export function …`,
  `export { a } from './x.js';`): `tools/build.js` only understands these forms.
- Core changes come with tests in `tests/run.js`. UI changes: check in a headless browser if one
  is available (Playwright + Chrome worked: load `dist/juggle.html`, press keys, screenshot;
  fake a gamepad by overriding `navigator.getGamepads` in an init script). `window.__juggle`
  exposes `engine()`, `renderer` and `gamepad` for debugging.
- Engine events from input calls are returned by the *next* `update()`.

## Settled rules (details in DECISIONS.md)
- Levels: 1 on-beat · 2 timing · 3 hand order (flip) · 4 advanced. Autopilot until the first
  throw in levels 2+ (whole takeover).
- Sync pairs are written **(R,L)**, right hand first. 0 in a pattern = empty hand (no 0 input).
  Player throw values 1–9. At most 100 balls. Tempo default 120 BPM, dwell 0.6.
- Catch failure = two arrivals at one hand < 0.35 beat apart. Mid-air collisions off by default.

## How the user wants to work
- Juggler and rhythm-game player; thinks in siteswap. **Be precise with notation; if something
  is ambiguous, ask instead of guessing.**
- For control-scheme design, **offer a few options with trade-offs before building**, unless the
  user already picked one.
- **Don't change controls the user likes without asking.** The controller schemes (dial and
  buttons) feel right; the keyboard needs rework (to be discussed).
- After building something, briefly list the controls and any known limits.
- Keep the core engine's behaviour stable; the user is happy with it.

## Current focus
See `ROADMAP.md`. Next up: **redesign the web UI** (the panel is one long list of options with
little formatting), then the keyboard controls, then two-player online **passing**.
