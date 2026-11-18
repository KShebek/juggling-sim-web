// Default key and button bindings, saved in the browser, with reset.
// Keyboard bindings use KeyboardEvent.code. Gamepad bindings use the browser's
// standard-mapping button index (Switch Pro names shown in the UI).

const STORE = 'juggling.bindings.v1';

/** Throw values the player can choose (no 0: a 0 in a pattern is just an empty hand). */
export const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Actions, in display order. `min` = lowest level where it does anything.
 * `keyOnly` = no controller binding; `scheme` = controller scheme the button row belongs to
 * ('dial' or 'buttons'); rows without a scheme exist in both controller maps.
 */
export const ACTIONS = [
  { id: 'pause', label: 'Pause', group: 'General', min: 1 },
  { id: 'reset', label: 'Reset', group: 'General', min: 1 },
  { id: 'ballsDown', label: 'Fewer balls', group: 'General', min: 1, keyOnly: true },
  { id: 'ballsUp', label: 'More balls', group: 'General', min: 1, keyOnly: true },
  { id: 'throwL', label: 'Throw left (aimed or default value)', group: 'Throwing', min: 2, scheme: 'dial' },
  { id: 'throwR', label: 'Throw right (aimed or default value)', group: 'Throwing', min: 2, scheme: 'dial' },
  { id: 'flipL', label: 'Flip left (hold)', group: 'Throwing', min: 3 },
  { id: 'flipR', label: 'Flip right (hold)', group: 'Throwing', min: 3 },
  { id: 'pickupL', label: 'Pick up, left hand', group: 'Floor & spin', min: 1 },
  { id: 'pickupR', label: 'Pick up, right hand', group: 'Floor & spin', min: 1 },
  { id: 'pirouette', label: 'Pirouette (hold)', group: 'Floor & spin', min: 1 },
  ...['L', 'R'].flatMap(h => ['down', 'in', 'out', 'up'].map(d => ({
    id: `b${h}_${d}`, label: `${h === 'L' ? 'Left' : 'Right'} hand: ${d} (low ${{ down: 1, in: 3, out: 4, up: 5 }[d]} / high ${{ down: 6, in: 7, out: 8, up: 9 }[d]})`,
    group: 'Buttons scheme', min: 1, padOnly: true, scheme: 'buttons' }))),
  { id: 'shiftL', label: 'Left hand: high bank (hold)', group: 'Buttons scheme', min: 1, padOnly: true, scheme: 'buttons' },
  { id: 'shiftR', label: 'Right hand: high bank (hold)', group: 'Buttons scheme', min: 1, padOnly: true, scheme: 'buttons' },
  ...VALUES.map(v => ({ id: 'L' + v, label: `Left hand ${v}`, group: 'Left hand values', min: 1, keyOnly: true })),
  ...VALUES.map(v => ({ id: 'R' + v, label: `Right hand ${v}`, group: 'Right hand values', min: 1, keyOnly: true })),
  ...VALUES.map(v => ({ id: 'N' + v, label: `Next hand ${v} (alternating)`, group: 'Number keys', min: 1, keyOnly: true }))
];

export const DEFAULT_BINDINGS = Object.freeze({
  keys: {
    pause: ['Space'], reset: ['Backspace'], ballsDown: ['Minus', 'NumpadSubtract'], ballsUp: ['Equal', 'NumpadAdd'],
    throwL: ['KeyV'], throwR: ['KeyN'], flipL: ['ShiftLeft'], flipR: ['ShiftRight'],
    pickupL: ['KeyC'], pickupR: ['KeyM'], pirouette: ['KeyB'],
    L1: ['KeyA'], L2: ['KeyS'], L3: ['KeyD'], L4: ['KeyF'], L5: ['KeyQ'], L6: ['KeyW'], L7: ['KeyE'], L8: ['KeyR'], L9: ['KeyT'],
    R1: ['Semicolon'], R2: ['KeyL'], R3: ['KeyK'], R4: ['KeyJ'], R5: ['KeyP'], R6: ['KeyO'], R7: ['KeyI'], R8: ['KeyU'], R9: ['KeyY'],
    N1: ['Digit1', 'Numpad1'], N2: ['Digit2', 'Numpad2'], N3: ['Digit3', 'Numpad3'], N4: ['Digit4', 'Numpad4'], N5: ['Digit5', 'Numpad5'],
    N6: ['Digit6', 'Numpad6'], N7: ['Digit7', 'Numpad7'], N8: ['Digit8', 'Numpad8'], N9: ['Digit9', 'Numpad9']
  },
  // Standard mapping: 0 bottom (Switch B), 1 right (A), 4 L, 5 R, 6 ZL, 7 ZR, 8 −, 9 +, 14 D-pad left
  pad: { throwL: 4, throwR: 5, flipL: 6, flipR: 7, pickupL: 14, pickupR: 1, pirouette: 0, pause: 9, reset: 8 },
  // Buttons scheme: D-pad = left hand (in = right), face buttons = right hand (in = Y, left);
  // 12 up, 13 down, 14 left, 15 right; 0 B, 1 A, 2 Y, 3 X; 10/11 stick clicks.
  // pause and reset share + : tap = pause, hold = reset.
  padB: {
    bL_down: 13, bL_in: 15, bL_out: 14, bL_up: 12,
    bR_down: 0, bR_in: 2, bR_out: 1, bR_up: 3,
    shiftL: 4, shiftR: 5, flipL: 6, flipR: 7, pickupL: 10, pickupR: 11, pirouette: 8, pause: 9, reset: 9
  }
});

const clone = o => JSON.parse(JSON.stringify(o));

export function loadBindings() {
  const b = clone(DEFAULT_BINDINGS);
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    // keep only actions that still exist (e.g. old 0 keys are dropped)
    if (saved && saved.keys) for (const [a, codes] of Object.entries(saved.keys)) if (a in b.keys) b.keys[a] = codes;
    if (saved && saved.pad) for (const [a, i] of Object.entries(saved.pad)) if (a in b.pad) b.pad[a] = i;
    if (saved && saved.padB) for (const [a, i] of Object.entries(saved.padB)) if (a in b.padB) b.padB[a] = i;
  } catch (e) { /* storage unavailable or corrupt: use defaults */ }
  return b;
}
export function saveBindings(b) { try { localStorage.setItem(STORE, JSON.stringify(b)); } catch (e) { /* ignore */ } }
export function defaultBindings() { return clone(DEFAULT_BINDINGS); }

/** Bind one key to an action (replaces its keys) and unbind that key elsewhere. */
export function bindKey(b, action, code) {
  for (const [a, codes] of Object.entries(b.keys)) b.keys[a] = codes.filter(c => c !== code);
  b.keys[action] = [code];
}
/**
 * Bind one gamepad button to an action in a controller map ('pad' = dial scheme,
 * 'padB' = buttons scheme) and unbind it elsewhere in that map. Pause and reset may share
 * a button (tap = pause, hold = reset).
 */
export function bindButton(b, action, index, mapName = 'pad') {
  const m = b[mapName];
  const pair = new Set(['pause', 'reset']);
  for (const a of Object.keys(m)) if (m[a] === index && !(pair.has(a) && pair.has(action))) m[a] = null;
  m[action] = index;
}

const KEY_NAMES = {
  Space: 'Space', Backspace: '⌫', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', Minus: '-', Equal: '=', Slash: '/', Semicolon: ';', Comma: ',', Period: '.',
  Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`', Enter: 'Enter', Tab: 'Tab',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', NumpadSubtract: 'Num -', NumpadAdd: 'Num +'
};
export function keyName(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
const PAD_NAMES = ['B (bottom)', 'A (right)', 'Y (left)', 'X (top)', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L-stick click', 'R-stick click',
  'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];
export const padName = i => (i == null ? '—' : PAD_NAMES[i] || 'Button ' + i);
