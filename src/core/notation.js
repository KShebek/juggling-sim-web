// Siteswap notation: parsing and validation.
// Async (vanilla, with 0s and multiplex) and sync (with x, multiplex and *).
// Pure functions, no browser APIs.

export const R = 'R';
export const L = 'L';
export const otherHand = h => (h === R ? L : R);

export class NotationError extends Error {
  constructor(message) { super(message); this.name = 'NotationError'; }
}

/** '0'-'9' = 0-9, 'a'-'z' = 10-35. */
export function valueOf(ch) {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'a' && ch <= 'z') return ch.charCodeAt(0) - 87;
  return NaN;
}
export function formatValue(v) { return v < 10 ? String(v) : String.fromCharCode(87 + v); }

const mod = (a, n) => ((a % n) + n) % n;

/* ---------- tokenizer ----------
   A "throw" is one hand's action on one beat: a single value or a multiplex
   [..] of values. Each value may carry an x (sync only). */
function readThrow(s, i, allowX, where) {
  const balls = [];
  const readOne = () => {
    if (s[i] === 'x') throw new NotationError('x only marks a crossing throw in sync patterns, e.g. (4x,4x); it isn\'t a value.');
    const v = valueOf(s[i]);
    if (Number.isNaN(v)) throw new NotationError(`Unexpected "${s[i] ?? 'end'}" ${where}.`);
    i++;
    let cross = false;
    if (s[i] === 'x') {
      if (!allowX) throw new NotationError('x (crossing) is only used in sync patterns like (4x,4x). In async patterns the hand order decides where a ball lands.');
      cross = true; i++;
    }
    balls.push({ value: v, cross });
  };
  if (s[i] === '[') {
    i++;
    while (i < s.length && s[i] !== ']') readOne();
    if (s[i] !== ']') throw new NotationError('A multiplex [..] is missing its closing ].');
    i++;
    if (balls.length < 2) throw new NotationError('A multiplex [..] needs at least two values.');
    if (balls.some(b => b.value === 0)) throw new NotationError('A multiplex can\'t contain 0.');
  } else readOne();
  return { balls, next: i };
}

/**
 * Parse and validate a pattern string.
 * Returns { type: 'async'|'sync', text, period, beats, balls, multiplex }
 *  - async: beats[i] = { balls: [{value}] }        (hand comes from the hand order)
 *  - sync:  beats[2k] = { R: {balls}, L: {balls} } and beats[2k+1] = null.
 *           Pairs are written (R,L): right hand first.
 */
export function parsePattern(input) {
  const text = String(input ?? '').replace(/\s+/g, '').toLowerCase();
  if (!text) throw new NotationError('Type a pattern, e.g. 3, 531 or (6x,4)*.');
  return text.startsWith('(') ? parseSync(text) : parseAsync(text);
}

function parseAsync(text) {
  const beats = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '(' || text[i] === ')' || text[i] === ',' || text[i] === '*') {
      throw new NotationError('Mixed sync and async notation isn\'t supported. Write the whole pattern in one form.');
    }
    const r = readThrow(text, i, false, 'in the pattern');
    beats.push({ balls: r.balls });
    i = r.next;
  }
  const period = beats.length;
  const sum = beats.reduce((a, b) => a + b.balls.reduce((x, y) => x + y.value, 0), 0);
  if (sum % period) {
    throw new NotationError(`${text}: the average is ${(sum / period).toFixed(2)}, not a whole number of balls.`);
  }
  // Each beat must receive exactly as many balls as it throws.
  const thrown = beats.map(b => b.balls.filter(x => x.value > 0).length);
  const landed = new Array(period).fill(0);
  beats.forEach((b, k) => b.balls.forEach(x => { if (x.value > 0) landed[mod(k + x.value, period)]++; }));
  for (let k = 0; k < period; k++) {
    if (landed[k] !== thrown[k]) {
      throw new NotationError(`${text} isn't valid: ${landed[k]} ball${landed[k] === 1 ? '' : 's'} land${landed[k] === 1 ? 's' : ''} on beat ${k + 1} but ${thrown[k]} ${thrown[k] === 1 ? 'is' : 'are'} thrown there.`);
    }
  }
  return { type: 'async', text, period, beats, balls: sum / period, multiplex: beats.some(b => b.balls.length > 1) };
}

function parseSync(text) {
  let body = text, star = false;
  if (body.endsWith('*')) { star = true; body = body.slice(0, -1); }
  let pairs = [], i = 0;
  while (i < body.length) {
    if (body[i] !== '(') throw new NotationError('Sync patterns are pairs like (4,4) or (6x,4), optionally ending with *. Mixed sync/async isn\'t supported.');
    i++;
    const a = readThrow(body, i, true, 'in a sync pair'); i = a.next;
    if (body[i] !== ',') throw new NotationError('Each sync pair needs a comma: (right,left), e.g. (4,2x).');
    i++;
    const b = readThrow(body, i, true, 'in a sync pair'); i = b.next;
    if (body[i] !== ')') throw new NotationError('A sync pair is missing its closing ).');
    i++;
    pairs.push({ R: { balls: a.balls }, L: { balls: b.balls } });
  }
  if (!pairs.length) throw new NotationError('Sync format: pairs like (4,4) or (6x,4), optionally ending with *.');
  for (const p of pairs) for (const h of [R, L]) for (const x of p[h].balls) {
    if (x.value % 2) throw new NotationError(`Sync patterns only use even values (${formatValue(x.value)} is odd).`);
    if (x.value === 0 && x.cross) throw new NotationError('0x doesn\'t mean anything: an empty hand can\'t cross.');
  }
  if (star) pairs = pairs.concat(pairs.map(p => ({ R: p.L, L: p.R })));
  const period = 2 * pairs.length;
  const beats = [];
  pairs.forEach(p => { beats.push(p); beats.push(null); });
  const key = (beat, hand) => mod(beat, period) + hand;
  const landed = new Map();
  pairs.forEach((p, k) => {
    for (const h of [R, L]) for (const x of p[h].balls) if (x.value > 0) {
      const kk = key(2 * k + x.value, x.cross ? otherHand(h) : h);
      landed.set(kk, (landed.get(kk) || 0) + 1);
    }
  });
  pairs.forEach((p, k) => {
    for (const h of [R, L]) {
      const need = p[h].balls.filter(x => x.value > 0).length;
      const got = landed.get(key(2 * k, h)) || 0;
      if (got !== need) {
        throw new NotationError(`${text} isn't valid: the ${h} hand on beat ${2 * k + 1} has ${got} ball${got === 1 ? '' : 's'} landing but throws ${need}.`);
      }
    }
  });
  const sum = pairs.reduce((a, p) => a + [R, L].reduce((s, h) => s + p[h].balls.reduce((x, y) => x + y.value, 0), 0), 0);
  if (sum % period) throw new NotationError(`${text}: the ball count isn't a whole number.`);
  const multiplex = pairs.some(p => p.R.balls.length > 1 || p.L.balls.length > 1);
  return { type: 'sync', text, period, beats, balls: sum / period, multiplex };
}

/**
 * Handswap (hand order) notation: each value = beats until that hand throws
 * again. Average 2, validated like siteswap, no 0s (for now).
 */
export function parseHandswap(input) {
  const text = String(input ?? '').replace(/\s+/g, '').toLowerCase() || '2';
  if (!/^[0-9a-z]+$/.test(text) || text.includes('x')) {
    throw new NotationError('Hand order uses digits only, e.g. 2, 13 or 123.');
  }
  const values = [...text].map(valueOf);
  if (values.includes(0)) throw new NotationError('Hand order can\'t contain 0 yet: some hand has to throw on every beat.');
  const period = values.length, sum = values.reduce((a, b) => a + b, 0);
  if (sum !== 2 * period) {
    throw new NotationError(`Hand order ${text} averages ${(sum / period).toFixed(2)}, but it must average 2 (two hands).`);
  }
  const seen = new Set();
  for (let i = 0; i < period; i++) {
    const k = (i + values[i]) % period;
    if (seen.has(k)) throw new NotationError(`Hand order ${text} isn't valid: both hands would throw on beat ${k + 1}.`);
    seen.add(k);
  }
  return { text, values, period };
}
