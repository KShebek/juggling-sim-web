// Gamepad: two control schemes, buttons as actions, pirouette spin from the left
// stick, rumble. Uses the browser's standard mapping.
//
//  'dial'    — sticks aim (dial), bumpers throw, triggers flip (setting swaps them).
//  'buttons' — pressing a value button throws it: D-pad = left hand, face buttons = right
//              hand; bumpers shift to the high bank; triggers flip.

// Dial: nine equal 40° slices, measured per hand: 0° = toward the other hand ("in"), 90° = up.
// Crossing (odd) throws on the inward side, same-hand (even) throws outward, paired by
// height: 1|2, 3|4, 5|6, 7|8 mirror each other and 9 is straight up. Straight down is
// the line between 1 and 2.
export const SECTOR_ORDER = [1, 3, 5, 7, 9, 8, 6, 4, 2];   // from down-in, up and over to down-out
export const SECTORS = SECTOR_ORDER.map((v, i) => ({ v, a: -90 + i * 40, b: -50 + i * 40 }));
export const AIM = { on: 0.55, off: 0.3, hyst: 6, grace: 0.12 };
const inSector = (s, a, p) => [a, a - 360, a + 360].some(x => x >= s.a - p && x < s.b + p);

// Buttons scheme: value banks in the order [down, in, out, up]; the bumper picks the high bank.
export const DIRS = ['down', 'in', 'out', 'up'];
export const BANKS = { low: [1, 3, 4, 5], high: [6, 7, 8, 9] };
export const bankValue = (dir, shifted) => (shifted ? BANKS.high : BANKS.low)[DIRS.indexOf(dir)];

const HOLD_RESET = 0.8;   // s: when pause and reset share a button, holding it this long resets

export class Gamepad {
  constructor(getBindings, getSwap, getScheme) {
    this.getBindings = getBindings;
    this.getSwap = getSwap;          // () => true to throw on the flip buttons and vice versa (dial)
    this.getScheme = getScheme || (() => 'dial');
    this.connected = false; this.id = ''; this.gp = null;
    this.stick = { R: { x: 0, y: 0 }, L: { x: 0, y: 0 } };
    this.aim = { R: this._aimState(), L: this._aimState() };
    this.held = {};                  // action -> bool
    this.capture = null;             // rebinding: function(index) or null
    this.prevPressed = [];
    this.spinAngle = null;
    this.pr = null;                  // shared pause/reset button state
  }
  _aimState() { return { active: false, sector: null, offT: -9, pushes: 0 }; }

  /** The active button map for the current scheme: action -> button index. */
  map() {
    const b = this.getBindings();
    if (this.getScheme() === 'buttons') return b.padB;
    if (!this.getSwap()) return b.pad;
    return { ...b.pad, throwL: b.pad.flipL, throwR: b.pad.flipR, flipL: b.pad.throwL, flipR: b.pad.throwR };
  }

  /** Read the pad. Returns { edges: [{action, down}], spin: turns this frame }. */
  poll(now, pirouetteHeld) {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of list) if (g && g.connected) { gp = g; break; }
    this.connected = !!gp; this.gp = gp;
    const edges = [];
    if (!gp) {
      for (const a of Object.keys(this.held)) if (this.held[a]) { this.held[a] = false; edges.push({ action: a, down: false }); }
      return { edges, spin: 0 };
    }
    this.id = gp.id;
    const pressedNow = gp.buttons.map(b => !!b && (b.pressed || b.value > 0.5));
    if (this.capture) {
      const i = pressedNow.findIndex((p, k) => p && !this.prevPressed[k]);
      if (i >= 0) { const cb = this.capture; this.capture = null; cb(i); }
      this.prevPressed = pressedNow;
      return { edges, spin: 0 };
    }
    const ax = i => gp.axes[i] || 0;
    this.stick = { L: { x: ax(0), y: ax(1) }, R: { x: ax(2), y: ax(3) } };

    const map = this.map();
    const shared = map.pause != null && map.pause === map.reset;
    const level = i => { const b = i == null ? null : gp.buttons[i]; return b ? Math.max(b.value || 0, b.pressed ? 1 : 0) : 0; };
    for (const [a, i] of Object.entries(map)) {
      if (shared && (a === 'pause' || a === 'reset')) continue;
      const v = level(i), was = !!this.held[a];
      const isDown = was ? v > 0.25 : v > 0.5;     // hysteresis for analog triggers
      if (isDown !== was) { this.held[a] = isDown; edges.push({ action: a, down: isDown }); }
    }
    if (shared) {                                   // tap = pause, hold = reset
      const down = level(map.pause) > 0.5;
      if (down && !this.pr) this.pr = { t0: now, fired: false };
      if (this.pr) {
        if (down && !this.pr.fired && now - this.pr.t0 >= HOLD_RESET) { this.pr.fired = true; edges.push({ action: 'reset', down: true }); }
        if (!down) { if (!this.pr.fired) edges.push({ action: 'pause', down: true }); this.pr = null; }
      }
    }
    this.prevPressed = pressedNow;

    // dial aiming (dial scheme only); the left stick spins instead while pirouetting
    const dial = this.getScheme() === 'dial';
    if (dial) this._aim('R', now); else this.aim.R.active = false;
    let spin = 0;
    if (pirouetteHeld) {
      this.aim.L.active = false;
      const s = this.stick.L, mag = Math.hypot(s.x, s.y);
      if (mag > 0.5) {
        const ang = Math.atan2(s.y, s.x);
        if (this.spinAngle !== null) {
          let d = ang - this.spinAngle;
          if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
          spin = Math.abs(d) / (2 * Math.PI);
        }
        this.spinAngle = ang;
      } else this.spinAngle = null;
    } else {
      this.spinAngle = null;
      if (dial) this._aim('L', now); else this.aim.L.active = false;
    }
    return { edges, spin };
  }

  _aim(h, now) {
    const st = this.stick[h], A = this.aim[h], mag = Math.hypot(st.x, st.y);
    if (mag > AIM.on) {
      const inward = h === 'R' ? -st.x : st.x;
      let a = Math.atan2(-st.y, inward) * 180 / Math.PI;
      if (a < -90) a += 360;
      let sec = A.sector;
      if (!A.active || !sec || !inSector(sec, a, AIM.hyst)) sec = SECTORS.find(q => inSector(q, a, 0)) || sec;
      if (!A.active) A.pushes++;
      if (sec !== A.sector || !A.active) { A.changed = true; this.rumble(0.6, 25); }
      A.sector = sec; A.active = true;
    } else if (mag < AIM.off && A.active) { A.active = false; A.offT = now; }
  }

  /** The aimed value for a hand (dial scheme), or null when the stick is centred. */
  aimValue(h, now) {
    if (this.getScheme() !== 'dial') return null;
    const A = this.aim[h];
    if (A.sector && (A.active || now - A.offT < AIM.grace)) return A.sector.v;
    return null;
  }
  /** True once per new aim (new push or new slice); used by level 1. */
  takeAimChange(h) { const A = this.aim[h]; const c = !!A.changed && A.active; A.changed = false; return c ? A.sector.v : null; }
  /** Buttons scheme: is that hand's shift (high bank) held? */
  shifted(h) { return !!this.held['shift' + h]; }

  rumble(weak, ms) {
    if (!this.rumbleOn || !this.gp) return;
    try {
      const va = this.gp.vibrationActuator;
      if (va && va.playEffect) { const r = va.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: weak * 0.3 }); if (r && r.catch) r.catch(() => {}); }
    } catch (e) { /* no rumble on this controller/browser */ }
  }
  /** Next new button press goes to cb(index). */
  captureNext(cb) { this.capture = cb; }
}
