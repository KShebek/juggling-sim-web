// The live juggling engine. Headless: no browser APIs, no drawing.
// The app calls update(dt) every frame plus input methods, and draws from
// snapshot(). update() returns the events that happened during that step.
//
// Levels (see config.js):
//  1  on-beat: the beat clock throws; setNext/setNextFor choose values, else defaults
//  2  timing: you throw (throwNow); a missing value comes from the default siteswap
//  3  hand order: you throw from either hand; flip swaps the destination
//  4  advanced: like 3, any ball split at rest (multiplex later)
// In levels 2+ a cold/warm start runs an autopilot until your first throw
// (whole takeover).

import { R, L, otherHand } from './notation.js';
import { handSequence } from './handorder.js';
import { validateConfig } from './config.js';
import { beatSeconds, flightTime, peakHeight, isHold } from './timing.js';
import { throwPoint, catchPoint, flightPosition, GEOM } from './geometry.js';

export class ConfigError extends Error {
  constructor(errors) { super(errors.join('\n')); this.name = 'ConfigError'; this.errors = errors; }
}

export function createEngine(config = {}) {
  const v = validateConfig(config);
  if (!v.ok) throw new ConfigError(v.errors);
  return new Engine(v);
}

const STRUCTURAL = ['level', 'startMode', 'startingPattern', 'handswap', 'startingHand', 'defaultPattern', 'ballsPerHand'];

export class Engine {
  constructor(v) {
    this.time = 0;
    this._events = [];
    this._seq = 0;
    this._nextId = 0;
    this._apply(v);
    this.reset('start');
  }

  /* ---------------- setup ---------------- */
  _apply(v) {
    this.config = v.config;
    this.compiled = v.compiled;
    this.defaultCompiled = v.defaultCompiled;
    this.split = v.split;
    this.rl = handSequence('2', v.config.startingHand);   // RLRL order for levels 1-2
  }
  get beatSec() { return beatSeconds(this.config.tempo); }
  get level() { return this.config.level; }

  /**
   * reset('start' | 'pattern' | 'rest')
   *  start   = the configured start mode
   *  pattern = the starting pattern (cold if the start mode is rest)
   *  rest    = all balls in hands, nothing thrown automatically (levels 2+)
   */
  reset(kind = 'start') {
    const sm = this.config.startMode;
    const how = kind === 'rest' ? 'rest' : kind === 'pattern' ? (sm === 'rest' ? 'cold' : sm) : sm;
    this.beatPos = -0.5;
    this.lastBeat = -1;
    this.phase = 0;
    this.balls = [];
    this.hands = { R: this._mkHand(), L: this._mkHand() };
    this.resetAt = null;
    this.pirouette = { on: false, turns: 0 };
    this.next = null;
    this.nextFor = { R: null, L: null };
    this.lastThrowHand = this.rl.hand(-1);
    const B = this.beatSec;

    if (how === 'warm') {
      for (const w of this.compiled.warmBalls()) {
        const ball = this._mkBall();
        if (isHold(w.value, w.hand, w.to)) { this._putInHand(ball, w.to, w.landBeat); continue; }
        const t0 = this.time + (w.thrownBeat - this.beatPos) * B;
        this._setFlight(ball, w.hand, w.value, w.to, t0, w.thrownBeat);
        if (ball.flight.t1 <= this.time) {
          this._putInHand(ball, w.to, w.landBeat);
          this.hands[w.to].lastCatchT = ball.flight.t1;
        }
      }
    } else {
      const due = how === 'cold' ? this.compiled.restSplit().due : null;
      for (const h of [R, L]) {
        const n = due ? due[h].length : this.split[h];
        for (let i = 0; i < n; i++) this._putInHand(this._mkBall(), h, due ? due[h][i] : null);
      }
    }
    this.mode = this.level === 1 ? 'beat' : how === 'rest' ? 'manual' : 'auto';
    this._emit({ type: 'reset', start: how, mode: this.mode });
  }

  /** Change settings mid-session. Pattern/level changes restart; tempo rescales balls in flight. */
  updateConfig(patch) {
    const v = validateConfig({ ...this.config, ...patch });
    if (!v.ok) return { ok: false, errors: v.errors };
    const oldB = this.beatSec;
    const structural = STRUCTURAL.some(k => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(this.config[k]));
    this._apply(v);
    if (structural) this.reset('start');
    else if (this.beatSec !== oldB) this._rescaleTime(this.beatSec / oldB);
    return { ok: true, errors: [] };
  }

  _rescaleTime(ratio) {
    const t = this.time;
    for (const b of this.balls) if (b.state === 'air') {
      const f = b.flight, dur = f.t1 - f.t0, s = (t - f.t0) / dur, nd = dur * ratio;
      f.t0 = t - s * nd; f.t1 = f.t0 + nd; f.flightTime = nd; f.peakHeight = peakHeight(nd, this.config.gravity);
    }
    for (const h of [R, L]) this.hands[h].lastCatchT = t - (t - this.hands[h].lastCatchT) * ratio;
  }

  _mkHand() { return { held: [], lastCatchT: -1e9, pending: null }; }
  _mkBall() { const b = { id: this._nextId++, state: 'hand', hand: null, dueBeat: null, flight: null }; this.balls.push(b); return b; }
  _ball(id) { return this.balls.find(b => b.id === id); }
  _putInHand(ball, h, dueBeat) {
    ball.state = 'hand'; ball.hand = h; ball.dueBeat = dueBeat ?? null; ball.side = undefined;
    this.hands[h].held.push(ball.id);
  }
  _removeFromHand(ball) {
    if (ball.state !== 'hand') return;
    const held = this.hands[ball.hand].held, k = held.indexOf(ball.id);
    if (k >= 0) held.splice(k, 1);
  }
  _emit(e) { this._events.push({ time: this.time, ...e }); }

  _setFlight(ball, from, value, to, t0, beat) {
    const B = this.beatSec, ft = flightTime(value, B, this.config.dwell, from, to);
    const a = throwPoint(from), c = catchPoint(to);
    ball.state = 'air'; ball.hand = null;
    ball.flight = { from, to, value, t0, t1: t0 + ft, flightTime: ft, peakHeight: peakHeight(ft, this.config.gravity),
      x0: a.x, y0: a.y, x1: c.x, y1: c.y, landBeat: beat == null ? null : beat + value };
  }

  /* ---------------- throwing ---------------- */
  /** Throw a list of { ball, value, to } from one hand at time t. One event per hand-throw. */
  _launch(hand, specs, t, src, beat = null) {
    const out = [];
    let allHold = true;
    for (const { ball, value, to } of specs) {
      if (isHold(value, hand, to)) {
        ball.dueBeat = beat == null ? null : beat + value;
        out.push({ id: ball.id, value, to, flightTime: 0, peakHeight: 0, catchTime: null });
        continue;
      }
      allHold = false;
      this._removeFromHand(ball);
      this._setFlight(ball, hand, value, to, t, beat);
      out.push({ id: ball.id, value, to, flightTime: ball.flight.flightTime, peakHeight: ball.flight.peakHeight, catchTime: ball.flight.t1 });
    }
    if (!out.length) return;
    this.lastThrowHand = hand;
    this._events.push({ type: allHold ? 'hold' : 'throw', time: t, hand, src, beat, balls: out });
  }

  /** Pick the balls a hand throws now: the ones due on this beat first, then the oldest. */
  _pickBalls(hand, n, beat) {
    const held = this.hands[hand].held.map(id => this._ball(id));
    const due = beat == null ? [] : held.filter(b => b.dueBeat === beat);
    const rest = held.filter(b => !due.includes(b));
    return [...due, ...rest].slice(0, n);
  }

  _toFloor(ball, side, reason, pos, vel) {
    this._removeFromHand(ball);
    ball.state = 'floor'; ball.side = side; ball.hand = null; ball.dueBeat = null;
    ball.floorTime = this.time; ball.dropFrom = pos; ball.dropVel = vel;
    this._emit({ type: 'drop', id: ball.id, side, reason });
    if (this.config.dropBehavior !== 'continue' && this.resetAt === null) this.resetAt = this.time + this.config.restartDelay;
  }

  /* Level 1: choose the next beat's value (whichever hand) or one hand's next value. */
  setNext(value) { this.next = { value, seq: ++this._seq, src: 'next' }; }
  setNextFor(hand, value) { this.nextFor[hand] = { value, seq: ++this._seq, src: 'hand' }; }
  /** The value the next beat will use, for display: { beat, hand, value, src, hasBall }. */
  previewNext() {
    const k = this.lastBeat + 1, hand = this.rl.hand(k);
    const c = this._choice(hand);
    const value = c ? c.value : this._defaultAtBeat(k);
    return { beat: k, hand, value, src: c ? c.src : 'default', hasBall: this.hands[hand].held.length > 0 };
  }
  _choice(hand) {
    const a = this.nextFor[hand], b = this.next;
    return a && b ? (a.seq > b.seq ? a : b) : a || b || null;
  }
  _defaultAtBeat(k) {
    const t = this.defaultCompiled.throwsAt(k);
    return t.length ? t[0].balls[0].value : 0;
  }

  /** Level 2: next default value by pattern phase (one step per throw, 0s skipped). */
  _defaultByPhase() {
    const dc = this.defaultCompiled;
    for (let i = 0; i < 2 * dc.cycle + 1; i++) {
      const b = this.phase + i, t = dc.throwsAt(b);
      if (t.length) { this.phase = b + 1; return t[0].balls[0].value; }
    }
    return dc.balls;
  }
  /** What a level-2 throw with no value would use right now (doesn't advance). */
  peekDefault() {
    if (this.level !== 2) return null;
    const p = this.phase, v = this._defaultByPhase(); this.phase = p; return v;
  }

  /**
   * Levels 2+: throw now from a hand.
   * opts: { hand, value?, flip?, to?, src? }
   *  - value missing: level 2 = default siteswap by phase; levels 3-4 = the pattern's ball count
   *  - to missing: odd values cross, even values stay; flip swaps that (levels 3+)
   * Returns { ok, reason? }.
   */
  throwNow({ hand, value = null, flip = false, to = null, src = 'player' } = {}) {
    if (this.level === 1) return { ok: false, reason: 'Level 1 throws on the beat: use setNext / setNextFor.' };
    if (hand !== R && hand !== L) return { ok: false, reason: 'hand must be R or L' };
    if (this.pirouette.on) { this._emit({ type: 'blocked', hand, reason: 'pirouette' }); return { ok: false, reason: 'pirouette' }; }
    if (this.mode === 'auto') { this.mode = 'manual'; this.phase = this.lastBeat + 1; this._emit({ type: 'takeover' }); }
    let v = value;
    if (this.level === 2) { const d = this._defaultByPhase(); if (v == null) v = d; }
    if (v == null) v = this.compiled.balls;
    const cross = (v % 2 === 1) !== (this.level >= 3 && !!flip);
    const dest = to ?? (cross ? otherHand(hand) : hand);
    this._playerThrow(hand, v, dest, src);
    return { ok: true };
  }
  /** Number keys: hands alternate. */
  nextAlternateHand() { return otherHand(this.lastThrowHand); }

  _playerThrow(hand, value, to, src) {
    const H = this.hands[hand];
    if (value === 0) { this.lastThrowHand = hand; return; }   // 0 = an empty turn: nothing happens
    if (!H.held.length) {
      if (isHold(value, hand, to)) { this.lastThrowHand = hand; this._emit({ type: 'empty', hand }); return; }
      H.pending = { value, to, src, until: this.time + this.config.inputBuffer };
      this.lastThrowHand = hand;
      this._emit({ type: 'pending', hand, value });
      return;
    }
    const [ball] = this._pickBalls(hand, 1, null);
    this._launch(hand, [{ ball, value, to }], this.time, src);
  }

  /* ---------------- beats ---------------- */
  _beat(k, t) {
    this._events.push({ type: 'beat', time: t, beat: k });
    if (this.level === 1) return this._beatLevel1(k, t);
    if (this.mode === 'auto') { this._beatAuto(k, t); this.phase = k + 1; }
  }

  _beatLevel1(k, t) {
    const hand = this.rl.hand(k), c = this._choice(hand);
    this.next = null; this.nextFor[hand] = null;
    const value = c ? c.value : this._defaultAtBeat(k), src = c ? c.src : 'default';
    const H = this.hands[hand];
    if (this.pirouette.on) { if (H.held.length && value > 0) this._events.push({ type: 'blocked', time: t, hand, reason: 'pirouette' }); return; }
    if (!H.held.length) { if (c && value > 0) this._events.push({ type: 'empty', time: t, hand }); return; }
    if (value === 0) return;                         // 0 = empty turn: a held ball just stays
    const [ball] = this._pickBalls(hand, 1, k);
    this._launch(hand, [{ ball, value, to: this.rl.hand(k + value) }], t, src, k);
  }

  _beatAuto(k, t) {
    if (this.pirouette.on) return;
    for (const th of this.compiled.throwsAt(k)) {
      const balls = this._pickBalls(th.hand, th.balls.length, k);
      const specs = th.balls.slice(0, balls.length).map((x, i) => ({ ball: balls[i], value: x.value, to: x.to }));
      this._launch(th.hand, specs, t, 'auto', k);
    }
  }

  /* ---------------- catching ---------------- */
  _arrive(ball) {
    const f = ball.flight, hand = f.to, H = this.hands[hand];
    const at = flightPosition(f, f.t1, this.config.gravity);
    if (this.pirouette.on) { this._toFloor(ball, hand, 'pirouette', at, { x: 0, y: -1 }); return; }
    // Balls landing at exactly the same moment are a multiplex catch only when the
    // autopilot is running a multiplex pattern that throws that many from this hand
    // on that beat. Anywhere else (e.g. level 1 collisions, which are exact) they clash.
    const sameMoment = Math.abs(f.t1 - H.lastCatchT) < 1e-9;
    H.sameMomentCount = sameMoment ? (H.sameMomentCount || 1) + 1 : 1;
    let multiplexCatch = false;
    if (sameMoment && this.mode === 'auto' && this.compiled.multiplex && f.landBeat != null) {
      const t = this.compiled.throwsAt(f.landBeat).find(x => x.hand === hand);
      multiplexCatch = !!t && t.balls.length >= H.sameMomentCount;
    }
    if (!multiplexCatch && f.t1 - H.lastCatchT < this.config.catchGapBeats * this.beatSec) {
      const side = hand === R ? 1 : -1;
      this._toFloor(ball, hand, 'collision', at, { x: side * 1.1, y: 0.7 });
      return;
    }
    this._putInHand(ball, hand, f.landBeat);
    H.lastCatchT = f.t1;
    this._events.push({ type: 'catch', time: f.t1, hand, id: ball.id });
    const p = H.pending;
    if (p && this.time <= p.until) { H.pending = null; this._launch(hand, [{ ball, value: p.value, to: p.to }], this.time, p.src); }
  }

  _midair() {
    const g = this.config.gravity, air = this.balls.filter(b => b.state === 'air');
    for (let i = 0; i < air.length; i++) for (let j = i + 1; j < air.length; j++) {
      const a = air[i], c = air[j];
      if (a.flight.value <= 1 || c.flight.value <= 1) continue;
      const pa = flightPosition(a.flight, this.time, g), pc = flightPosition(c.flight, this.time, g);
      if (pa.y < 0.18 || pc.y < 0.18) continue;
      if (Math.hypot(pa.x - pc.x, pa.y - pc.y) < 0.05) {
        this._toFloor(a, pa.x >= 0 ? R : L, 'midair', pa, { x: 0, y: 0 });
        this._toFloor(c, pc.x >= 0 ? R : L, 'midair', pc, { x: 0, y: 0 });
        return;
      }
    }
  }

  /* ---------------- pickup and pirouette ---------------- */
  /**
   * Pick a ball up off the floor.
   * pickupMode 'sided': pickup('R'|'L') uses that hand, preferring a ball on its side.
   * 'nearest' / 'fewer': any pickup button works; the hand is the ball's side or the
   * hand holding fewer balls.
   */
  pickup(which = 'either') {
    if (this.pirouette.on) { this._emit({ type: 'blocked', reason: 'pirouette' }); return { ok: false, reason: 'pirouette' }; }
    const floor = this.balls.filter(b => b.state === 'floor').sort((a, b) => a.floorTime - b.floorTime);
    if (!floor.length) return { ok: false, reason: 'nothing on the floor' };
    let hand, ball;
    if (this.config.pickupMode === 'sided' && (which === R || which === L)) {
      hand = which;
      ball = floor.find(b => b.side === hand) || floor[0];
    } else {
      ball = floor[0];
      if (this.config.pickupMode === 'fewer') {
        const nR = this.hands.R.held.length, nL = this.hands.L.held.length;
        hand = nR === nL ? ball.side : nR < nL ? R : L;
      } else hand = ball.side;
    }
    this._putInHand(ball, hand, null);
    this._emit({ type: 'pickup', hand, id: ball.id });
    return { ok: true, hand, id: ball.id };
  }

  /** Pirouette: while on, hands can't throw or catch (arrivals drop). */
  setPirouette(on) {
    if (this.pirouette.on === !!on) return;
    this.pirouette.on = !!on;
    if (on) this.pirouette.turns = 0;
    this._emit({ type: 'pirouette', on: !!on });
  }
  /** Add rotation (in turns) while spinning; ignored when not in a pirouette. */
  spin(turns) { if (this.pirouette.on) this.pirouette.turns += turns; }

  /* ---------------- time ---------------- */
  update(dtReal) {
    const dt = dtReal * this.config.timeScale;
    const B = this.beatSec;
    this.time += dt;
    const prev = Math.floor(this.beatPos);
    this.beatPos += dt / B;
    const now = Math.floor(this.beatPos);
    const queue = [];
    for (const b of this.balls) if (b.state === 'air' && b.flight.t1 <= this.time) queue.push({ t: b.flight.t1, kind: 0, b });
    for (let k = prev + 1; k <= now; k++) queue.push({ t: this.time - (this.beatPos - k) * B, kind: 1, k });
    queue.sort((a, b) => a.t - b.t || a.kind - b.kind);
    for (const q of queue) {
      if (q.kind === 0) { if (q.b.state === 'air') this._arrive(q.b); }
      else { this.lastBeat = q.k; this._beat(q.k, q.t); }
    }
    for (const h of [R, L]) {
      const p = this.hands[h].pending;
      if (p && this.time > p.until) { this.hands[h].pending = null; this._emit({ type: 'empty', hand: h }); }
    }
    if (this.config.midairCollisions) this._midair();
    if (this.resetAt !== null && this.time >= this.resetAt) {
      this.reset(this.config.dropBehavior === 'restartRest' ? 'rest' : 'pattern');
    }
    const out = this._events; this._events = [];
    return out;
  }

  /** Plain data for the renderer and UI. */
  snapshot() {
    return {
      time: this.time, beatPos: this.beatPos, beatSec: this.beatSec, level: this.level, mode: this.mode,
      pirouette: { ...this.pirouette }, lastThrowHand: this.lastThrowHand,
      hands: { R: { held: [...this.hands.R.held], pending: this.hands.R.pending }, L: { held: [...this.hands.L.held], pending: this.hands.L.pending } },
      balls: this.balls.map(b => ({ id: b.id, state: b.state, hand: b.hand, side: b.side, flight: b.flight && { ...b.flight },
        dropFrom: b.dropFrom, dropVel: b.dropVel, floorTime: b.floorTime })),
      counts: {
        air: this.balls.filter(b => b.state === 'air').length,
        floor: this.balls.filter(b => b.state === 'floor').length,
        R: this.hands.R.held.length, L: this.hands.L.held.length
      }
    };
  }
  /** Position of a ball in the air (render helper). */
  airPosition(ball) { return flightPosition(ball.flight, this.time, this.config.gravity); }
}

export { GEOM };
