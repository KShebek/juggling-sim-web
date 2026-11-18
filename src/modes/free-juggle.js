// Free Juggle: the app screen. Builds the engine from the settings panel,
// runs the frame loop, and wires input and drawing together.

import { createEngine, validateConfig, DEFAULT_CONFIG, LEVELS } from '../core/index.js';
import { loadBindings, saveBindings, defaultBindings, bindKey, bindButton, keyName, padName, ACTIONS, VALUES } from '../input/bindings.js';
import { Keyboard } from '../input/keyboard.js';
import { Gamepad } from '../input/gamepad.js';
import { InputRouter } from '../input/router.js';
import { Renderer } from '../render/renderer.js';

const $ = s => document.querySelector(s);
const PREFS = 'juggling.session.v1';

/* ---------------- state ---------------- */
const saved = (() => { try { return JSON.parse(localStorage.getItem(PREFS) || 'null') || {}; } catch (e) { return {}; } })();
let cfg = { ...DEFAULT_CONFIG, ...(saved.cfg || {}) };
const ui = { showLadder: true, beatGuide: false, metronome: false, showHud: true, autoZoom: true, viewHeight: 7, previewMode: 'always', padScheme: 'dial', showDials: true, rumble: true, ...(saved.ui || {}) };
let bindings = loadBindings();
let engine = null, paused = false;

const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify({ cfg: { ...cfg, bindings: null }, ui })); } catch (e) { /* ignore */ } };

const keyboard = new Keyboard(() => bindings);
const gamepad = new Gamepad(() => bindings, () => cfg.swapThrowFlip, () => ui.padScheme);
gamepad.rumbleOn = ui.rumble;
const renderer = new Renderer($('#cv'));
const app = {
  engine: () => engine,
  isPaused: () => paused,
  now: () => performance.now() / 1000,
  pause: () => togglePause(),
  reset: () => { if (engine) { engine.reset('start'); renderer.flash('Reset', '#5ad19a'); } },
  changeBalls: delta => changeBalls(delta)
};
const router = new InputRouter(app, keyboard, gamepad);
window.__juggle = { engine: () => engine, renderer, gamepad };   // handy for debugging in the console

/* ---------------- audio (metronome) ---------------- */
const audio = {
  ctx: null,
  unlock() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  click(high) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = high ? 1500 : 1000;
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + 0.06);
  }
};
window.addEventListener('keydown', () => audio.unlock());
window.addEventListener('pointerdown', () => audio.unlock());

/* ---------------- engine (re)build ---------------- */
function formConfig() {
  const level = cfg.level;
  const c = {
    ...cfg,
    startingPattern: $('#fPattern').value.trim() || '3',
    handswap: level >= 3 ? ($('#fHandswap').value.trim() || '2') : '2',
    defaultPattern: level <= 2 && $('#fDefault').value.trim() ? $('#fDefault').value.trim() : null,
    startingHand: $('#fHand').value,
    startMode: $('#fStart').value,
    ballsPerHand: level === 4 && $('#fStart').value === 'rest'
      ? { R: parseInt($('#fSplitR').value, 10) || 0, L: parseInt($('#fSplitL').value, 10) || 0 } : null
  };
  return c;
}
function info(ok, text) { const el = $('#patInfo'); el.className = ok ? 'ok' : 'err'; el.textContent = text; }

function apply() {
  const c = formConfig();
  const v = validateConfig(c);
  if (!v.ok) { info(false, v.errors.join('\n')); return false; }
  cfg = v.config;
  engine = createEngine(cfg);
  renderer.clear();
  const p = engine.compiled;
  const split = engine.split;
  info(true, `✓ ${p.balls} ball${p.balls === 1 ? '' : 's'} · ${p.type}${p.multiplex ? ' multiplex' : ''} · period ${p.notationPeriod}${p.cycle !== p.notationPeriod ? ' (hands repeat every ' + p.cycle + ')' : ''} · rest split R ${split.R} / L ${split.L}`);
  savePrefs();
  syncForm();
  return true;
}

function changeBalls(delta) {
  const cur = /^\d$/.test(cfg.startingPattern) ? +cfg.startingPattern : (engine ? engine.compiled.balls : 3);
  const n = Math.max(1, Math.min(9, cur + delta));
  $('#fPattern').value = String(n); $('#fHandswap').value = '2'; $('#fDefault').value = '';
  if (cfg.level === 4) { $('#fSplitR').value = Math.ceil(n / 2); $('#fSplitL').value = Math.floor(n / 2); }
  apply();
}

function togglePause() {
  paused = !paused;
  $('#bPause').textContent = paused ? 'Resume' : 'Pause';
}

/* ---------------- panel ---------------- */
const LEVEL_TITLES = { 1: 'On-beat', 2: 'Timing', 3: 'Hand order', 4: 'Advanced' };
const PRESETS = {
  1: ['3', '4', '5', '531', '441', '423', '50505', '744'],
  2: ['3', '4', '5', '531', '441', '423', '51', '744'],
  3: ['3', '531', '3|13', '3|123', '531|13', '(4,4)', '(4,2x)*', '(6x,4)*', '(4,6x)*', '(4x,4x)'],
  4: ['3', '(6x,4)*', '3|13', '[43]14', '[33]33', '([44],[44])', '(4,2x)*', '744']
};

function renderLevels() {
  $('#levels').innerHTML = [1, 2, 3, 4].map(l =>
    `<button data-l="${l}" class="${cfg.level === l ? 'on' : ''}"><b>${l} · ${LEVEL_TITLES[l]}</b><span>${LEVELS[l]}</span></button>`).join('');
}
$('#levels').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const l = +b.dataset.l; if (l === cfg.level) return;
  cfg.level = l;
  // patterns that don't fit the new level fall back to a cascade
  const v = validateConfig(formConfig());
  if (!v.ok && l <= 2) { $('#fPattern').value = '3'; $('#fHandswap').value = '2'; }
  syncForm(); apply(); b.blur();
});

function syncForm() {
  renderLevels();
  const l = cfg.level;
  $('#rowHandswap').classList.toggle('hide', l < 3);
  $('#rowDefault').classList.toggle('hide', l > 2);
  $('#rowSplit').classList.toggle('hide', !(l === 4 && $('#fStart').value === 'rest'));
  $('#rowSwap').classList.toggle('hide', l < 3 || ui.padScheme === 'buttons');
  $('#presets').innerHTML = PRESETS[l].map(p => { const [pat, hs] = p.split('|'); return `<button data-p="${pat}" data-h="${hs || '2'}">${pat}${hs ? ' · ' + hs : ''}</button>`; }).join('');
  renderControls();
}
$('#presets').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $('#fPattern').value = b.dataset.p; $('#fHandswap').value = b.dataset.h; $('#fDefault').value = '';
  if (cfg.level === 4) {
    try { const v = validateConfig({ ...formConfig(), ballsPerHand: null, startMode: 'cold' }); if (v.ok) { $('#fSplitR').value = v.split.R; $('#fSplitL').value = v.split.L; } } catch (err) { /* ignore */ }
  }
  apply(); b.blur();
});
$('#bApply').onclick = () => { apply(); $('#bApply').blur(); };
for (const id of ['#fPattern', '#fHandswap', '#fDefault', '#fSplitR', '#fSplitL']) {
  $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { apply(); e.target.blur(); } if (e.key === 'Escape') e.target.blur(); });
}
for (const id of ['#fHand', '#fStart', '#fDrop', '#fPickup']) {
  $(id).addEventListener('change', e => {
    if (id === '#fDrop') cfg.dropBehavior = e.target.value;
    if (id === '#fPickup') cfg.pickupMode = e.target.value;
    if (id === '#fStart') syncForm();
    if (id === '#fDrop' || id === '#fPickup') { if (engine) engine.updateConfig({ dropBehavior: cfg.dropBehavior, pickupMode: cfg.pickupMode }); savePrefs(); }
    else apply();
    e.target.blur();
  });
}
$('#fScheme').value = ui.padScheme;
$('#fScheme').addEventListener('change', e => { ui.padScheme = e.target.value; savePrefs(); syncForm(); e.target.blur(); });
$('#bPause').onclick = () => { togglePause(); $('#bPause').blur(); };
$('#bReset').onclick = () => { app.reset(); $('#bReset').blur(); };

function slider(id, vid, key, fmt) {
  const el = $(id), out = $(vid);
  el.value = cfg[key]; out.textContent = fmt(cfg[key]);
  el.addEventListener('input', () => {
    cfg[key] = parseFloat(el.value); out.textContent = fmt(cfg[key]);
    if (engine) engine.updateConfig({ [key]: cfg[key] });
    savePrefs();
  });
  el.addEventListener('change', () => el.blur());
}
slider('#sTempo', '#vTempo', 'tempo', v => Math.round(v) + ' bpm');
slider('#sDwell', '#vDwell', 'dwell', v => v.toFixed(2));
slider('#sGrav', '#vGrav', 'gravity', v => v.toFixed(1));
slider('#sSlow', '#vSlow', 'timeScale', v => v.toFixed(2) + '×');

function check(id, get, set) {
  const el = $(id); el.checked = get();
  el.addEventListener('change', () => { set(el.checked); savePrefs(); el.blur(); });
}
check('#cLadder', () => ui.showLadder, v => { ui.showLadder = v; });
check('#cBeat', () => ui.beatGuide, v => { ui.beatGuide = v; });
check('#cMetro', () => ui.metronome, v => { ui.metronome = v; audio.unlock(); });
check('#cHud', () => ui.showHud, v => { ui.showHud = v; });
$('#fArcs').value = ui.previewMode;
$('#fArcs').addEventListener('change', e => { ui.previewMode = e.target.value; savePrefs(); e.target.blur(); });
check('#cZoom', () => ui.autoZoom, v => { ui.autoZoom = v; syncView(); });
function syncView() { $('#rowView').classList.toggle('off', ui.autoZoom); $('#vView').textContent = ui.autoZoom ? 'auto' : String(ui.viewHeight); }
$('#sView').value = ui.viewHeight;
$('#sView').addEventListener('input', () => {
  ui.viewHeight = parseInt($('#sView').value, 10);
  if (ui.autoZoom) { ui.autoZoom = false; $('#cZoom').checked = false; }   // moving the slider means "fixed view"
  syncView(); savePrefs();
});
$('#sView').addEventListener('change', () => $('#sView').blur());
syncView();
check('#cDials', () => ui.showDials, v => { ui.showDials = v; });
check('#cRumble', () => ui.rumble, v => { ui.rumble = v; gamepad.rumbleOn = v; });
check('#cMid', () => cfg.midairCollisions, v => { cfg.midairCollisions = v; if (engine) engine.updateConfig({ midairCollisions: v }); });
check('#cSwap', () => cfg.swapThrowFlip, v => { cfg.swapThrowFlip = v; if (engine) engine.updateConfig({ swapThrowFlip: v }); renderControls(); });

/* ---------------- controls list + bindings editor ---------------- */
const K = a => (bindings.keys[a] || []).map(keyName).join(' / ') || '—';
const padMapName = () => (ui.padScheme === 'buttons' ? 'padB' : 'pad');
const P = a => {
  if (ui.padScheme === 'buttons') return padName(bindings.padB[a]);
  let i = bindings.pad[a];
  if (cfg.swapThrowFlip) { const m = { throwL: 'flipL', throwR: 'flipR', flipL: 'throwL', flipR: 'throwR' }; if (m[a]) i = bindings.pad[m[a]]; }
  return padName(i);
};
const vals = h => VALUES.map(v => keyName((bindings.keys[h + v] || [])[0])).join(' ');

function renderControls() {
  const l = cfg.level;
  const rows = [];
  const btn = ui.padScheme === 'buttons';
  const bank = h => `${P(`b${h}_down`)} / ${P(`b${h}_in`)} / ${P(`b${h}_out`)} / ${P(`b${h}_up`)}`;
  if (l === 1) {
    rows.push(['Number keys', 'choose the next beat\'s value (whichever hand)']);
    rows.push(['Left keys', vals('L') + '  = 1–9 · that hand\'s next value']);
    rows.push(['Right keys', vals('R') + '  = 1–9']);
    if (!btn) rows.push(['L / R stick', 'point a direction: that hand\'s next value (dial)']);
  } else {
    rows.push(['Left keys', vals('L') + '  = throw 1–9 now']);
    rows.push(['Right keys', vals('R') + '  = throw 1–9 now']);
    rows.push(['Number keys', 'throw now, hands alternate']);
    rows.push([K('throwL') + ' / ' + K('throwR'), l === 2 ? 'throw the default value (left / right)' : 'throw the ball count (left / right)']);
    if (!btn) {
      rows.push(['L / R stick', 'aim that hand (dial); centred = ' + (l === 2 ? 'default value' : 'ball count')]);
      rows.push([P('throwL') + ' / ' + P('throwR'), 'throw now (left / right)']);
    }
  }
  if (btn) {
    rows.push(['Left: ' + bank('L'), 'down / in / out / up = 1 3 4 5' + (l === 1 ? ' (next value)' : ' (throws now)')]);
    rows.push(['Right: ' + bank('R'), 'down / in / out / up = 1 3 4 5']);
    rows.push([P('shiftL') + ' / ' + P('shiftR'), 'hold: high bank for that hand = 6 7 8 9']);
  }
  if (l >= 3) {
    rows.push([K('flipL') + ' / ' + K('flipR'), 'hold: flip that hand (keyboard)']);
    rows.push([P('flipL') + ' / ' + P('flipR'), 'hold: flip that hand (gamepad)']);
  }
  rows.push([K('pickupL') + ' / ' + K('pickupR'), 'pick up: left / right hand' + (cfg.pickupMode === 'sided' ? '' : ' (either works)')]);
  rows.push([P('pickupL') + ' / ' + P('pickupR'), 'pick up (gamepad)']);
  rows.push([K('pirouette') + ' · ' + P('pirouette'), 'hold: pirouette (circle the left stick to spin)']);
  const shared = btn && bindings.padB.pause === bindings.padB.reset;
  rows.push([K('pause') + ' · ' + P('pause'), shared ? 'pause (controller: tap)' : 'pause']);
  rows.push([K('reset') + ' · ' + P('reset'), shared ? 'reset (controller: hold ~1 s)' : 'reset']);
  rows.push([K('ballsDown') + ' / ' + K('ballsUp'), 'fewer / more balls']);
  $('#controls').innerHTML = '<table class="keys">' + rows.map(([k, d]) => `<tr><td>${esc(k)}</td><td>${esc(d)}</td></tr>`).join('') + '</table>';
  if (!$('#bindEditor').classList.contains('hide')) renderBindTable();
}
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

let waiting = null;
function renderBindTable() {
  let html = '<table>', group = '';
  for (const a of ACTIONS) {
    if (a.scheme && a.scheme !== ui.padScheme) continue;
    if (a.group !== group) { group = a.group; html += `<tr><th colspan="3">${esc(group)}</th></tr>`; }
    const kw = waiting && waiting.action === a.id && waiting.kind === 'key';
    const pw = waiting && waiting.action === a.id && waiting.kind === 'pad';
    html += `<tr><td>${esc(a.label)}</td>` +
      `<td class="k">${a.padOnly ? '' : `<button data-a="${a.id}" data-kind="key" class="${kw ? 'wait' : ''}">${kw ? 'press…' : esc(K(a.id))}</button>`}</td>` +
      `<td class="k">${a.keyOnly ? '' : `<button data-a="${a.id}" data-kind="pad" class="${pw ? 'wait' : ''}">${pw ? 'press…' : esc(padName(bindings[padMapName()][a.id]))}</button>`}</td></tr>`;
  }
  $('#bindTable').innerHTML = html + '</table>';
}
$('#bBind').onclick = () => {
  const ed = $('#bindEditor'); ed.classList.toggle('hide');
  $('#bBind').textContent = ed.classList.contains('hide') ? 'Edit keys & buttons' : 'Done editing';
  if (!ed.classList.contains('hide')) renderBindTable();
  $('#bBind').blur();
};
$('#bBindReset').onclick = () => { bindings = defaultBindings(); saveBindings(bindings); renderControls(); $('#bBindReset').blur(); };
$('#bindTable').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  b.blur();
  waiting = { action: b.dataset.a, kind: b.dataset.kind };
  renderBindTable();
  const done = () => { waiting = null; saveBindings(bindings); renderControls(); };
  if (waiting.kind === 'key') keyboard.captureNext(code => { if (code) bindKey(bindings, b.dataset.a, code); done(); });
  else gamepad.captureNext(i => { bindButton(bindings, b.dataset.a, i, padMapName()); done(); });
});

/* ---------------- status box ---------------- */
let lastBox = '';
function updateBox() {
  if (!engine) return;
  const s = engine.snapshot();
  const mode = engine.level === 1 ? '<b style="color:var(--ok)">On-beat</b>'
    : s.mode === 'auto' ? '<b style="color:var(--ok)">Autopilot</b> <span style="color:var(--dim)">· make any throw to take over</span>'
    : '<b style="color:var(--acc)">You\'re juggling</b>';
  const pat = `<span style="font-family:ui-monospace,Consolas,monospace">${esc(engine.compiled.text)}${engine.compiled.handswap !== '2' ? ' · ' + engine.compiled.handswap : ''}</span>`;
  const html = `${mode} · ${pat}<br><span style="color:var(--dim)">in hands R ${s.counts.R} / L ${s.counts.L} · in air ${s.counts.air}${s.counts.floor ? ' · on floor ' + s.counts.floor : ''}${paused ? ' · paused' : ''}</span>`;
  if (html !== lastBox) { lastBox = html; $('#modeBox').innerHTML = html; }
  const ps = gamepad.connected ? 'Gamepad: ' + gamepad.id.slice(0, 50) : 'No gamepad detected. Press a button on it. (Embedded previews may not see it; open from localhost.)';
  if ($('#padStatus').textContent !== ps) $('#padStatus').textContent = ps;
}

/* ---------------- frame loop ---------------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (engine) {
    router.frame(dt);
    if (!paused) {
      const ev = engine.update(dt);
      renderer.events(engine, ev);
      if (ui.metronome) for (const e of ev) if (e.type === 'beat') audio.click(e.beat % 2 === 0);
    }
    renderer.draw(engine, { ...ui, paused }, gamepad, router);
    updateBox();
  }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('gamepadconnected', () => renderer.flash('Gamepad connected', '#5ad19a'));

/* ---------------- start ---------------- */
$('#fPattern').value = cfg.startingPattern;
$('#fHandswap').value = cfg.handswap || '2';
$('#fDefault').value = cfg.defaultPattern || '';
$('#fHand').value = cfg.startingHand;
$('#fStart').value = cfg.startMode;
$('#fDrop').value = cfg.dropBehavior;
$('#fPickup').value = cfg.pickupMode;
$('#fSplitR').value = cfg.ballsPerHand ? cfg.ballsPerHand.R : 2;
$('#fSplitL').value = cfg.ballsPerHand ? cfg.ballsPerHand.L : 1;
syncForm();
if (!apply()) { cfg = { ...DEFAULT_CONFIG }; $('#fPattern').value = '3'; $('#fHandswap').value = '2'; $('#fDefault').value = ''; syncForm(); apply(); }
requestAnimationFrame(frame);
