// Compile a pattern + hand order + starting hand into concrete throws:
// which hand throws which balls on each beat, and where each ball lands.

import { R, L, otherHand, parsePattern, NotationError } from './notation.js';
import { handSequence } from './handorder.js';

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export const lcm = (a, b) => (a / gcd(a, b)) * b;
const mod = (a, n) => ((a % n) + n) % n;

/**
 * compilePattern('531', { handswap: '2', startingHand: 'R' })
 * Returns {
 *   type, text, handswap, startingHand, balls, multiplex, maxValue,
 *   notationPeriod,   // LCM(siteswap period, handswap period); sync: the pair period
 *   cycle,            // real repeat including which hand: may be 2x the notation period
 *   throwsAt(beat) -> [{ hand, balls: [{ value, to }] }]   (only hands with value > 0)
 *   handAt(beat)   -> hand for async patterns; null for sync
 *   restSplit()    -> { R, L, due: { R: [beats], L: [beats] } }  balls needed from rest
 *   warmBalls()    -> balls in the air or in hand just before beat 0's throws
 * }
 * Sync pairs are always (R,L). Starting hand only affects async hand order.
 */
export function compilePattern(patternInput, { handswap = '2', startingHand = R } = {}) {
  const pat = typeof patternInput === 'string' ? parsePattern(patternInput) : patternInput;
  if (startingHand !== R && startingHand !== L) throw new NotationError('Starting hand must be R or L.');
  let throwsAt, handAt, notationPeriod, cycle, hsText = '2';

  if (pat.type === 'async') {
    const seq = handSequence(handswap, startingHand);
    hsText = seq.text;
    const n = pat.period;
    notationPeriod = lcm(n, seq.period);
    cycle = lcm(n, seq.cycle);
    handAt = b => seq.hand(b);
    throwsAt = b => {
      const beat = pat.beats[mod(b, n)];
      const balls = beat.balls.filter(x => x.value > 0).map(x => ({ value: x.value, to: seq.hand(b + x.value) }));
      return balls.length ? [{ hand: seq.hand(b), balls }] : [];
    };
  } else {
    if (String(handswap || '2').trim() !== '2') {
      throw new NotationError('Hand order only applies to async patterns. Sync patterns already say which hand throws: (right,left).');
    }
    notationPeriod = cycle = pat.period;
    handAt = () => null;
    throwsAt = b => {
      if (mod(b, 2)) return [];
      const pair = pat.beats[mod(b, pat.period)];
      const out = [];
      for (const h of [R, L]) {
        const balls = pair[h].balls.filter(x => x.value > 0).map(x => ({ value: x.value, to: x.cross ? otherHand(h) : h }));
        if (balls.length) out.push({ hand: h, balls });
      }
      return out;
    };
  }

  const maxValue = Math.max(1, ...pat.beats.filter(Boolean).flatMap(b => (b.balls ? b.balls : [...b.R.balls, ...b.L.balls]).map(x => x.value)));

  /** Balls each hand needs at rest to start the pattern at beat 0 (cold start). */
  function restSplit() {
    const avail = { R: [], L: [] };     // landing beats of balls on their way / in hand
    const due = { R: [], L: [] };       // beats at which a ball from rest is first thrown
    const horizon = 4 * cycle + 4 * maxValue + 8;
    for (let b = 0; b < horizon; b++) {
      for (const t of throwsAt(b)) {
        for (const x of t.balls) {
          const k = avail[t.hand].indexOf(b);
          if (k >= 0) avail[t.hand].splice(k, 1);
          else due[t.hand].push(b);
          avail[x.to].push(b + x.value);
        }
      }
    }
    const split = { R: due.R.length, L: due.L.length, due };
    if (split.R + split.L !== pat.balls) {
      throw new NotationError(`Internal: cold start for ${pat.text} found ${split.R + split.L} balls, expected ${pat.balls}.`);
    }
    return split;
  }

  /** Balls already out just before beat 0, as in a pattern that has been running. */
  function warmBalls() {
    const out = [];
    const back = 2 * cycle + 2 * maxValue + 4;
    for (let b = -back; b < 0; b++) {
      for (const t of throwsAt(b)) for (const x of t.balls) {
        if (b + x.value >= 0) out.push({ thrownBeat: b, hand: t.hand, value: x.value, to: x.to, landBeat: b + x.value });
      }
    }
    if (out.length !== pat.balls) {
      throw new NotationError(`Internal: warm start for ${pat.text} found ${out.length} balls, expected ${pat.balls}.`);
    }
    return out;
  }

  return {
    type: pat.type, text: pat.text, handswap: hsText, startingHand,
    balls: pat.balls, multiplex: pat.multiplex, maxValue, parsed: pat,
    notationPeriod, cycle, throwsAt, handAt, restSplit, warmBalls
  };
}
