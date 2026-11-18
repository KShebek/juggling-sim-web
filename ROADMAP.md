# Roadmap

Order of work as of Nov 17, 2026. The core engine is in a good state; the user is happy with how
it behaves with a controller.

## 1. Web UI redesign (next)
**Problem:** the side panel is one long, fixed list of every option, with little formatting or
grouping. It's hard to use and hard to read.

Goals (to refine with the user before building — offer a couple of layout options first):
- Show only what matters for the current level; advanced options tucked away.
- Group settings by task, e.g. **Pattern** (level, pattern, presets, start), **Play** (drops,
  pickup, tempo/dwell/gravity/slow-mo), **Display** (ladder, arcs, view height, helpers),
  **Controls** (scheme, bindings editor).
- Make the common path fast: pick a level, pick a pattern (presets up front), juggle.
- Clearer status (mode, pattern, balls) and controls reference.
- Keep the stage large; keep every existing setting reachable; don't change engine behaviour
  or control mappings.

## 2. Keyboard controls rework
The controller schemes feel right; the keyboard doesn't yet. Details to be discussed with the
user (what feels off: reach, too many keys, no aim step?). Current keyboard: split-hand keys
A S D F / Q W E R T (left) and ; L K J / P O I U Y (right) = 1–9, number keys alternate hands,
Shift = flip, V / N throw default, C / M pick up, B pirouette.

## 3. Two-player online passing
Goal: play passing patterns with a friend online, like the ones on passist.org. Two jugglers
only (groups are possible later but much more complex — e.g. aim the target with the free
stick).

Plan:
1. **Four-handed siteswap** in notation + engine: global notation with the hand rotation
   A-right, B-right, A-left, B-left (the existing "catching hand = hand on beat i + t" rule over
   four hands), plus each juggler's local view. Validation, rest splits, warm/cold starts.
   Hands become juggler + side. Tests with passist patterns.
2. **AI partner:** the autopilot juggles the other juggler perfectly, so passing works solo.
3. **Passing controls:** in fixed rotation the value decides self vs pass (no new buttons). With
   free hand choice, add a **pass** modifier next to flip (flip = straight vs crossing pass).
   A view with two jugglers facing each other.
4. **Online:** each player is authoritative over their own throws and sends
   "hand X threw value v at time t"; both clients run the same deterministic engine on the
   shared throw list with a synced clock, so they agree on catches and drops. Network delay
   hides inside the flight time of a pass. Needs a small relay server (WebRTC/WebSocket on the
   web; Godot has networking built in). On-beat mode is the easiest online; free timing works
   with the same design.

Open questions: global vs local notation (plan: support and show both); a separate Passing mode
or a "partner" option in Free Juggle.

## Later
- Multiplex controls (ideas: keyboard chords; controller "load, then throw").
- Game mode: lessons = session config preset + goal.
- Live notation readout of what you're juggling.
- Godot port (`juggling-sim-godot`, sibling folder): first turn the test cases into a plain data
  file both versions run against. Godot's pluses: native controllers (rumble, possibly gyro),
  timing, 3D (real depth would make mid-air collisions meaningful), desktop/mobile apps, built-in
  networking. Minuses: full rewrite, heavier web export, slower UI building.
- Motion controls (gyro) — likely needs Godot or WebHID.

## Decided against / paused
- Tones for aim feedback (preview arcs instead).
- "Trick mode" (play a chosen trick's values with one button) — paused; the user mostly plays
  free-form.
