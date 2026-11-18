// Canvas renderer: draws the engine's state each frame, in the style of the
// archived sims. Hand motion and falling balls are animated here; the engine
// only knows times, hands and flights.

import { GEOM, throwPoint, catchPoint, flightPosition } from '../core/geometry.js';
import { flightTime, isHold } from '../core/timing.js';
import { SECTORS, AIM, DIRS, bankValue } from '../input/gamepad.js';

const COLORS = ['#ffb347', '#6fe0c0', '#c792ff', '#ff6b8b', '#7fb2ff', '#e6e36a', '#ff9a5a', '#9be86f', '#f78fd0', '#8fd8f7', '#f2c14e', '#b0a1ff'];
const LADDER_H = 130;
const VIEW_BOTTOM = -1.05;
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = v => (v < 10 ? String(v) : String.fromCharCode(87 + v));

export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.W = 0; this.H = 0; this.DPR = 1;
    this.camTop = 1.2;
    this.hands = { R: this._hand('R'), L: this._hand('L') };
    this.floorAnim = new Map();
    this.history = [];          // ladder entries
    this.resets = [];
    this.beatFlash = { R: -9, L: -9 };
    this.msg = null;
    this.lastTime = null;
    this.resize();
  }
  /** Forget everything drawn for the previous engine (its clock restarts at 0). */
  clear() {
    this.history = []; this.resets = []; this.floorAnim.clear(); this.lastTime = null;
    this.beatFlash = { R: -9, L: -9 }; this.hands = { R: this._hand('R'), L: this._hand('L') };
  }
  _hand(h) { const s = h === 'R' ? 1 : -1; return { side: s, x: s * 0.2, y: 0, vx: 0, vy: 0 }; }

  resize() {
    const r = this.cv.parentElement.getBoundingClientRect();
    this.DPR = window.devicePixelRatio || 1; this.W = r.width; this.H = r.height;
    this.cv.width = Math.round(this.W * this.DPR); this.cv.height = Math.round(this.H * this.DPR);
  }

  flash(text, color = '#ffb347') { this.msg = { text, color, t: performance.now() }; }

  /** Feed the events returned by engine.update(). */
  events(eng, list) {
    for (const e of list) {
      switch (e.type) {
        case 'throw': case 'hold':
          e.balls.forEach((b, i) => this._hist({ kind: e.type === 'hold' ? 'hold' : 'throw', t0: e.time, t1: b.catchTime ?? e.time + 2 * eng.beatSec, hand: e.hand, to: b.to, v: b.value, src: e.src, id: b.id,
            label: e.balls.length > 1 ? (i === 0 ? '[' + e.balls.map(x => fmt(x.value)).join('') + ']' : '') : null }));
          break;
        case 'drop': {
          for (let i = this.history.length - 1; i >= 0; i--) if (this.history[i].id === e.id && this.history[i].kind === 'throw') { if (e.reason === 'collision' || e.reason === 'midair') this.history[i].kind = 'collide'; break; }
          this._hist({ kind: 'drop', t0: e.time, t1: e.time, hand: e.side, to: e.side });
          const why = { collision: 'Collision at the catch!', pirouette: 'Dropped while spinning', midair: 'Mid-air collision!' }[e.reason] || 'Drop';
          this.flash(why, '#ff6b6b');
          break;
        }
        case 'empty': this._hist({ kind: 'empty', t0: e.time, t1: e.time, hand: e.hand, to: e.hand }); this.flash(e.hand + ' hand was empty', '#8a93a3'); break;
        case 'takeover': this.flash('You have control', '#5ad19a'); break;
        case 'pickup': this.flash('Picked up (' + e.hand + ')', '#5ad19a'); break;
        case 'blocked': if (e.reason === 'pirouette') this.flash('Can\'t throw while spinning', '#8a93a3'); break;
        case 'reset':
          this.resets.push(e.time);
          for (const h of this.history) if (h.t1 > e.time) h.cut = true;
          this.floorAnim.clear();
          break;
        case 'beat': {
          const hands = eng.level <= 2 ? [eng.rl.hand(e.beat)] : eng.compiled.throwsAt(e.beat).map(t => t.hand);
          for (const h of hands) this.beatFlash[h] = e.time;
          break;
        }
      }
    }
  }
  _hist(e) { this.history.push(e); if (this.history.length > 240) this.history.splice(0, this.history.length - 240); }

  /* ---------------- animation ---------------- */
  _animate(eng, dt) {
    const g = eng.config.gravity;
    // hands: spring toward the catch spot when a ball is about to land, else carry/rest
    for (const h of ['R', 'L']) {
      const hd = this.hands[h];
      let inc = null;
      for (const b of eng.balls) if (b.state === 'air' && b.flight.to === h && (!inc || b.flight.t1 < inc.flight.t1)) inc = b;
      const tau = inc ? inc.flight.t1 - eng.time : 99;
      let tx, ty;
      if (tau < 0.16) { tx = catchPoint(h).x; ty = 0; }
      else if (eng.hands[h].held.length) { tx = throwPoint(h).x; ty = -0.06; }
      else { tx = hd.side * (GEOM.inX + GEOM.outX) / 2; ty = 0.025; }
      const K = 900, C = 60, sub = 4, hs = dt / sub;
      for (let i = 0; i < sub; i++) {
        hd.vx += (K * (tx - hd.x) - C * hd.vx) * hs; hd.vy += (K * (ty - hd.y) - C * hd.vy) * hs;
        hd.x += hd.vx * hs; hd.y += hd.vy * hs;
      }
    }
    // floor balls: fall from where they dropped, bounce, roll toward their side
    for (const b of eng.balls) {
      if (b.state !== 'floor') { this.floorAnim.delete(b.id); continue; }
      let f = this.floorAnim.get(b.id);
      if (!f) {
        const p = b.dropFrom || { x: 0, y: 0 }, v = b.dropVel || { x: 0, y: 0 };
        f = { x: p.x, y: p.y, vx: v.x, vy: v.y };
        this.floorAnim.set(b.id, f);
      }
      f.vy -= g * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      const floor = GEOM.floorY + GEOM.ballR;
      if (f.y < floor) { f.y = floor; f.vy = -f.vy * 0.45; f.vx *= 0.8; if (Math.abs(f.vy) < 0.25) f.vy = 0; }
      const restX = (b.side === 'R' ? 1 : -1) * 0.35;
      if (f.y <= floor + 1e-3 && f.vy === 0) f.x += (restX - f.x) * Math.min(1, dt * 2);
    }
  }

  _ballPos(eng, b) {
    if (b.state === 'air') return flightPosition(b.flight, eng.time, eng.config.gravity);
    if (b.state === 'hand') {
      const hd = this.hands[b.hand], i = eng.hands[b.hand].held.indexOf(b.id);
      const sq = this._squash(eng);
      return { x: (hd.x - hd.side * (i % 4) * 0.055) * sq, y: hd.y + 0.02 + Math.floor(i / 4) * 0.06 + (i % 4) * 0.012 };
    }
    const f = this.floorAnim.get(b.id);
    return f ? { x: f.x, y: f.y } : { x: 0, y: GEOM.floorY + GEOM.ballR };
  }
  _squash(eng) {
    if (!eng.pirouette.on) return 1;
    const c = Math.cos(2 * Math.PI * eng.pirouette.turns);
    return Math.sign(c || 1) * Math.max(0.12, Math.abs(c));
  }

  /* ---------------- drawing ---------------- */
  draw(eng, opts, pad, router) {
    const dt = this.lastTime === null ? 0 : Math.max(0, Math.min(0.1, eng.time - this.lastTime));
    this.lastTime = eng.time;
    this._animate(eng, dt);
    this._camera(eng, opts, dt);

    const { ctx, W, H } = this;
    ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const ladH = opts.showLadder ? LADDER_H : 0, stageH = H - ladH;
    const scale = Math.min(stageH / (this.camTop - VIEW_BOTTOM), W / 1.3);
    const SX = x => W / 2 + x * scale, SY = y => stageH - (y - VIEW_BOTTOM) * scale;
    const B = eng.beatSec, g = eng.config.gravity, d = eng.config.dwell;

    const grd = ctx.createLinearGradient(0, 0, 0, stageH);
    grd.addColorStop(0, '#171a21'); grd.addColorStop(1, '#101216');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, stageH);

    // height guides
    ctx.font = '11px system-ui'; ctx.textAlign = 'right';
    for (let v = 3; v <= 15; v++) {
      const T = (v - d) * B, hgt = g * T * T / 8;
      if (hgt > this.camTop) break;
      const y = SY(hgt);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillText(fmt(v), W - 8, y - 3);
    }
    ctx.strokeStyle = '#2f3540'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, SY(GEOM.floorY)); ctx.lineTo(W, SY(GEOM.floorY)); ctx.stroke();

    // juggler (squashed horizontally while spinning)
    const sq = this._squash(eng), asq = Math.abs(sq);
    const hR = this.hands.R, hL = this.hands.L;
    ctx.fillStyle = '#20242c';
    ctx.beginPath(); ctx.ellipse(SX(0), SY(0.66), 0.1 * scale * asq + 1, 0.1 * scale, 0, 0, Math.PI * 2); ctx.fill();
    roundRect(ctx, SX(-0.17 * asq), SY(0.48), 0.34 * scale * asq + 2, 1.0 * scale, Math.min(0.06 * scale, 0.17 * scale * asq)); ctx.fill();
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(4, 0.07 * scale); ctx.strokeStyle = '#272c35';
    for (const hd of [hR, hL]) {
      ctx.beginPath(); ctx.moveTo(SX(hd.side * 0.2 * sq), SY(0.42)); ctx.lineTo(SX(hd.side * 0.27 * sq), SY(0.02)); ctx.lineTo(SX(hd.x * sq), SY(hd.y)); ctx.stroke();
    }
    for (const [h, hd] of [['R', hR], ['L', hL]]) {
      ctx.fillStyle = h === 'R' ? 'rgba(255,143,163,0.85)' : 'rgba(111,183,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(SX(hd.x * sq), SY(hd.y) + Math.max(3, 0.03 * scale), Math.max(7, 0.06 * scale) * Math.max(0.4, asq), Math.max(4, 0.03 * scale), 0, 0, Math.PI * 2);
      ctx.fill();
      if (eng.level >= 3 && router.flipHeld(h)) {
        ctx.fillStyle = '#ffb347'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('FLIP', SX(hd.x * sq), SY(hd.y) + Math.max(22, 0.12 * scale));
      }
      if (opts.beatGuide) {
        const age = (eng.time - this.beatFlash[h]) / B;
        if (age >= 0 && age < 1) {
          ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - age)})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(SX(throwPoint(h).x * sq), SY(-0.02), Math.max(10, 0.06 * scale) + age * 14, 0, Math.PI * 2); ctx.stroke();
        }
      }
      const pend = eng.hands[h].pending;
      if (pend && opts.showHud) { ctx.fillStyle = '#ffb347'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(fmt(pend.value), SX(hd.x * sq), SY(hd.y) + 40); }
    }

    if (opts.previewMode && opts.previewMode !== 'off') this._previewArcs(eng, pad, router, SX, SY, scale, opts.previewMode === 'always');

    // balls
    const rpx = Math.max(4.5, GEOM.ballR * scale);
    for (const b of eng.balls) {
      const p = this._ballPos(eng, b);
      ctx.globalAlpha = b.state === 'floor' ? 0.75 : 1;
      ctx.fillStyle = COLORS[b.id % COLORS.length];
      ctx.beginPath(); ctx.arc(SX(p.x), SY(p.y), rpx, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (opts.showHud) this._hud(eng, stageH);
    if (this.msg) {
      const age = (performance.now() - this.msg.t) / 1000;
      if (age > 1.6) this.msg = null;
      else { ctx.globalAlpha = Math.min(1, 1.6 - age); ctx.textAlign = 'center'; ctx.font = 'bold 18px system-ui'; ctx.fillStyle = this.msg.color; ctx.fillText(this.msg.text, W / 2, 36); ctx.globalAlpha = 1; }
    }
    if (pad.connected && opts.showDials) {
      // Each dial sits just outside its own hand, at hand height, so the eye stays on the catches.
      const r = Math.max(38, Math.min(56, stageH * 0.08)), gap = 18;
      const cy = Math.max(r + 8, Math.min(stageH - r - 26, SY(0)));
      const clampX = x => Math.max(r + 8, Math.min(W - r - 8, x));
      const draw = opts.padScheme === 'buttons' ? this._buttonPad.bind(this) : this._dial.bind(this);
      draw(eng, pad, router, 'L', clampX(SX(-GEOM.outX) - gap - r), cy, r);
      draw(eng, pad, router, 'R', clampX(SX(GEOM.outX) + gap + r), cy, r);
    }
    if (opts.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, stageH);
      ctx.textAlign = 'center'; ctx.fillStyle = '#e6e8ec'; ctx.font = 'bold 22px system-ui'; ctx.fillText('Paused', W / 2, stageH / 2);
    }
    if (opts.showLadder) this._ladder(eng, opts, stageH, ladH);
  }

  /** What each hand would throw right now, for the preview arcs: [{ hand, value, to }]. */
  _previews(eng, pad, router, always) {
    const out = [], now = performance.now() / 1000;
    if (eng.pirouette.on) return out;
    if (eng.level === 1) {
      const p = eng.previewNext();
      if ((always || p.hasBall) && p.value > 0) out.push({ hand: p.hand, value: p.value, to: eng.rl.hand(p.beat + p.value) });
      return out;
    }
    for (const h of ['R', 'L']) {
      if (!always && !eng.hands[h].held.length) continue;
      let v = pad.connected ? pad.aimValue(h, now) : null;
      if (v == null) v = eng.level === 2 ? eng.peekDefault() : eng.compiled.balls;
      if (!(v > 0)) continue;
      const cross = (v % 2 === 1) !== (eng.level >= 3 && router.flipHeld(h));
      out.push({ hand: h, value: v, to: cross ? (h === 'R' ? 'L' : 'R') : h });
    }
    return out;
  }

  _previewArcs(eng, pad, router, SX, SY, scale, always) {
    const ctx = this.ctx, g = eng.config.gravity;
    ctx.save();
    ctx.setLineDash([5, 6]); ctx.lineWidth = 2;
    for (const p of this._previews(eng, pad, router, always)) {
      const color = p.hand === 'R' ? '255,143,163' : '111,183,255';
      if (isHold(p.value, p.hand, p.to)) {          // a hold: small ring at the hand
        const hd = this.hands[p.hand];
        ctx.strokeStyle = `rgba(${color},0.6)`;
        ctx.beginPath(); ctx.arc(SX(hd.x), SY(hd.y + 0.02), Math.max(9, 0.05 * scale), 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      const T = flightTime(p.value, eng.beatSec, eng.config.dwell, p.hand, p.to);
      const f = { t0: 0, t1: T, x0: throwPoint(p.hand).x, y0: 0.02, x1: catchPoint(p.to).x, y1: 0 };
      ctx.strokeStyle = `rgba(${color},0.55)`;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const q = flightPosition(f, (T * i) / 40, g); i ? ctx.lineTo(SX(q.x), SY(q.y)) : ctx.moveTo(SX(q.x), SY(q.y)); }
      ctx.stroke();
      const top = flightPosition(f, T / 2, g);
      ctx.fillStyle = `rgba(${color},0.9)`; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(fmt(p.value), SX(top.x) + (p.hand === p.to ? 0 : 10), Math.max(16, SY(top.y) - 6));
    }
    ctx.restore();
  }

  _camera(eng, opts, dt) {
    const g = eng.config.gravity;
    let target;
    if (opts.autoZoom) {
      let m = 0.9;
      for (const b of eng.balls) if (b.state === 'air') m = Math.max(m, Math.max(b.flight.y0, b.flight.y1) + b.flight.peakHeight * (g / eng.config.gravity));
      target = m + 0.3;
    } else {
      const T = ((opts.viewHeight || 7) - eng.config.dwell) * eng.beatSec;   // fixed view fits a throw of this value
      target = g * T * T / 8 + 0.3;
    }
    this.camTop += (target - this.camTop) * (1 - Math.exp(-dt * (target > this.camTop ? 4 : 1.2) / Math.max(eng.config.timeScale, 0.05)));
  }

  _hud(eng, stageH) {
    const ctx = this.ctx;
    ctx.textAlign = 'left';
    const big = (t, c) => { ctx.fillStyle = c; ctx.font = 'bold 18px system-ui'; ctx.fillText(t, 16, 30); };
    const small = (t, y) => { ctx.fillStyle = '#8a93a3'; ctx.font = '12px system-ui'; ctx.fillText(t, 16, y); };
    if (eng.pirouette.on) { big('SPINNING · ' + eng.pirouette.turns.toFixed(1) + ' turns', '#c792ff'); return; }
    if (eng.level === 1) {
      big('ON-BEAT', '#5ad19a');
      const p = eng.previewNext();
      if (p.hasBall) {
        ctx.font = 'bold 26px system-ui'; ctx.fillStyle = p.hand === 'R' ? '#ff8fa3' : '#6fb7ff'; ctx.fillText(p.hand, 16, 64);
        ctx.fillStyle = '#ffb347'; ctx.fillText(fmt(p.value), 42, 64);
        small(p.src === 'default' ? 'next throw (default)' : 'next throw (chosen)', 82);
      } else small('next beat: ' + p.hand + ' hand is empty', 52);
      return;
    }
    if (eng.mode === 'auto') { big('AUTOPILOT', '#5ad19a'); small(eng.compiled.text + (eng.compiled.handswap !== '2' ? ' · hand order ' + eng.compiled.handswap : ''), 48); small('make any throw to take over', 64); return; }
    big("YOU'RE JUGGLING", '#ffb347');
    if (eng.level === 2) small('default next: ' + fmt(eng.peekDefault()), 48);
    small('number keys → ' + eng.nextAlternateHand() + ' hand', eng.level === 2 ? 64 : 48);
  }

  _dial(eng, pad, router, h, cx, cy, r) {
    const ctx = this.ctx, dir = h === 'R' ? -1 : 1;
    const pt = (deg, rad) => [cx + dir * Math.cos(deg * Math.PI / 180) * rad, cy - Math.sin(deg * Math.PI / 180) * rad];
    const A = pad.aim[h], now = performance.now() / 1000;
    const aimed = pad.aimValue(h, now);
    const flipped = eng.level >= 3 && router.flipHeld(h);
    const spinning = h === 'L' && eng.pirouette.on;
    ctx.save();
    ctx.fillStyle = 'rgba(16,18,22,0.75)'; ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();
    if (flipped) { ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.stroke(); }
    for (const sec of SECTORS) {
      const isCur = aimed !== null && A.sector === sec;
      const cross = sec.v > 0 && ((sec.v % 2 === 1) !== flipped);
      const base = cross ? 'rgba(255,179,71,' : 'rgba(127,178,255,';
      ctx.fillStyle = base + (spinning ? 0.06 : isCur ? 0.8 : 0.16) + ')';
      ctx.beginPath(); ctx.moveTo(cx, cy);
      for (let dd = sec.a; dd < sec.b; dd += 3) { const [x, y] = pt(dd, r); ctx.lineTo(x, y); }
      { const [x, y] = pt(sec.b, r); ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(19,21,26,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
      const [lx, ly] = pt((sec.a + sec.b) / 2, r * 0.72);
      ctx.fillStyle = isCur ? '#ffffff' : 'rgba(230,232,236,0.75)';
      ctx.font = 'bold ' + Math.round(r * 0.25) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sec.v + (flipped ? (sec.v % 2 ? '↑' : 'x') : ''), lx, ly);
    }
    let centre = '';
    if (spinning) centre = '⟳';
    else if (aimed !== null) centre = fmt(aimed);
    else if (eng.level === 1) { const n = eng.nextFor[h]; centre = n ? fmt(n.value) : '·'; }
    else if (eng.level === 2) centre = fmt(eng.peekDefault());
    else centre = fmt(eng.compiled.balls);
    ctx.fillStyle = aimed !== null ? 'rgba(30,33,40,0.9)' : 'rgba(58,51,32,0.95)';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = aimed !== null ? '#8a93a3' : '#ffb347'; ctx.font = 'bold ' + Math.round(r * 0.28) + 'px system-ui';
    ctx.fillText(centre, cx, cy + 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r * AIM.on, 0, Math.PI * 2); ctx.stroke();
    const st = pad.stick[h];
    ctx.fillStyle = A.active ? '#ffb347' : '#e6e8ec';
    ctx.beginPath(); ctx.arc(cx + st.x * r, cy + st.y * r, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = h === 'R' ? '#ff8fa3' : '#6fb7ff'; ctx.font = 'bold 12px system-ui'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(h + (spinning ? ' · spin' : flipped ? ' · flip' : ''), cx, cy + r + 18);
    ctx.restore();
  }

  /** Buttons scheme: a diamond of the 4 values this hand's buttons throw in the current bank. */
  _buttonPad(eng, pad, router, h, cx, cy, r) {
    const ctx = this.ctx, inDir = h === 'R' ? -1 : 1;
    const shifted = pad.shifted(h), flipped = eng.level >= 3 && router.flipHeld(h);
    const spinning = eng.pirouette.on;
    const pos = { up: [0, -1], down: [0, 1], in: [inDir, 0], out: [-inDir, 0] };
    const d = r * 0.58, br = r * 0.36;
    ctx.save();
    ctx.fillStyle = 'rgba(16,18,22,0.75)'; ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();
    if (flipped) { ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.stroke(); }
    for (const dir of DIRS) {
      const v = bankValue(dir, shifted), [px, py] = pos[dir];
      const cross = (v % 2 === 1) !== flipped;
      const held = !!pad.held[`b${h}_${dir}`];
      ctx.fillStyle = (cross ? 'rgba(255,179,71,' : 'rgba(127,178,255,') + (spinning ? 0.08 : held ? 0.85 : 0.25) + ')';
      ctx.beginPath(); ctx.arc(cx + px * d, cy + py * d, br, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = held ? '#ffffff' : 'rgba(230,232,236,0.85)';
      ctx.font = 'bold ' + Math.round(r * 0.32) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(v + (flipped ? (v % 2 ? '↑' : 'x') : ''), cx + px * d, cy + py * d + 1);
    }
    ctx.fillStyle = shifted ? '#ffb347' : '#555c69'; ctx.font = 'bold ' + Math.round(r * 0.22) + 'px system-ui';
    ctx.fillText(shifted ? 'HIGH' : 'low', cx, cy + 1);
    ctx.fillStyle = h === 'R' ? '#ff8fa3' : '#6fb7ff'; ctx.font = 'bold 12px system-ui'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(h + (spinning && h === 'L' ? ' · spin' : flipped ? ' · flip' : ''), cx, cy + r + 18);
    ctx.restore();
  }

  _ladder(eng, opts, top, h) {
    const ctx = this.ctx, W = this.W, B = eng.beatSec;
    ctx.fillStyle = '#181b21'; ctx.fillRect(0, top, W, h);
    ctx.strokeStyle = '#2b303a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, top + 0.5); ctx.lineTo(W, top + 0.5); ctx.stroke();
    const back = 10 * B, ahead = 10 * B, pps = W / (back + ahead), nowX = back * pps;
    const X = t => nowX + (t - eng.time) * pps;
    const rowY = hh => (hh === 'R' ? top + 40 : top + h - 34);
    ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'left';
    ctx.fillStyle = '#ff8fa3'; ctx.fillText('R', 6, rowY('R') + 4);
    ctx.fillStyle = '#6fb7ff'; ctx.fillText('L', 6, rowY('L') + 4);
    ctx.strokeStyle = '#262a32';
    for (const hh of ['R', 'L']) { ctx.beginPath(); ctx.moveTo(20, rowY(hh)); ctx.lineTo(W, rowY(hh)); ctx.stroke(); }
    if (opts.beatGuide) {
      for (let k = Math.floor(eng.beatPos - 10); k <= Math.ceil(eng.beatPos + 10); k++) {
        const x = X(eng.time + (k - eng.beatPos) * B); if (x < 18) continue;
        const hands = eng.level <= 2 ? [eng.rl.hand(k)] : eng.compiled.throwsAt(k).map(t => t.hand);
        for (const hh of hands) { ctx.fillStyle = '#3a404c'; ctx.beginPath(); ctx.arc(x, rowY(hh), 2.5, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.setLineDash([3, 4]); ctx.strokeStyle = '#5ad19a55';
    for (const rt of this.resets) { const x = X(rt); if (x > 0 && x < W) { ctx.beginPath(); ctx.moveTo(x, top + 6); ctx.lineTo(x, top + h - 6); ctx.stroke(); } }
    ctx.setLineDash([]);
    ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
    for (const e of this.history) {
      const x1 = X(e.t0), x2 = X(e.t1);
      if (x2 < 0 || x1 > W + 4) continue;
      const y1 = rowY(e.hand), y2 = rowY(e.to);
      if (e.kind === 'empty') { ctx.strokeStyle = '#555c69'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x1, y1, 4, 0, Math.PI * 2); ctx.stroke(); continue; }
      if (e.kind === 'drop') {
        ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1 - 5, y1 - 5); ctx.lineTo(x1 + 5, y1 + 5); ctx.moveTo(x1 + 5, y1 - 5); ctx.lineTo(x1 - 5, y1 + 5); ctx.stroke(); continue;
      }
      let color = e.src === 'auto' || e.src === 'default' ? '#8a93a3' : '#ffb347';
      if (e.kind === 'hold') color = '#7fb2ff';
      if (e.kind === 'collide') color = '#ff6b6b';
      if (e.cut) color += '44';
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y1);
      if (e.hand === e.to) { const bulge = Math.min(32, 8 + e.v * 4) * (e.hand === 'R' ? -1 : 1); ctx.quadraticCurveTo((x1 + x2) / 2, y1 + bulge * 1.6, x2, y2); }
      else ctx.lineTo(x2, y2);
      ctx.stroke();
      const natural = e.v % 2 === 1, crossed = e.to !== e.hand;
      const lab = e.label ?? (fmt(e.v) + (eng.level >= 3 && crossed && !natural ? 'x' : ''));
      ctx.fillStyle = color; ctx.fillText(lab, x1, e.hand === 'R' ? y1 - 10 : y1 + 18);
    }
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(nowX, top + 6); ctx.lineTo(nowX, top + h - 6); ctx.stroke();
    ctx.fillStyle = '#8a93a3'; ctx.font = '10px system-ui'; ctx.textAlign = 'left'; ctx.fillText('past', 24, top + h - 8);
    ctx.textAlign = 'right'; ctx.fillText('in flight', W - 6, top + h - 8);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
