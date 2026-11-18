// Keyboard: turns key presses into named actions using the bindings.

export class Keyboard {
  constructor(getBindings) {
    this.getBindings = getBindings;
    this.down = new Set();          // codes currently held
    this.listeners = [];
    this.capture = null;            // rebinding: function(code) or null
    const typing = e => e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox' && e.target.type !== 'range';
    window.addEventListener('keydown', e => {
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture; this.capture = null;
        cb(e.code === 'Escape' ? null : e.code);
        return;
      }
      if (typing(e)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const actions = this.actionsFor(e.code);
      if (actions.length) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      for (const a of actions) this._emit(a, true);
    });
    window.addEventListener('keyup', e => {
      if (!this.down.has(e.code)) return;
      this.down.delete(e.code);
      for (const a of this.actionsFor(e.code)) this._emit(a, false);
    });
    window.addEventListener('blur', () => {
      for (const code of this.down) for (const a of this.actionsFor(code)) this._emit(a, false);
      this.down.clear();
    });
  }
  actionsFor(code) {
    const out = [];
    for (const [a, codes] of Object.entries(this.getBindings().keys)) if (codes && codes.includes(code)) out.push(a);
    return out;
  }
  isDown(action) {
    const codes = this.getBindings().keys[action] || [];
    return codes.some(c => this.down.has(c));
  }
  on(fn) { this.listeners.push(fn); }
  _emit(action, down) { for (const fn of this.listeners) fn(action, down); }
  /** Next key press goes to cb(code) instead of the game (Escape → null). */
  captureNext(cb) { this.capture = cb; }
}
