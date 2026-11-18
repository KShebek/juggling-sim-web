// Schedule builder: the exact event list for a pattern played perfectly.
// Used for autopilot previews, ladders and tests.

import { beatSeconds, flightTime, peakHeight, isHold } from './timing.js';

/**
 * buildSchedule(compiled, { start: 'warm'|'cold', beats, tempo, dwell, gravity })
 * Beat 0 is at time 0. Returns { balls: [{id, hand, state, landBeat}], events }.
 * Events (sorted by time):
 *   { type: 'throw'|'hold', time, beat, hand, balls: [{ id, value, catchHand, flightTime, peakHeight, catchTime }] }
 *   { type: 'catch', time, beat (landing beat), hand, id }
 * Every throw event carries a list of balls (length 1 unless multiplex).
 */
export function buildSchedule(compiled, { start = 'warm', beats = 16, tempo = 120, dwell = 0.6, gravity = 9.81 } = {}) {
  const B = beatSeconds(tempo);
  const balls = [];
  const events = [];
  let nextId = 0;
  if (start === 'warm') {
    for (const w of compiled.warmBalls()) {
      const id = nextId++;
      const hold = isHold(w.value, w.hand, w.to);
      const catchTime = hold ? null : w.landBeat * B - dwell * B;
      balls.push({ id, hand: w.to, dueBeat: w.landBeat, startState: hold || catchTime <= 0 ? 'hand' : 'air', thrownBeat: w.thrownBeat, value: w.value, from: w.hand });
      if (!hold && catchTime > 0) events.push({ type: 'catch', time: catchTime, beat: w.landBeat, hand: w.to, id });
    }
  } else {
    const split = compiled.restSplit();
    for (const h of ['R', 'L']) for (const d of split.due[h]) balls.push({ id: nextId++, hand: h, dueBeat: d, startState: 'hand' });
  }
  const live = balls.map(b => ({ id: b.id, hand: b.hand, dueBeat: b.dueBeat }));
  for (let beat = 0; beat < beats; beat++) {
    for (const t of compiled.throwsAt(beat)) {
      const out = [];
      let anyHold = true;
      for (const x of t.balls) {
        const k = live.findIndex(b => b.hand === t.hand && b.dueBeat === beat);
        if (k < 0) throw new Error(`Schedule: no ball due in ${t.hand} at beat ${beat} for ${compiled.text}.`);
        const ball = live[k];
        const ft = flightTime(x.value, B, dwell, t.hand, x.to);
        const hold = isHold(x.value, t.hand, x.to);
        if (!hold) anyHold = false;
        const catchTime = hold ? null : beat * B + ft;
        out.push({ id: ball.id, value: x.value, catchHand: x.to, flightTime: ft, peakHeight: peakHeight(ft, gravity), catchTime });
        ball.hand = x.to; ball.dueBeat = beat + x.value;
        if (!hold) events.push({ type: 'catch', time: catchTime, beat: beat + x.value, hand: x.to, id: ball.id });
      }
      events.push({ type: anyHold ? 'hold' : 'throw', time: beat * B, beat, hand: t.hand, balls: out });
    }
  }
  events.sort((a, b) => a.time - b.time || (a.type === 'catch' ? -1 : 1));
  return { balls, events };
}
