# Decisions

Settled design decisions. Newest first within each section. If code and this file disagree,
fix one of them on purpose.

## Phone (Nov 18 2026)
- **On-screen number line** under the stage: L 1–6 and R 1–6. A tap = that hand's number key
  (level 1: sets that hand's next value; levels 2+: throws now). Shown by default on touch
  screens (`pointer: coarse`), toggle "On-screen number buttons". No flip/pickup/pirouette on
  touch yet.
- **Narrow screens** (≤ 820 px): stage on top (72vh), settings scroll below; the number line
  stacks into two rows under 600 px.

## Changes after first play (Nov 15 2026)
- **Second controller scheme, "Buttons"** (the dial stays, chosen in the panel; saved). Pressing a
  value button throws it (level 1: sets that hand's next value). D-pad = left hand, face buttons =
  right hand (Switch: Y = in, A = out, X = up, B = down). Banks [down, in, out, up]: low 1 3 4 5,
  high (hold L / R) 6 7 8 9; "in" values cross, "out" values stay. No 2 button (a hold = not
  throwing). ZL / ZR = flip. Pickup = L3 / R3. Pirouette = hold −. + = tap pause / hold 0.8 s reset
  (pause and reset may share a button). Separate rebindable map `padB`. A diamond helper beside
  each hand shows the current bank's values, coloured by destination, swapped while flip is held.
- **Preview arcs:** setting Always (default) / Only with a ball in hand / Off. A faint dashed arc
  from each hand shows where its throw would go right now and how high, labelled with the value. It uses the
  stick aim, else the default (level 2) or the ball count (3+), with flip applied. Level 1 shows
  the next beat's throw. A hold shows as a ring at the hand. No tones.
- **Stick dials beside the hands:** each dial sits just outside its hand at hand height and
  follows the zoom (was: side by side at the bottom centre).
- **View height setting (5–9):** with auto-zoom off, the view is fixed so a throw of that value
  just fits at the current tempo, dwell and gravity. Moving the slider turns auto-zoom off.
  Default 7. Saved with the other display settings.
- **No 0 input.** 0 in a pattern = that hand is empty on that beat: nothing is thrown, and a
  ball already in the hand just stays (it used to be dropped). The 0 keys (Z, /, Digit0) and the
  dial's 0 slice are gone.
- **Throw values up to 9** for the player: number keys 1–9; split keys add R T = 8 9 (left) and
  U Y = 8 9 (right). Patterns may still use letters a–z.
- **At most 100 balls** (`MAX_BALLS`), for patterns and rest splits.
- **Dial: nine equal 40° slices.** Inward (crossing) side from down to up: 1 3 5 7; 9 straight
  up; outward (same-hand) side from up to down: 8 6 4 2. Odd/even pairs mirror each other at the
  same height. Straight down is the line between 1 and 2 (no "none" slice: use all the space).
- Saved bindings are filtered to actions that still exist, so old 0 bindings disappear.

## Choices made while building the UI (Nov 2026)
- **Throw-default keys:** V (left) and N (right) throw with no value: level 2 = the default
  siteswap's next value, levels 3–4 = the ball count. On a controller the bumpers do this when
  the stick is centred.
- **Keyboard pickup:** C (left hand), M (right hand). **Keyboard pirouette:** hold B; it spins
  at a steady 1 turn per beat (a controller spins with the left stick).
- **Level 1 on a controller:** pointing a stick picks that hand's next value (no button);
  throw/flip buttons do nothing in level 1.
- **Pause/reset on the controller:** + / − (standard buttons 9 / 8).
- **Bindings:** one key per action after rebinding (the defaults also accept numpad keys);
  binding a key or button removes it from any other action. Stored in localStorage
  (`juggling.bindings.v1`); session settings in `juggling.session.v1`.
- **Spinning look:** the juggler and hands squash horizontally with the turn angle; balls in
  the air aren't affected.
- **Switching level or pattern** builds a new engine (its clock restarts) and clears the
  ladder. Patterns that don't fit a lower level fall back to 3.
- **Build:** `tools/build.js` wraps each module in a function in a small registry, so modules
  keep their own scope. It only supports the single-line import/export forms that src/ uses.

## Choices made while building the core (Nov 2026)
- **Sync pairs are written (R,L), right hand first, always.** Starting hand only affects async
  hand order (beat 0 = starting hand). To start a sync pattern from the other side, write its
  mirror: (4,6x)* vs (6x,4)*. (Sim 3 used left-first; that's superseded.)
- **Level 2 default phase advances one step per throw you make**, skipping 0s (gaps), so
  holding a ball doesn't skip ahead. At takeover the phase continues from the autopilot's next
  beat. Level 1 advances one step per beat.
- **Defaults only in levels 1–2, and only async non-multiplex patterns** (those levels are
  RLRL). The default siteswap must use the same ball count as the starting pattern.
- **No transitions.** Defaults just play the default siteswap by phase; if that collides with
  what's in the air, it collides.
- **Levels 3–4 with no value given** (stick centred) throw the starting pattern's ball count.
- **A 2 is a hold only if it lands in the same hand.** Otherwise it flies like any throw.
- ~~0 thrown with a ball in hand drops that ball~~ — changed: 0 is always just an empty turn.
- **No limit on balls per hand.** The only catch failure is two balls arriving at one hand
  less than 0.35 beat apart. Exception: balls landing at exactly the same moment are a
  multiplex catch (squeeze) only when the autopilot runs a multiplex pattern that throws that
  many from that hand on that beat. Everywhere else they clash. (On-beat collisions land at
  exactly the same moment, so this rule can't be looser.)
- **Mid-air collisions are off by default** (config `midairCollisions`). They use fixed
  throw/catch points, ignore 1s, and ignore anything below 0.18 m (near the hands).
- **Tempo changes rescale balls already in flight** (they keep their place in beats) instead of
  restarting the pattern. This replaces sim 3's "reset on tempo change".
- **Start modes:** `rest` = balls in hands, nothing automatic (levels 2+). In level 1 the
  beat always runs defaults, so rest behaves like a cold start with the rest split.
  `cold` = autopilot builds into the pattern from rest. `warm` = autopilot mid-pattern. In
  levels 2+, your first throw switches the autopilot off for both hands (whole takeover).
- **Rest split:** levels 1–3 take it from the starting pattern (the balls each hand needs to
  begin it cold: 5 = 3 R + 2 L, (4,6x)* = 2 R + 3 L). Level 4 may set any split.
- **Drops:** `restartPattern` restarts with the configured start mode (cold if it was rest),
  `restartRest` restarts at rest, `continue` leaves the ball on the floor with its side. The
  restart happens 1.6 s after the drop.
- **Pickup:** `sided` — pickup('L'|'R') uses that hand and prefers a ball on that side.
  `nearest` / `fewer` — any pickup button; the hand is the ball's side, or the hand holding
  fewer balls (tie → the ball's side). Pickups and throws are blocked during a pirouette.
- **Pirouette:** while on, throws are refused and arriving balls drop. Spin is counted in
  turns (`spin(turns)`), for the renderer and later game goals.
- **Events:** methods like throwNow() queue their events; the next update() returns them,
  together with what happened during that step.
- **Multiplex:** parsed, validated and run by the autopilot (level 4). There are no player
  controls yet. Every throw event already carries a list of balls.
- **Hand sequence** for a handswap is computed by simulating the two hands as a 2-ball pattern
  and reading its steady cycle. The cycle is the period, or twice it when the hands come back
  swapped (13 → RRLL).

## From the planning (see CONTEXT.md and the project docs)
- One app with a shared core and selectable modes; old sims archived unchanged.
- Free Juggle first (no score); game mode later = config preset + goal.
- Four control levels: 1 on-beat, 2 timing, 3 hand order (flip), 4 advanced.
- Catching hand by hand order (throw t on beat i → hand on beat i + t), or by the throw's own
  destination when you choose hands live (odd crosses, even stays, flip swaps).
- Handswap: average 2, validated like siteswap, no 0s for now. Siteswap may contain 0s.
- Defaults: tempo 120 BPM, dwell 0.6 beat, gravity 9.81, time scale 1.
- Controls carried over from the sims (dial, flip, buttons, bindings): see CONTEXT.md.
- Run with a local server (`npm run serve`) while developing; a single-file bundle for sharing
  comes with the UI (tools/).
