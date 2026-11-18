# Juggling Sims

A sandbox juggling simulator: siteswap, hand order (handswap), sync and multiplex, with
keyboard and game-controller control. No score in Free Juggle.

## Play
- **Easiest:** double-click `dist/juggle.html` (one self-contained file).
- **While developing:** serve the folder and open the `localhost` address it prints
  (ES modules don't load from a file opened directly from disk):
  ```
  npm run serve        # or: npx serve .   /   python -m http.server
  ```
- Controllers may not be detected in an embedded preview; use the file or localhost in a
  normal browser tab, and press a button on the controller once.

## Build and test
```
npm run build        # node tools/build.js   -> dist/juggle.html
npm test             # node tests/run.js
```
Node 18+; no dependencies.

## Levels (Free Juggle)
1. **On-beat** — RLRL on a fixed beat. Choose the next value; defaults fill the beat.
2. **Timing** — RLRL. You make every throw; a throw with no aimed value takes the default.
3. **Hand order** — throw from either hand; hold flip to send a throw the other way. Sync works.
4. **Advanced** — any ball split at rest; multiplex patterns run on autopilot.
In levels 2+ a warm or cold start runs an autopilot until your first throw.

## Default controls (all rebindable in the panel, with "Reset to defaults")
| | Keyboard | Controller (Switch names) |
|---|---|---|
| Values, left hand | A S D F = 1–4, Q W E R T = 5–9 | left stick dial |
| Values, right hand | ; L K J = 1–4, P O I U Y = 5–9 | right stick dial |
| Number keys | 1–9: next beat (level 1) / throw now, hands alternate | |
| Throw (levels 2+) | V (left), N (right): aimed or default value | L / R |
| Flip (levels 3+, hold) | Left Shift, Right Shift | ZL / ZR (swap setting) |
| Pick up | C (left), M (right) | D-pad left (left), A (right) |
| Pirouette (hold) | B (spins steadily) | B, circle the left stick |
| Pause / reset | Space / Backspace | + / − |
| Fewer / more balls | - / = | |

**Controller schemes** (pick one under Controls; both rebindable):
- **Dial** (above): aim with the sticks, throw with L / R, flip with ZL / ZR.
- **Buttons:** press a value to throw it (level 1: sets that hand's next value).
  D-pad = left hand, face buttons = right hand; "in" = toward the other hand.

  | | down | in | out | up |
  |---|---|---|---|---|
  | (no shift) | 1 | 3 | 4 | 5 |
  | hold L / R | 6 | 7 | 8 | 9 |

  ZL / ZR hold = flip. Pick up = click the stick on that side (L3 / R3). Pirouette = hold −,
  circle the left stick. + = pause (tap) / reset (hold ~1 s). No 2: in levels 2+ a hold is just
  not throwing. A diamond beside each hand shows its four current values.

Preview arcs (Always / Only with a ball / Off) show where each hand's next throw would go.

Dial: nine equal 40° slices. Crossing throws on the inward side (toward the other hand), same-hand
throws outward, paired by height: 1|2 lowest, then 3|4, 5|6, 7|8, and 9 straight up. Straight down
is the line between 1 and 2. Colours show where a throw goes (orange crosses, blue stays).

View: auto-zoom, or turn it off and set a fixed view height (fits throws of 5–9).

Throw values go up to 9. A 0 in a pattern just means that hand is empty on that beat. Up to
100 balls.

## Layout
```
archive/      original single-file sims, unchanged (still open by double-click)
src/core/     notation, hand order, compile, state, schedule, timing, geometry, config, engine
src/input/    bindings (saved in the browser), keyboard, gamepad, router (level-aware)
src/render/   canvas renderer: juggler, hands, balls, floor, ladder, dials, readout
src/modes/    free-juggle.js (the screen); game mode later
tools/        build.js (bundle to dist/)
tests/        node tests/run.js
```
See `CONTEXT.md` for the design and `DECISIONS.md` for what's settled.
