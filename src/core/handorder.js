// Hand order: which hand throws on each beat, from a handswap pattern and a
// starting hand. Beat 0 = starting hand.

import { R, L, otherHand, parseHandswap } from './notation.js';

const mod = (a, n) => ((a % n) + n) % n;

/**
 * Build the steady hand sequence for a handswap pattern.
 * Returns { text, period, cycle, hand(beat) } where
 *  - period = the handswap's notation period
 *  - cycle  = the real hand cycle: period, or 2*period when the hands come back
 *             swapped (e.g. 13 → RRLL has period 2 but cycle 4).
 */
export function handSequence(handswap = '2', startingHand = R) {
  const hs = typeof handswap === 'string' ? parseHandswap(handswap) : handswap;
  const p = hs.period, h = hs.values;
  // Simulate the two hands as two "balls". A beat nobody has claimed goes to
  // the hand that isn't already scheduled. Run long enough to reach the steady
  // part, then read one cycle from there.
  const len = 40 * p + 40;
  const seq = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (seq[i] === null) {
      let scheduled = null;
      for (let j = i + 1; j < len && scheduled === null; j++) if (seq[j] !== null) scheduled = seq[j];
      seq[i] = i === 0 ? R : (scheduled === null ? otherHand(seq[i - 1]) : otherHand(scheduled));
    }
    const nx = i + h[i % p];
    if (nx < len) seq[nx] = seq[i];
  }
  const base = 20 * p;                               // multiple of p, inside the steady part
  let cycle = p;
  for (let k = 0; k < p; k++) if (seq[base + k] !== seq[base + k + p]) { cycle = 2 * p; break; }
  const flip = seq[base] !== startingHand;           // relabel so beat 0 = starting hand
  const window = [];
  for (let k = 0; k < cycle; k++) window.push(flip ? otherHand(seq[base + k]) : seq[base + k]);
  return { text: hs.text, period: p, cycle, hand: b => window[mod(b, cycle)] };
}

/** First n hands as a string, e.g. 'RRLL'. Handy for tests and display. */
export function handString(seq, n) {
  let s = '';
  for (let b = 0; b < n; b++) s += seq.hand(b);
  return s;
}

export { R, L };
