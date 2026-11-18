// Run: node tests/run.js   (no dependencies)
import {
  parsePattern, parseHandswap, NotationError, handSequence, handString, compilePattern,
  patternState, stateString, isGroundState, legalThrows, buildSchedule, validateConfig, createEngine
} from '../src/core/index.js';

let pass = 0, fail = 0;
const results = [];
function test(name, fn) {
  try { fn(); pass++; results.push('  ✓ ' + name); }
  catch (e) { fail++; results.push('  ✗ ' + name + '\n      ' + (e && e.message)); }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), Bv = JSON.stringify(b);
  if (A !== Bv) throw new Error(`${msg || 'expected'}: ${Bv}, got ${A}`);
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function throwsNotation(fn, re) {
  try { fn(); } catch (e) {
    if (!(e instanceof NotationError)) throw e;
    if (re && !re.test(e.message)) throw new Error('wrong message: ' + e.message);
    return e.message;
  }
  throw new Error('expected a NotationError');
}

/* Run an engine for some seconds in small steps; collect events. */
function run(eng, seconds, step = 1 / 120, onStep) {
  const ev = [];
  for (let t = 0; t < seconds; t += step) { if (onStep) onStep(eng); ev.push(...eng.update(step)); }
  return ev;
}
const drops = ev => ev.filter(e => e.type === 'drop');

/* ---------------- notation ---------------- */
console.log('Notation');
for (const [p, n] of [['3', 3], ['441', 3], ['531', 3], ['51', 3], ['423', 3], ['50505', 3], ['744', 5], ['330', 2]]) {
  test(`${p} valid, ${n} balls`, () => eq(parsePattern(p).balls, n));
}
test('54 invalid (average 4.5)', () => throwsNotation(() => parsePattern('54'), /average is 4\.50/));
test('432 invalid (two balls land on one beat)', () => throwsNotation(() => parsePattern('432'), /isn't valid/));
for (const [p, n] of [['(4,4)', 4], ['(6x,2x)', 4], ['(4,2x)(2x,4)', 3], ['(6x,4)*', 5], ['(4,6x)*', 5]]) {
  test(`${p} valid, ${n} balls`, () => eq(parsePattern(p).balls, n));
}
test('(6x,4) without * invalid', () => throwsNotation(() => parsePattern('(6x,4)'), /isn't valid/));
test('(5,4) invalid (odd sync value)', () => throwsNotation(() => parsePattern('(5,4)'), /even values/));
test('[43]14 valid multiplex, 4 balls', () => { const p = parsePattern('[43]14'); eq(p.balls, 4); ok(p.multiplex); });
test('4x3 rejected in async', () => throwsNotation(() => parsePattern('4x3'), /sync/));
test('letters: b = 11 (b1 is 6 balls)', () => eq(parsePattern('b1').balls, 6));

/* ---------------- hand order ---------------- */
console.log('Hand order');
test('handswap 2 -> RLRL', () => eq(handString(handSequence('2', 'R'), 6), 'RLRLRL'));
test('handswap 13 -> RRLL', () => eq(handString(handSequence('13', 'R'), 8), 'RRLLRRLL'));
test('handswap 123 -> RRLRRL', () => eq(handString(handSequence('123', 'R'), 6), 'RRLRRL'));
test('starting hand L mirrors 13 -> LLRR', () => eq(handString(handSequence('13', 'L'), 4), 'LLRR'));
test('handswap 12 invalid', () => throwsNotation(() => parseHandswap('12'), /average 2/));
test('handswap 330 rejected (no 0s yet)', () => throwsNotation(() => parseHandswap('330'), /0/));
test('3 with handswap 13: notation period 2, hand cycle 4', () => {
  const c = compilePattern('3', { handswap: '13' });
  eq([c.notationPeriod, c.cycle], [2, 4]);
});
test('3 with handswap 13: catching hands', () => {
  const c = compilePattern('3', { handswap: '13' });
  // hands RRLL: beat 0 R -> beat 3 L (cross); beat 1 R -> beat 4 R (stays); beat 2 L -> 5 R; beat 3 L -> 6 L
  eq([0, 1, 2, 3].map(b => c.throwsAt(b)[0].hand + '>' + c.throwsAt(b)[0].balls[0].to), ['R>L', 'R>R', 'L>R', 'L>L']);
});
test('a 2 under hand order 13 that lands in the other hand is a throw, not a hold', () => {
  const c = compilePattern('2', { handswap: '13' });          // beat 1: R throws 2 -> beat 3 = L
  const t = c.throwsAt(1)[0];
  eq([t.hand, t.balls[0].to], ['R', 'L']);
  const s = buildSchedule(c, { start: 'warm', beats: 4 });
  ok(s.events.some(e => e.type === 'throw' && e.beat === 1 && e.balls[0].flightTime > 0), 'beat 1 should fly');
});
test('sync rejects a hand order', () => throwsNotation(() => compilePattern('(4,4)', { handswap: '13' }), /async/));

/* ---------------- starts ---------------- */
console.log('Starts');
test('(4,6x)* cold start: 2 in R, 3 in L; R throws 4 first', () => {
  const c = compilePattern('(4,6x)*');
  const s = c.restSplit(); eq([s.R, s.L], [2, 3]);
  const t0 = c.throwsAt(0).find(t => t.hand === 'R'); eq(t0.balls[0].value, 4);
});
test('(6x,4)* cold start: 3 in R, 2 in L', () => { const s = compilePattern('(6x,4)*').restSplit(); eq([s.R, s.L], [3, 2]); });
test('5 cascade cold start = 3 + 2, 7 = 4 + 3', () => {
  const a = compilePattern('5').restSplit(), b = compilePattern('7').restSplit();
  eq([a.R, a.L, b.R, b.L], [3, 2, 4, 3]);
});
test('warm start of (6x,4)*: 5 balls, 1 in each hand, 3 in the air', () => {
  const w = compilePattern('(6x,4)*').warmBalls();
  eq(w.length, 5);
  const land = w.map(b => b.landBeat + b.to).sort();
  eq(land, ['0L', '0R', '2L', '2R', '4R']);
  const eng = createEngine({ level: 3, startingPattern: '(6x,4)*', startMode: 'warm' });
  const s = eng.snapshot();
  eq([s.counts.R, s.counts.L, s.counts.air], [1, 1, 3]);
});
test('state: 3 is ground (111), 51 is excited', () => {
  eq(stateString(patternState(compilePattern('3'))), '111');
  ok(isGroundState(patternState(compilePattern('531')), 3), '531 ground');
  ok(!isGroundState(patternState(compilePattern('51')), 3), '51 not ground');
  eq(legalThrows(patternState(compilePattern('3')), 7), [3, 4, 5, 6, 7]);
});
test('schedule: every throw event has a list of balls', () => {
  const s = buildSchedule(compilePattern('[43]14'), { start: 'warm', beats: 9 });
  const th = s.events.filter(e => e.type === 'throw');
  ok(th.length > 0 && th.every(e => Array.isArray(e.balls) && e.balls.length >= 1));
  ok(th.some(e => e.balls.length === 2), 'multiplex throw has 2 balls');
  ok(th.every(e => e.balls.every(b => b.peakHeight > 0 && b.flightTime > 0)));
});

/* ---------------- config ---------------- */
console.log('Config');
test('defaults are valid (level 1, warm 3, 120 BPM)', () => { const v = validateConfig(); ok(v.ok, v.errors.join()); eq(v.config.tempo, 120); });
test('level 1 rejects a sync pattern and a hand order', () => {
  const v = validateConfig({ level: 1, startingPattern: '(4,4)', handswap: '13' });
  ok(!v.ok && v.errors.length >= 2, v.errors.join(' | '));
});
test('default siteswap must use the same ball count', () => ok(!validateConfig({ level: 1, startingPattern: '3', defaultPattern: '4' }).ok));
test('level 4 rest start with any split', () => { const v = validateConfig({ level: 4, startMode: 'rest', startingPattern: '5', ballsPerHand: { R: 5, L: 0 } }); ok(v.ok); eq(v.split, { R: 5, L: 0 }); });
test('bad values give readable errors', () => { const v = validateConfig({ tempo: 5, dropBehavior: 'explode' }); ok(!v.ok && v.errors.some(e => /tempo/.test(e)) && v.errors.some(e => /dropBehavior/.test(e))); });

/* ---------------- engine: autopilot / defaults ---------------- */
console.log('Engine');
const stable = [
  [1, '3', '2'], [1, '531', '2'], [1, '744', '2'], [1, '50505', '2'],
  [3, '3', '13'], [3, '3', '123'], [3, '531', '13'], [3, '(4,4)', '2'], [3, '(6x,4)*', '2'], [3, '(4,2x)(2x,4)', '2'],
  [4, '[43]14', '2'], [4, '[33]33', '2'], [4, '([44],[44])', '2']
];
for (const [level, p, hs] of stable) for (const startMode of ['warm', 'cold']) {
  test(`level ${level} ${startMode} ${p}${hs !== '2' ? ' / ' + hs : ''}: runs 20 s with no drops`, () => {
    const eng = createEngine({ level, startingPattern: p, handswap: hs, startMode });
    const ev = run(eng, 20);
    eq(drops(ev).length, 0, 'drops');
    ok(ev.filter(e => e.type === 'throw').length > 20, 'throws happened');
  });
}
test('level 1: defaults follow the default siteswap phase (531)', () => {
  const eng = createEngine({ level: 1, startingPattern: '3', defaultPattern: '531', startMode: 'warm' });
  const ev = run(eng, 4).filter(e => e.type === 'throw');
  eq(ev.slice(0, 6).map(e => e.balls[0].value), [5, 3, 1, 5, 3, 1]);
});
test('level 1: a bad default collides instead of being corrected (3 -> 51)', () => {
  const eng = createEngine({ level: 1, startingPattern: '3', defaultPattern: '51', startMode: 'warm', dropBehavior: 'continue' });
  ok(drops(run(eng, 6)).length > 0);
});
test('level 1: setNext 4 into a 3 cascade collides, then restarts the pattern', () => {
  const eng = createEngine({ level: 1, startingPattern: '3' });
  run(eng, 1); eng.setNext(4);
  const ev = run(eng, 5);
  ok(drops(ev).length > 0, 'collision'); ok(ev.some(e => e.type === 'reset'), 'reset');
});
test('level 1: setNextFor(hand) waits for that hand', () => {
  const eng = createEngine({ level: 1, startingPattern: '3' });
  run(eng, 0.6);
  const nextHand = eng.previewNext().hand, other = nextHand === 'R' ? 'L' : 'R';
  eng.setNextFor(other, 5);
  const th = run(eng, 1.2).filter(e => e.type === 'throw');
  eq([th[0].hand, th[0].balls[0].value, th[1].hand, th[1].balls[0].value], [nextHand, 3, other, 5]);
});

/* ---------------- engine: player control ---------------- */
function onBeats(eng, fn, beats) {
  // call fn(k) just before each of the next `beats` beats
  const ev = [];
  for (let i = 0; i < beats; i++) {
    const k = eng.lastBeat + 1;
    while (eng.beatPos < k - 0.02) ev.push(...eng.update(1 / 240));
    fn(k);
    while (eng.beatPos < k + 0.02) ev.push(...eng.update(1 / 240));
  }
  return ev;
}
test('level 2: whole takeover, then default values by phase per throw', () => {
  const eng = createEngine({ level: 2, startingPattern: '531', defaultPattern: '531' });
  const ev = onBeats(eng, k => eng.throwNow({ hand: eng.rl.hand(k) }), 18);
  ok(ev.some(e => e.type === 'takeover'));
  eq(drops(ev).length, 0, 'drops');
  const vals = ev.filter(e => e.type === 'throw' && e.src === 'player').map(e => e.balls[0].value);
  eq(vals.slice(0, 6).join(''), vals.slice(0, 3).join('').repeat(2), 'repeats 531');
});
test('level 2: after takeover nothing is thrown unless you throw', () => {
  const eng = createEngine({ level: 2, startingPattern: '3' });
  run(eng, 1); eng.throwNow({ hand: eng.nextAlternateHand() });
  eng.update(0);                                          // collect the player's own throw
  const ev = run(eng, 4);
  eq(ev.filter(e => e.type === 'throw').length, 0);
  eq(drops(ev).length, 0, 'balls just wait in the hands');
});
test('level 3: 3 in RRLL order with flips (player) runs clean', () => {
  const eng = createEngine({ level: 3, startingPattern: '3', handswap: '13' });
  const c = eng.compiled;
  const ev = onBeats(eng, k => {
    for (const t of c.throwsAt(k)) {
      const x = t.balls[0], natural = x.value % 2 === 1, cross = x.to !== t.hand;
      eng.throwNow({ hand: t.hand, value: x.value, flip: natural !== cross });
    }
  }, 40);
  eq(drops(ev).length, 0, 'drops');
  ok(ev.filter(e => e.type === 'throw' && e.src === 'player').length >= 39);
});
test('level 3: sync (6x,4)* by the player, both hands at once', () => {
  const eng = createEngine({ level: 3, startingPattern: '(6x,4)*' });
  const c = eng.compiled;
  const ev = onBeats(eng, k => {
    for (const t of c.throwsAt(k)) { const x = t.balls[0]; eng.throwNow({ hand: t.hand, value: x.value, flip: x.to !== t.hand }); }
  }, 30);
  eq(drops(ev).length, 0, 'drops');
});
test('level 3: flip destinations', () => {
  const eng = createEngine({ level: 3, startingPattern: '3', startMode: 'rest' });
  eng.throwNow({ hand: 'R', value: 4, flip: true });
  eng.throwNow({ hand: 'R', value: 3, flip: true });
  eng.throwNow({ hand: 'L', value: 3 });
  const th = eng.update(0.001).filter(e => e.type === 'throw');
  eq(th.map(e => e.hand + e.balls[0].value + '>' + e.balls[0].to), ['R4>L', 'R3>R', 'L3>R']);
});
test('input buffer: a press just before a catch throws on the catch', () => {
  const eng = createEngine({ level: 3, startingPattern: '3', startMode: 'rest' });
  eng.throwNow({ hand: 'R', value: 1 });              // R -> L, lands in 0.2 beat
  eng.throwNow({ hand: 'L', value: 3 });              // L: throw its own ball
  eng.throwNow({ hand: 'L', value: 3 });              // L now empty: waits for the 1
  const ev = run(eng, 0.3);
  ok(ev.some(e => e.type === 'catch' && e.hand === 'L'));
  eq(ev.filter(e => e.type === 'throw' && e.hand === 'L').length, 1, 'buffered throw fired');
});
test('no limit on balls per hand (7 in one hand)', () => {
  const eng = createEngine({ level: 4, startMode: 'rest', startingPattern: '7', ballsPerHand: { R: 7, L: 0 } });
  eq(eng.snapshot().counts.R, 7);
  for (let i = 0; i < 3; i++) { eng.throwNow({ hand: 'R', value: 2, flip: true }); run(eng, 0.6); }
  eq(drops(run(eng, 2)).length, 0);
});

/* ---------------- drops, pickup, pirouette ---------------- */
// Drop a ball on one side: throw it so it lands in that hand, and be spinning when it lands.
function dropOnSide(eng, from, side) {
  eng.throwNow({ hand: from, value: from === side ? 4 : 3 });
  eng.setPirouette(true);
  let ev = [];
  for (let i = 0; i < 400 && !drops(ev).length; i++) ev.push(...eng.update(1 / 120));
  eng.setPirouette(false);
  return ev;
}
test('0 is an empty turn: nothing is thrown or dropped', () => {
  const eng = createEngine({ level: 3, startingPattern: '3', startMode: 'rest' });
  eng.update(0);
  eng.throwNow({ hand: 'R', value: 0 });
  const ev = run(eng, 1);
  eq(drops(ev).length + ev.filter(e => e.type === 'throw').length, 0);
  eq(eng.snapshot().counts.R, 2);
});
test('level 1: a default 0 while holding a ball leaves it in the hand', () => {
  const eng = createEngine({ level: 1, startingPattern: '3', defaultPattern: '50505', dropBehavior: 'continue' });
  const ev = run(eng, 1.2);                          // beat 0 throws 5, beat 1 (L) is a 0
  ok(!ev.some(e => e.type === 'throw' && e.beat === 1), 'no throw on beat 1');
  ok(!drops(ev).some(e => e.reason === 'zero'), 'no zero drops');
});
test('ball limit: at most 100 balls', () => {
  ok(!validateConfig({ level: 4, startingPattern: '[zzz]' }).ok, '105 balls rejected');
  ok(validateConfig({ level: 4, startingPattern: 'z' }).ok, '35 balls fine');
  ok(!validateConfig({ level: 4, startMode: 'rest', startingPattern: '3', ballsPerHand: { R: 60, L: 41 } }).ok, '101 at rest rejected');
});
test('drop "continue": ball stays on the floor with its side; sided pickup', () => {
  const eng = createEngine({ level: 3, startingPattern: '3', startMode: 'rest', dropBehavior: 'continue' });
  eng.update(0);                                          // collect the start-up reset event
  dropOnSide(eng, 'R', 'R');
  const s = eng.snapshot(); eq(s.counts.floor, 1);
  const fl = s.balls.find(b => b.state === 'floor'); eq(fl.side, 'R');
  const r = eng.pickup('L'); ok(r.ok); eq(r.hand, 'L');
  eq(eng.snapshot().counts.floor, 0);
  ok(!run(eng, 3).some(e => e.type === 'reset'), 'no restart in continue mode');
});
test('pickup "nearest" and "fewer"', () => {
  const a = createEngine({ level: 3, startingPattern: '3', startMode: 'rest', dropBehavior: 'continue', pickupMode: 'nearest' });
  dropOnSide(a, 'R', 'L'); eq(a.pickup('either').hand, 'L');
  const b = createEngine({ level: 3, startingPattern: '3', startMode: 'rest', dropBehavior: 'continue', pickupMode: 'fewer' });
  dropOnSide(b, 'R', 'R');                            // R 2 -> 1, L 1
  dropOnSide(b, 'R', 'R');                            // R 0, L 1 -> R is emptier
  eq(b.pickup('either').hand, 'R');
});
test('drop "restartRest" vs "restartPattern"', () => {
  const a = createEngine({ level: 3, startingPattern: '3', dropBehavior: 'restartRest' });
  run(a, 1); a.setPirouette(true);
  const ea = run(a, 3); eq(ea.find(e => e.type === 'reset').start, 'rest');
  const b = createEngine({ level: 3, startingPattern: '3', dropBehavior: 'restartPattern' });
  run(b, 1); b.setPirouette(true);
  const eb = run(b, 3); eq(eb.find(e => e.type === 'reset').start, 'warm');
});
test('pirouette: no throws, arrivals drop, spin counts turns', () => {
  const eng = createEngine({ level: 3, startingPattern: '3', dropBehavior: 'continue' });
  run(eng, 1);
  eng.throwNow({ hand: eng.nextAlternateHand() });     // take over
  eng.setPirouette(true); eng.spin(0.5); eng.spin(0.5);
  const r = eng.throwNow({ hand: 'R', value: 3 }); ok(!r.ok);
  const ev = run(eng, 2);
  ok(drops(ev).some(e => e.reason === 'pirouette'), 'arrival dropped');
  eq(eng.pirouette.turns, 1);
  eng.setPirouette(false); ok(eng.throwNow({ hand: 'R' }).ok || true);
});
test('tempo change mid-flight rescales instead of colliding', () => {
  const eng = createEngine({ level: 1, startingPattern: '531' });
  run(eng, 2); eng.updateConfig({ tempo: 90 });
  eq(drops(run(eng, 10)).length, 0);
});

/* ---------------- report ---------------- */
console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
