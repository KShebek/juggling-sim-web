import { bankValue } from './gamepad.js';

// Routes keyboard and gamepad actions to the engine, depending on the level.
//  Level 1: value keys / dials choose the next throw (setNext / setNextFor).
//  Level 2+: value keys and throw buttons throw now (throwNow); flip from level 3.

export class InputRouter {
  /**
   * app: { engine(), pause(), reset(), changeBalls(delta), now() }
   */
  constructor(app, keyboard, gamepad) {
    this.app = app; this.kb = keyboard; this.pad = gamepad;
    this.pirouetteKey = false;
    keyboard.on((action, down) => this.action(action, down, 'key'));
  }

  flipHeld(h) { return this.kb.isDown('flip' + h) || !!this.pad.held['flip' + h]; }
  anyFlip() { return this.flipHeld('L') || this.flipHeld('R'); }

  action(action, down, from) {
    const eng = this.app.engine();
    if (!eng) return;
    const general = action === 'pause' || action === 'reset' || action === 'ballsUp' || action === 'ballsDown';
    if (this.app.isPaused() && !general) return;
    if (action === 'pirouette') {
      if (from === 'key') this.pirouetteKey = down;
      eng.setPirouette(down || this.pirouetteKey || !!this.pad.held.pirouette);
      return;
    }
    if (!down) return;
    const level = eng.level;
    switch (action) {
      case 'pause': return this.app.pause();
      case 'reset': return this.app.reset();
      case 'ballsUp': return this.app.changeBalls(+1);
      case 'ballsDown': return this.app.changeBalls(-1);
      case 'pickupL': case 'pickupR': {
        const hand = action === 'pickupL' ? 'L' : 'R';
        return eng.pickup(eng.config.pickupMode === 'sided' ? hand : 'either');
      }
      case 'throwL': case 'throwR': {
        if (level < 2) return;
        const hand = action === 'throwL' ? 'L' : 'R';
        const value = from === 'pad' ? this.pad.aimValue(hand, this.app.now()) : null;
        eng.throwNow({ hand, value, flip: this.flipHeld(hand), src: from === 'pad' ? 'pad' : 'key' });
        if (from === 'pad') this.pad.rumble(0.25, 40);
        return;
      }
    }
    const b = /^b([LR])_(down|in|out|up)$/.exec(action);     // buttons scheme: press = value (+ throw)
    if (b) {
      const hand = b[1], v = bankValue(b[2], this.pad.shifted(hand));
      if (level === 1) eng.setNextFor(hand, v);
      else { eng.throwNow({ hand, value: v, flip: this.flipHeld(hand), src: 'pad' }); this.pad.rumble(0.25, 40); }
      return;
    }
    const m = /^([LRN])(\d)$/.exec(action);
    if (!m) return;
    const v = +m[2];
    if (m[1] === 'N') {
      if (level === 1) eng.setNext(v);
      else eng.throwNow({ hand: eng.nextAlternateHand(), value: v, flip: this.anyFlip(), src: 'key' });
    } else {
      const hand = m[1];
      if (level === 1) eng.setNextFor(hand, v);
      else eng.throwNow({ hand, value: v, flip: this.flipHeld(hand), src: 'key' });
    }
  }

  /** Call once per frame. */
  frame(dtReal) {
    const eng = this.app.engine();
    if (!eng) return;
    const now = this.app.now();
    const { edges, spin } = this.pad.poll(now, eng.pirouette.on);
    for (const e of edges) this.action(e.action, e.down, 'pad');
    if (eng.level === 1) {
      for (const h of ['L', 'R']) { const v = this.pad.takeAimChange(h); if (v !== null) eng.setNextFor(h, v); }
    }
    if (eng.pirouette.on) {
      // controller: turns follow the left stick; keyboard: a steady 1 turn per beat
      if (spin > 0) eng.spin(spin);
      else if (this.pirouetteKey) eng.spin(dtReal * eng.config.timeScale / eng.beatSec);
    }
  }
}
