// Small synthesized sound set (WebAudio, no files): UI clicks, coins, locks,
// level-ups and the combat sounds. The context starts on the first key or
// click, as browsers require.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.volume = 0.5;
    const start = () => this.ensure();
    addEventListener('keydown', start, { once: true });
    addEventListener('mousedown', start, { once: true });
  }

  ensure() {
    if (this.ctx || this.failed) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const n = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, n, n);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; this.failed = true; } // no audio device: stay silent, don't retry every sound
    return this.ctx;
  }

  // ---- building blocks
  tone(freq, dur, { type = 'sine', gain = 0.3, attack = 0.005, slide = 0, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss(dur, { freq = 1200, q = 0.8, gain = 0.3, type = 'bandpass', attack = 0.005, slide = 0, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    f.Q.value = q;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(name, vol = 1) {
    if (!this.ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const v = vol;
    switch (name) {
      case 'select': this.tone(1800, 0.04, { type: 'triangle', gain: 0.05 * v }); break;
      case 'equip': this.hiss(0.12, { freq: 900, gain: 0.25 * v }); this.tone(320, 0.08, { type: 'triangle', gain: 0.08 * v, delay: 0.03 }); break;
      case 'pickup': this.hiss(0.1, { freq: 1500, gain: 0.18 * v }); break;
      case 'coins': for (let i = 0; i < 4; i++) this.tone(2400 + Math.random() * 900, 0.12, { type: 'triangle', gain: 0.06 * v, delay: i * 0.045 }); break;
      case 'open': this.hiss(0.35, { freq: 380, q: 6, gain: 0.3 * v, slide: 1.6 }); this.tone(90, 0.2, { type: 'triangle', gain: 0.12 * v }); break;
      case 'unlock': this.tone(1400, 0.06, { type: 'square', gain: 0.05 * v }); this.tone(900, 0.12, { type: 'triangle', gain: 0.1 * v, delay: 0.06 }); break;
      case 'pickbreak': this.tone(3200, 0.08, { type: 'square', gain: 0.06 * v, slide: 0.5 }); this.hiss(0.06, { freq: 5000, gain: 0.2 * v }); break;
      case 'drink': for (let i = 0; i < 3; i++) this.tone(300 + i * 40, 0.09, { gain: 0.12 * v, slide: 1.4, delay: i * 0.11 }); break;
      case 'eat': for (let i = 0; i < 3; i++) this.hiss(0.07, { freq: 2200, gain: 0.15 * v, delay: i * 0.13 }); break;
      case 'page': this.hiss(0.25, { freq: 3000, q: 0.5, gain: 0.12 * v, slide: 0.6 }); break;
      case 'skillup': this.tone(660, 0.5, { gain: 0.06 * v }); this.tone(990, 0.7, { gain: 0.05 * v, delay: 0.12 }); break;
      case 'levelup': [440, 554, 660, 880].forEach((f, i) => this.tone(f, 1.2, { type: 'triangle', gain: 0.06 * v, delay: i * 0.12 })); break;
      case 'perk': this.tone(1320, 0.9, { gain: 0.06 * v }); this.tone(1980, 1.1, { gain: 0.04 * v, delay: 0.08 }); break;
      case 'swing': this.hiss(0.22, { freq: 600, q: 1.2, gain: 0.35 * v, slide: 3, attack: 0.04 }); break;
      case 'swingHeavy': this.hiss(0.35, { freq: 380, q: 1.2, gain: 0.45 * v, slide: 3, attack: 0.06 }); break;
      case 'hit': this.hiss(0.12, { freq: 500, q: 1, gain: 0.6 * v, type: 'lowpass' }); this.tone(110, 0.15, { type: 'triangle', gain: 0.35 * v, slide: 0.5 }); break;
      case 'hitMetal': this.tone(1700, 0.25, { type: 'triangle', gain: 0.12 * v, slide: 0.9 }); this.hiss(0.1, { freq: 3500, gain: 0.3 * v }); break;
      case 'block': this.tone(820, 0.35, { type: 'triangle', gain: 0.18 * v, slide: 0.85 }); this.tone(1240, 0.3, { type: 'triangle', gain: 0.1 * v }); this.hiss(0.08, { freq: 4000, gain: 0.3 * v }); break;
      case 'hurt': this.hiss(0.18, { freq: 300, q: 0.7, gain: 0.5 * v, type: 'lowpass' }); this.tone(80, 0.25, { gain: 0.3 * v, slide: 0.6 }); break;
      case 'bowDraw': this.hiss(0.5, { freq: 220, q: 8, gain: 0.08 * v, slide: 1.8, attack: 0.3 }); break;
      case 'bowShot': this.tone(140, 0.18, { type: 'triangle', gain: 0.25 * v, slide: 0.6 }); this.hiss(0.15, { freq: 1800, gain: 0.2 * v, slide: 0.4 }); break;
      case 'arrowHit': this.hiss(0.08, { freq: 900, gain: 0.35 * v }); this.tone(180, 0.1, { type: 'triangle', gain: 0.15 * v }); break;
      case 'fire': this.hiss(0.3, { freq: 700, q: 0.4, gain: 0.25 * v, type: 'lowpass', attack: 0.05 }); break;
      case 'heal': this.tone(880, 0.4, { gain: 0.03 * v, slide: 1.2 }); break;
      case 'wolf': this.tone(480, 0.8, { type: 'sawtooth', gain: 0.05 * v, slide: 0.7, attack: 0.2 }); break;
      case 'growl': this.hiss(0.6, { freq: 180, q: 3, gain: 0.25 * v, attack: 0.1 }); this.tone(70, 0.6, { type: 'sawtooth', gain: 0.06 * v, attack: 0.1 }); break;
      case 'shout': this.hiss(1.2, { freq: 260, q: 0.6, gain: 0.5 * v, slide: 0.5, attack: 0.05 }); this.tone(110, 1.2, { type: 'sawtooth', gain: 0.1 * v, slide: 0.7 }); break;
      case 'stone': this.hiss(0.6, { freq: 220, q: 1.5, gain: 0.45 * v, type: 'lowpass', slide: 0.8 }); this.tone(55, 0.6, { type: 'triangle', gain: 0.25 * v }); break;
      case 'trap': this.tone(2400, 0.06, { type: 'square', gain: 0.05 * v }); this.hiss(0.2, { freq: 2600, gain: 0.3 * v, delay: 0.05 }); break;
      case 'bell': // a struck bell: inharmonic partials with long, staggered decays
        [[0.5, 5.5, 0.05], [1, 4.5, 0.07], [1.19, 3.5, 0.04], [1.5, 3, 0.03], [2, 2.5, 0.035], [2.51, 1.8, 0.02], [3.01, 1.4, 0.015]]
          .forEach(([r, d, gn]) => [0, 2.2].forEach((dl) => this.tone(196 * r, d, { gain: gn * v * (dl ? 0.6 : 1), delay: dl })));
        this.hiss(0.05, { freq: 3000, gain: 0.15 * v }); break;
      case 'detected': this.tone(220, 0.3, { type: 'triangle', gain: 0.08 * v }); break;
      default: break;
    }
  }
}
