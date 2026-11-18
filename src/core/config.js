// Session config: one object drives everything. validateConfig() fills in
// defaults, checks values and compiles the patterns.

import { compilePattern } from './compile.js';
import { NotationError } from './notation.js';

/** Most balls a session may use (patterns or a rest split). */
export const MAX_BALLS = 100;
/** Highest throw value the player can choose (patterns may use letters a–z). */
export const MAX_THROW = 9;

export const LEVELS = {
  1: 'On-beat: RLRL, you pick values, defaults fill the beat',
  2: 'Timing: RLRL, you throw, default values fill in',
  3: 'Hand order: choose hands and flip, no defaults',
  4: 'Advanced: nothing set, any ball split'
};

export const DEFAULT_CONFIG = Object.freeze({
  mode: 'free',              // 'free' (game mode later)
  level: 1,                  // 1-4, see LEVELS
  startMode: 'warm',         // 'rest' | 'cold' | 'warm'
  startingPattern: '3',
  handswap: '2',             // async only; levels 1-2 force '2'
  startingHand: 'R',
  defaultPattern: null,      // levels 1-2; null = startingPattern
  ballsPerHand: null,        // level 4 + rest start: { R, L }; otherwise from the pattern
  dropBehavior: 'restartPattern', // 'restartPattern' | 'restartRest' | 'continue'
  pickupMode: 'sided',       // 'sided' | 'nearest' | 'fewer'
  tempo: 120,                // beats (throws) per minute
  dwell: 0.6,                // beats a ball sits in the hand
  gravity: 9.81,             // m/s²
  timeScale: 1,              // slow motion < 1
  midairCollisions: false,
  swapThrowFlip: false,      // gamepad: throw on triggers, flip on bumpers
  catchGapBeats: 0.35,       // two arrivals at one hand closer than this collide
  inputBuffer: 0.15,         // s a press waits for a ball about to land
  restartDelay: 1.6,         // s after a drop before a restart
  bindings: null             // input layer's bindings; null = its defaults
});

const ENUMS = {
  mode: ['free'],
  startMode: ['rest', 'cold', 'warm'],
  startingHand: ['R', 'L'],
  dropBehavior: ['restartPattern', 'restartRest', 'continue'],
  pickupMode: ['sided', 'nearest', 'fewer']
};
const RANGES = {
  level: [1, 4], tempo: [30, 400], dwell: [0.1, 0.95], gravity: [0.5, 50], timeScale: [0.05, 4],
  catchGapBeats: [0, 1], inputBuffer: [0, 1], restartDelay: [0, 10]
};

/**
 * validateConfig(partial) -> { ok, errors: [string], config, compiled, defaultCompiled, split }
 * - compiled: the starting pattern (with hand order and starting hand)
 * - defaultCompiled: levels 1-2 default siteswap (RLRL), else null
 * - split: balls in each hand at rest { R, L }
 */
export function validateConfig(partial = {}) {
  const config = { ...DEFAULT_CONFIG, ...partial };
  const errors = [];
  for (const [k, list] of Object.entries(ENUMS)) {
    if (!list.includes(config[k])) errors.push(`${k} must be one of ${list.join(', ')} (got ${JSON.stringify(config[k])}).`);
  }
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (typeof config[k] !== 'number' || !(config[k] >= lo && config[k] <= hi)) errors.push(`${k} must be a number from ${lo} to ${hi}.`);
  }
  if (!Number.isInteger(config.level)) errors.push('level must be 1, 2, 3 or 4.');
  for (const k of ['midairCollisions', 'swapThrowFlip']) if (typeof config[k] !== 'boolean') errors.push(`${k} must be true or false.`);

  let compiled = null, defaultCompiled = null, split = null;
  const simple = config.level <= 2;
  if (simple && String(config.handswap).trim() !== '2') errors.push(`Level ${config.level} uses plain RLRL, so the hand order must be 2.`);
  try {
    compiled = compilePattern(config.startingPattern, { handswap: simple ? '2' : config.handswap, startingHand: config.startingHand });
    if (simple && compiled.type !== 'async') errors.push(`Level ${config.level} is RLRL, so the starting pattern must be async (sync patterns start at level 3).`);
    if (config.level < 4 && compiled.multiplex) errors.push('Multiplex patterns are level 4 only (and have no controls yet).');
  } catch (e) {
    if (e instanceof NotationError) errors.push('Starting pattern: ' + e.message); else throw e;
  }
  if (compiled && compiled.balls > MAX_BALLS) errors.push(`That pattern needs ${compiled.balls} balls; the limit is ${MAX_BALLS}.`);
  if (simple) {
    try {
      defaultCompiled = compilePattern(config.defaultPattern ?? config.startingPattern, { handswap: '2', startingHand: config.startingHand });
      if (defaultCompiled.type !== 'async' || defaultCompiled.multiplex) errors.push('The default siteswap must be a plain async pattern.');
      else if (compiled && defaultCompiled.balls !== compiled.balls) {
        errors.push(`The default siteswap uses ${defaultCompiled.balls} balls but the starting pattern uses ${compiled.balls}.`);
      }
    } catch (e) {
      if (e instanceof NotationError) errors.push('Default siteswap: ' + e.message); else throw e;
    }
  }
  if (config.level === 4 && config.startMode === 'rest' && config.ballsPerHand) {
    const { R = 0, L = 0 } = config.ballsPerHand;
    if (!Number.isInteger(R) || !Number.isInteger(L) || R < 0 || L < 0 || R + L < 1) errors.push('ballsPerHand needs whole numbers ≥ 0 with at least 1 ball in total.');
    else if (R + L > MAX_BALLS) errors.push(`At most ${MAX_BALLS} balls (got ${R + L}).`);
    else split = { R, L };
  }
  if (!split && compiled) { try { const s = compiled.restSplit(); split = { R: s.R, L: s.L }; } catch (e) { errors.push(e.message); } }
  return { ok: errors.length === 0, errors, config, compiled, defaultCompiled, split };
}
