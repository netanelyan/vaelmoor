// Keyboard + pointer-lock mouse input. Mouse buttons are tracked as
// 'Mouse0' (left) / 'Mouse2' (right) alongside key codes, so `down()` covers both.
export class Input {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.listeners = { keydown: [], keyup: [], lock: [], mousedown: [], mouseup: [] };

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const fn of this.listeners.keydown) fn(e);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); for (const fn of this.listeners.keyup) fn(e); });
    element.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.keys.add(`Mouse${e.button}`);
      for (const fn of this.listeners.mousedown) fn(e);
    });
    addEventListener('mouseup', (e) => {
      if (!this.keys.delete(`Mouse${e.button}`)) return;
      for (const fn of this.listeners.mouseup) fn(e);
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      for (const fn of this.listeners.lock) fn(this.locked);
    });
  }

  on(type, fn) { this.listeners[type].push(fn); }

  requestLock() {
    // browsers reject (with a console error) when there was no user gesture: that is fine, the next click locks
    try { this.element.requestPointerLock?.()?.catch?.(() => {}); } catch { /* older browsers throw */ }
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }

  consumeMouse() {
    const d = [this.mouseDX, this.mouseDY];
    this.mouseDX = this.mouseDY = 0;
    return d;
  }
}
