// Landing state: how many balls are due to land on each upcoming beat.

import { R, L } from './notation.js';

/**
 * Landing state of a compiled pattern just before beat 0, from its warm balls.
 * Returns { total: [count per beat], R: [...], L: [...] } indexed by beat 0, 1, 2…
 */
export function patternState(compiled) {
  return stateFromLandings(compiled.warmBalls().map(b => ({ beat: b.landBeat, hand: b.to })));
}

/** Build a state from a list of { beat (relative, ≥ 0), hand }. */
export function stateFromLandings(landings) {
  const len = Math.max(0, ...landings.map(x => x.beat + 1));
  const s = { total: new Array(len).fill(0), R: new Array(len).fill(0), L: new Array(len).fill(0) };
  for (const x of landings) { s.total[x.beat]++; s[x.hand][x.beat]++; }
  return s;
}

/** Async state as a string, e.g. '111' for 3, '11010' for 51. Counts above 1 show as digits. */
export const stateString = s => s.total.map(c => (c > 9 ? '+' : String(c))).join('').replace(/0+$/, '') || '0';

/** Ground state = the first n beats each have exactly one ball landing. */
export function isGroundState(s, balls) {
  for (let i = 0; i < s.total.length; i++) if (s.total[i] !== (i < balls ? 1 : 0)) return false;
  return s.total.length >= balls;
}

/**
 * Legal single throws (no multiplex) for the next beat of an async state:
 * a 0 if nothing lands, otherwise any value whose landing beat is free.
 */
export function legalThrows(s, maxValue = 7) {
  if (!(s.total[0] > 0)) return [0];
  const out = [];
  for (let v = 1; v <= maxValue; v++) if (!(s.total[v] > 0)) out.push(v);
  return out;
}

export { R, L };
