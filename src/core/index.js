// Public entry point for the core engine.
export { R, L, otherHand, NotationError, parsePattern, parseHandswap, valueOf, formatValue } from './notation.js';
export { handSequence, handString } from './handorder.js';
export { compilePattern, lcm } from './compile.js';
export { beatSeconds, flightTime, peakHeight, isHold } from './timing.js';
export { GEOM, throwPoint, catchPoint, flightPosition } from './geometry.js';
export { patternState, stateFromLandings, stateString, isGroundState, legalThrows } from './state.js';
export { buildSchedule } from './schedule.js';
export { DEFAULT_CONFIG, LEVELS, MAX_BALLS, MAX_THROW, validateConfig } from './config.js';
export { createEngine, Engine, ConfigError } from './engine.js';
