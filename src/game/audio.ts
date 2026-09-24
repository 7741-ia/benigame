// Lightweight Web Audio sound engine — no external assets required.
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  muted = false;

  private ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
    }
  }

  startEngine() {
    this.ensure();
    if (!this.ctx || this.engineOsc) return;
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 700;

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 60;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = "square";
    this.engineOsc2.frequency.value = 90;

    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master!);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  stopEngine() {
    try {
      this.engineOsc?.stop();
      this.engineOsc2?.stop();
    } catch {
      /* ignore */
    }
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
  }

  // speed01: 0..1 throttle amount
  updateEngine(speed01: number) {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter) return;
    const t = this.ctx.currentTime;
    const base = 55 + speed01 * 150;
    this.engineOsc.frequency.setTargetAtTime(base, t, 0.08);
    this.engineOsc2!.frequency.setTargetAtTime(base * 1.5, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(500 + speed01 * 2200, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.03 + speed01 * 0.12, t, 0.1);
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol = 0.3, slideTo?: number) {
    this.ensure();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master!);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  pickup() {
    this.blip(660, 0.12, "triangle", 0.35, 990);
  }

  deliver() {
    // happy arpeggio
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.18, "triangle", 0.3), i * 90));
  }

  click() {
    this.blip(440, 0.06, "square", 0.18, 620);
  }

  coin() {
    this.blip(880, 0.08, "square", 0.2, 1320);
  }

  upgrade() {
    const notes = [392, 523, 659, 880];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.14, "sawtooth", 0.22), i * 70));
  }

  crash() {
    this.ensure();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const bufferSize = ctx.sampleRate * 0.35;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 0.4;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    noise.connect(f);
    f.connect(g);
    g.connect(this.master!);
    noise.start();
  }

  fail() {
    const notes = [440, 349, 262];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.25, "sawtooth", 0.25), i * 140));
  }

  levelup() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.16, "triangle", 0.28), i * 80));
  }
}

export const audio = new AudioEngine();
