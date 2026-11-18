# Context

A sandbox juggling simulator for the browser. You control the throws yourself; there's no score
in Free Juggle. Exploring control schemes (keyboard and game controller) is a big part of it.
Passing is out of scope.

## Where things come from
- `archive/` holds the three original single-file sims, unchanged:
  `sim1-vanilla-onbeat.html` (on-beat), `sim2-timing.html` (free timing),
  `sim3-handorder.html` (hand order with flip, sync, start patterns). They are the reference
  for behaviour and controls that already work.
- The full design history lives in the project docs (`juggling-simulators-context.md`,
  `handoff-core-engine.md`). `DECISIONS.md` lists what is settled.

## Control levels (Free Juggle)
1. **On-beat:** RLRL on a fixed beat; you pick values; defaults fill the beat.
2. **Timing:** RLRL; you make every throw; default values fill in when you don't aim one.
3. **Hand order:** you choose the hand; flip swaps where a throw goes. No defaults.
4. **Advanced:** any ball split at rest (multiplex controls later).

## Notation
- Async siteswap: digits, a–z = 10–35, 0 = empty. Multiplex [43].
- Handswap (hand order): each value = beats until that hand throws again; average 2.
  2 = RLRL, 13 = RRLL, 123 = RRLRRL. No 0s yet.
- Sync: (R,L) pairs, even values, x = crosses, * = repeat mirrored.
- Catching hand: by hand order (the hand on beat i + t), or by the throw's own destination
  when hands are chosen live (odd crosses, even stays, flip swaps).

## Physics
- Flight time = (value − dwell) × beat. Peak height = g·t²/8.
- Defaults: 120 BPM, dwell 0.6 beat, gravity 9.81 m/s².

## Controls to carry into the UI (don't change without asking)
- Keyboard split hands: left A S D F / Q W E R T = 1–4 / 5–9; right ; L K J / P O I U Y.
  Number keys 1–9 alternate hands. No 0 input (0 in a pattern = empty hand). Up to 100 balls. Left/Right Shift held = flip for that hand (level 3+).
- Gamepad dial: left stick = left hand, right stick = right hand. 9 equal 40° slices measured
  per hand ("in" = toward the other hand): inward side 1 3 5 7 going up, 9 straight up, outward
  side 8 6 4 2 going down (pairs 1|2, 3|4, 5|6, 7|8 at the same heights). Read past 55% deflection, 6° hysteresis, 0.12 s grace after
  letting go, rumble tick per new value. Dials sit just outside each hand at hand height, coloured by where each throw goes.
- Level 3+: trigger held = flip, bumper tap = throw (setting swaps them). Level 2: trigger or
  bumper throws.
- Pickup: D-pad left = left hand, A (right face button) = right hand; option "either hand"
  (nearest / fewer). Pirouette: hold B (bottom face button = button 0 in the browser's
  standard mapping) and circle the left stick to spin.
- Input buffer 0.15 s. Rebindable keys and buttons, saved in the browser, with a
  "Reset to defaults" button.
- The controller may not show up in an embedded preview; use localhost.
