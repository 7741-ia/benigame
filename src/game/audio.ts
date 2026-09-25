// ─────────────────────────────────────────────────────────────
//  Moteur Audio Procédural Web Audio — 100% Hors-Ligne
//  Aucun asset audio externe requis. Sons synthétisés localement en temps réel :
//  - Ambiance : circulation urbaine, vent, oiseaux équatoriaux, grillons, marché, commerces
//  - Véhicules : moteur à régimes variables (moto, camionnette, voiture), accélération,
//    freinage / crissement, klaxon boda-boda, bruit de roulement
//  - Personnage : bruits de pas (marche & course, terre vs asphalte), montée/descente véhicule, interactions
//  - Livraison : récupération colis, remise, confirmation, remerciements client ("Merci !")
//  - Interface : clic, ouverture/fermeture téléphone, notification, mission terminée, passage de niveau
//  - Musique procédurale optionnelle (arpeggiateurs marimba / kalimba afro-lounge doux)
//  - Contrôles séparés : SFX, Musique, Ambiance, sauvegardés en local
// ─────────────────────────────────────────────────────────────

import { loadSettings, saveSettings } from "./storage";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private musicBus: GainNode | null = null;

  // Véhicule
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  // Ambiance continue
  private ambientFilter: BiquadFilterNode | null = null;
  private cityTrafficGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private marketBuzzGain: GainNode | null = null;

  // Musique procédurale
  private musicPlaying = false;
  private musicTimer: number | null = null;
  private musicStep = 0;

  // Timers & cooldowns
  private stepCooldown = 0;
  private chirpCooldown = 0;
  private honkCooldown = 0;

  // Préférences
  muted = false;
  volume = 0.7;
  soundEnabled = true;
  musicEnabled = true;
  ambientEnabled = true;
  sfxVolume = 0.75;
  musicVolume = 0.45;
  ambientVolume = 0.6;

  constructor() {
    if (typeof window !== "undefined") {
      const saved = loadSettings();
      this.muted = !!saved.muted;
      this.volume = saved.volume ?? 0.7;
      this.soundEnabled = saved.soundEnabled ?? true;
      this.musicEnabled = saved.musicEnabled ?? true;
      this.ambientEnabled = saved.ambientEnabled ?? true;
      this.sfxVolume = saved.sfxVolume ?? 0.75;
      this.musicVolume = saved.musicVolume ?? 0.45;
      this.ambientVolume = saved.ambientVolume ?? 0.6;
    }
  }

  private ensure() {
    if (this.ctx) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    // Master
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);

    // Buses
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.soundEnabled ? this.sfxVolume : 0;
    this.sfxBus.connect(this.master);

    this.ambientBus = this.ctx.createGain();
    this.ambientBus.gain.value = this.ambientEnabled ? this.ambientVolume : 0;
    this.ambientBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicEnabled ? this.musicVolume : 0;
    this.musicBus.connect(this.master);

    this.initAmbienceGenerator();
  }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    if (this.musicEnabled && !this.musicPlaying) {
      this.startMusic();
    }
  }

  // ── Sauvegarde et contrôle des volumes ──
  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    saveSettings({ volume: this.volume });
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    saveSettings({ muted: m });
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    saveSettings({ soundEnabled: enabled });
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(enabled ? this.sfxVolume : 0, this.ctx.currentTime, 0.05);
    }
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    saveSettings({ musicEnabled: enabled });
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(enabled ? this.musicVolume : 0, this.ctx.currentTime, 0.05);
    }
    if (enabled && !this.musicPlaying) {
      this.startMusic();
    } else if (!enabled && this.musicPlaying) {
      this.stopMusic();
    }
  }

  setAmbientEnabled(enabled: boolean) {
    this.ambientEnabled = enabled;
    saveSettings({ ambientEnabled: enabled });
    if (this.ambientBus && this.ctx) {
      this.ambientBus.gain.setTargetAtTime(enabled ? this.ambientVolume : 0, this.ctx.currentTime, 0.05);
    }
  }

  setSfxVolume(vol: number) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    saveSettings({ sfxVolume: this.sfxVolume });
    if (this.sfxBus && this.ctx && this.soundEnabled) {
      this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  setMusicVolume(vol: number) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    saveSettings({ musicVolume: this.musicVolume });
    if (this.musicBus && this.ctx && this.musicEnabled) {
      this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05);
    }
  }

  setAmbientVolume(vol: number) {
    this.ambientVolume = Math.max(0, Math.min(1, vol));
    saveSettings({ ambientVolume: this.ambientVolume });
    if (this.ambientBus && this.ctx && this.ambientEnabled) {
      this.ambientBus.gain.setTargetAtTime(this.ambientVolume, this.ctx.currentTime, 0.05);
    }
  }

  // ── MOTEUR & VÉHICULE ──
  private engineState: "off" | "idle" | "running" = "off";
  private currentVehicleType: "moto" | "van" | "car" = "moto";
  private engineStoppingTimeout: number | null = null;

  startEngine(vehicleType: "moto" | "van" | "car" = "moto") {
    this.ensure();
    if (!this.ctx || !this.sfxBus) return;
    this.currentVehicleType = vehicleType;

    if (this.engineStoppingTimeout !== null) {
      window.clearTimeout(this.engineStoppingTimeout);
      this.engineStoppingTimeout = null;
    }

    if (this.engineOsc && this.engineGain) {
      // Déjà actif, on remet le gain normal
      const t = this.ctx.currentTime;
      this.engineGain.gain.cancelScheduledValues(t);
      this.engineGain.gain.setTargetAtTime(this.soundEnabled ? 0.04 : 0, t, 0.08);
      this.engineState = "idle";
      return;
    }

    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Son de démarreur (starter / ignition)
    try {
      const crankOsc = ctx.createOscillator();
      const crankGain = ctx.createGain();
      crankOsc.type = "sawtooth";
      crankOsc.frequency.setValueAtTime(32, t);
      crankOsc.frequency.linearRampToValueAtTime(85, t + 0.18);
      crankGain.gain.setValueAtTime(this.soundEnabled ? 0.07 : 0, t);
      crankGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      crankOsc.connect(crankGain);
      crankGain.connect(this.sfxBus);
      crankOsc.start(t);
      crankOsc.stop(t + 0.23);
    } catch {
      /* ignore */
    }

    this.engineGain = ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.0001, t);
    this.engineGain.gain.linearRampToValueAtTime(this.soundEnabled ? 0.035 : 0, t + 0.2);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = vehicleType === "moto" ? 750 : vehicleType === "van" ? 420 : 550;

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = vehicleType === "moto" ? "sawtooth" : "triangle";
    this.engineOsc.frequency.value = vehicleType === "moto" ? 68 : vehicleType === "van" ? 38 : 46;

    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = "square";
    this.engineOsc2.frequency.value = vehicleType === "moto" ? 102 : vehicleType === "van" ? 57 : 69;

    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxBus);

    try {
      this.engineOsc.start(t + 0.05);
      this.engineOsc2.start(t + 0.05);
      this.engineState = "idle";
    } catch {
      this.engineOsc = null;
      this.engineOsc2 = null;
    }
  }

  stopEngine(immediate = false) {
    if (!this.engineOsc || !this.engineGain || !this.ctx) {
      this.engineState = "off";
      return;
    }

    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.engineState = "off";

    if (immediate) {
      try {
        this.engineGain.gain.cancelScheduledValues(t);
        this.engineGain.gain.setValueAtTime(0, t);
        this.engineOsc.stop();
        this.engineOsc2?.stop();
      } catch {
        /* ignore */
      }
      this.engineOsc = null;
      this.engineOsc2 = null;
      this.engineGain = null;
      this.engineFilter = null;
      return;
    }

    // Arrêt progressif sans coupure brutale
    try {
      this.engineGain.gain.cancelScheduledValues(t);
      this.engineGain.gain.setTargetAtTime(0, t, 0.08);
    } catch {
      /* ignore */
    }

    const osc1 = this.engineOsc;
    const osc2 = this.engineOsc2;
    const gain = this.engineGain;
    const filter = this.engineFilter;

    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;

    if (this.engineStoppingTimeout !== null) {
      window.clearTimeout(this.engineStoppingTimeout);
    }

    this.engineStoppingTimeout = window.setTimeout(() => {
      try {
        osc1?.stop();
        osc2?.stop();
        gain?.disconnect();
        filter?.disconnect();
      } catch {
        /* ignore */
      }
    }, 120);
  }

  updateEngine(
    speed01: number,
    vehicleType: "moto" | "van" | "car" = "moto",
    isAccelerating = false,
    distanceToPlayer = 0
  ) {
    // Si trop éloigné ou joueur à pied loin du véhicule, couper le son
    if (distanceToPlayer > 12) {
      if (this.engineState !== "off") this.stopEngine();
      return;
    }

    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter) {
      // Ne pas auto-démarrer si moteur coupé
      return;
    }

    const t = this.ctx.currentTime;
    const isMoto = vehicleType === "moto";
    const isVan = vehicleType === "van";

    // Atténuation selon la distance si le joueur n'est pas sur le véhicule
    const distAtten = distanceToPlayer > 0 ? Math.max(0, 1 - distanceToPlayer / 12) : 1;

    const baseMin = isMoto ? 62 : isVan ? 36 : 45;
    const baseMax = isMoto ? 240 : isVan ? 165 : 190;
    const revBoost = isAccelerating ? (isMoto ? 25 : 15) : 0;
    const baseFreq = baseMin + speed01 * (baseMax - baseMin) + revBoost;

    this.engineOsc.frequency.setTargetAtTime(baseFreq, t, 0.07);
    if (this.engineOsc2) {
      this.engineOsc2.frequency.setTargetAtTime(baseFreq * (isMoto ? 1.5 : 1.33), t, 0.07);
    }

    const cutoff = (isMoto ? 600 : 380) + speed01 * (isMoto ? 2500 : 1800);
    this.engineFilter.frequency.setTargetAtTime(cutoff, t, 0.08);

    const gainVal = (0.028 + speed01 * 0.15 + (isAccelerating ? 0.03 : 0)) * distAtten;
    this.engineGain.gain.setTargetAtTime(this.soundEnabled ? gainVal : 0, t, 0.09);
    this.engineState = speed01 > 0.05 ? "running" : "idle";
  }

  // ── SONS DE LA MAISON & DU QUOTIDIEN ──
  tvSwitch() {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(780, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  doorInteract(open = true) {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = open ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(open ? 180 : 90, t);
    osc.frequency.exponentialRampToValueAtTime(open ? 95 : 45, t + 0.15);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  waterTap(flowing = true) {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    if (!flowing) {
      this.click();
      return;
    }
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(540, t);
    osc.frequency.linearRampToValueAtTime(420, t + 0.3);
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  shower() {
    this.waterTap(true);
  }

  fridgeInteract() {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.19);
  }

  cookSizzle() {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.linearRampToValueAtTime(320, t + 0.4);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.46);
  }

  eatSound() {
    this.coin();
  }

  sitDown() {
    this.vehicleExit();
  }

  lightSwitch() {
    this.click();
  }

  /** Bruit de crissement / freinage prononcé */
  brakeScreech(intensity = 0.6) {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.linearRampToValueAtTime(1400, t + 0.15);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2200, t);
    filter.Q.value = 6;

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.08 * intensity, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.21);
  }

  /** Klaxon de taxi-moto ou véhicule */
  horn() {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [440, 554].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.setValueAtTime(0.18, t + 0.22);
      gain.gain.linearRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(this.sfxBus!);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  // ── PERSONNAGE : PAS & VÉHICULE ──
  step(surface: "asphalt" | "dirt" = "dirt", running = false) {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const now = performance.now();
    const interval = running ? 260 : 440;
    if (now - this.stepCooldown < interval) return;
    this.stepCooldown = now;

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = "lowpass";
    if (surface === "dirt") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.07);
      filter.frequency.setValueAtTime(420, t);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.06);
      filter.frequency.setValueAtTime(800, t);
    }

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(running ? 0.12 : 0.065, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  vehicleEnter() {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // Béquille de moto / claquement de portière
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  vehicleExit() {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.19);
  }

  door() {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  // ── LIVRAISON & MISSIONS ──
  private blip(freq: number, dur: number, type: OscillatorType, vol = 0.3, slideTo?: number) {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
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
    g.connect(this.sfxBus);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  pickup() {
    // Récupération de colis
    this.blip(660, 0.12, "triangle", 0.32, 990);
  }

  handover() {
    // Remise du colis (bruit feutré de carton)
    this.blip(320, 0.15, "triangle", 0.25, 180);
  }

  deliver() {
    // Confirmation de livraison (accord majeur ascendant)
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.16, "triangle", 0.28), i * 80));
  }

  clientThank() {
    // Petit son de remerciement vocalisé chaleureux ("Merci !")
    setTimeout(() => {
      this.blip(587, 0.12, "sine", 0.2, 740);
      setTimeout(() => this.blip(880, 0.22, "triangle", 0.25, 660), 100);
    }, 180);
  }

  missionComplete() {
    // Fanfare de mission terminée
    const notes = [440, 554, 659, 880, 1108];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.2, "triangle", 0.3), i * 90));
  }

  levelup() {
    // Trophée et nouveau niveau débloqué
    const notes = [392, 523, 659, 784, 1046, 1318];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.25, "sawtooth", 0.32), i * 100));
  }

  coin() {
    this.blip(880, 0.08, "square", 0.2, 1320);
  }

  upgrade() {
    const notes = [392, 523, 659, 880];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.14, "sawtooth", 0.22), i * 70));
  }

  fail() {
    this.blip(220, 0.35, "sawtooth", 0.3, 110);
  }

  crash() {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  }

  siren() {
    this.ensure();
    if (!this.ctx || !this.sfxBus || !this.soundEnabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(650, t);
    osc.frequency.linearRampToValueAtTime(950, t + 0.25);
    osc.frequency.linearRampToValueAtTime(650, t + 0.5);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.56);
  }

  // ── INTERFACE ──
  click() {
    this.blip(440, 0.05, "square", 0.16, 620);
  }

  openPhone() {
    // Son d'allumage numérique du smartphone
    this.blip(523, 0.08, "sine", 0.18, 784);
    setTimeout(() => this.blip(1046, 0.12, "sine", 0.2), 70);
  }

  closePhone() {
    // Extinction du smartphone
    this.blip(784, 0.08, "sine", 0.15, 440);
  }

  notification() {
    // Alerte douce deux tons
    this.blip(659, 0.08, "sine", 0.2);
    setTimeout(() => this.blip(987, 0.14, "sine", 0.22), 90);
  }

  // ── AMBIANCE CONTINUE (VILLE, VENT, OISEAUX, MARCHÉ) ──
  private initAmbienceGenerator() {
    if (!this.ctx || !this.ambientBus) return;
    const ctx = this.ctx;

    // Buffer de bruit rose/brun bouclé pour rumeur urbaine
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    // Filtre passe-bas pour rumeur urbaine lointaine
    this.ambientFilter = ctx.createBiquadFilter();
    this.ambientFilter.type = "lowpass";
    this.ambientFilter.frequency.value = 350;

    this.cityTrafficGain = ctx.createGain();
    this.cityTrafficGain.gain.value = 0.04;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.01;

    this.marketBuzzGain = ctx.createGain();
    this.marketBuzzGain.gain.value = 0.0;

    noiseSource.connect(this.ambientFilter);
    this.ambientFilter.connect(this.cityTrafficGain);
    this.cityTrafficGain.connect(this.ambientBus);

    try {
      noiseSource.start();
    } catch {
      /* ignore */
    }
  }

  updateAmbience(opts: {
    hour?: number;
    speed?: number;
    nearMarket?: boolean;
    weather?: string;
  }) {
    if (!this.ctx || !this.ambientBus) return;
    const t = this.ctx.currentTime;
    const speed = opts.speed ?? 0;
    const hour = opts.hour ?? 12;
    const isNight = hour < 6 || hour >= 19;
    const nearMarket = !!opts.nearMarket;

    // Ajustement de la rumeur urbaine
    if (this.cityTrafficGain) {
      const trafficLevel = isNight ? 0.015 : 0.045;
      this.cityTrafficGain.gain.setTargetAtTime(
        this.ambientEnabled ? trafficLevel : 0,
        t,
        0.5
      );
    }

    // Souffle du vent proportionnel à la vitesse
    if (this.windGain) {
      const windLevel = Math.min(0.08, (speed / 120) * 0.08);
      this.windGain.gain.setTargetAtTime(
        this.ambientEnabled ? windLevel : 0,
        t,
        0.2
      );
    }

    // Effervescence du marché
    if (this.marketBuzzGain) {
      const marketLevel = nearMarket && !isNight ? 0.06 : 0.0;
      this.marketBuzzGain.gain.setTargetAtTime(
        this.ambientEnabled ? marketLevel : 0,
        t,
        0.4
      );
    }

    // Gazouillis périodiques oiseaux ou grillons
    const now = performance.now();
    if (now - this.chirpCooldown > (isNight ? 1800 : 3500)) {
      this.chirpCooldown = now;
      this.playAmbientChirp(isNight);
    }

    // Klaxons distants aléatoires en ville (en journée)
    if (!isNight && now - this.honkCooldown > 9000 && Math.random() < 0.35) {
      this.honkCooldown = now;
      this.playDistantHorn();
    }
  }

  playAmbientChirp(isNight: boolean) {
    this.ensure();
    if (!this.ctx || !this.ambientBus || !this.ambientEnabled || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (isNight) {
      // Grillon nocturne équatorial
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(4600, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.018, t + 0.02);
      gain.gain.linearRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain);
      gain.connect(this.ambientBus);
      osc.start(t);
      osc.stop(t + 0.09);
    } else {
      // Oiseau tropical de Beni
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(2200, t);
      osc.frequency.exponentialRampToValueAtTime(3200, t + 0.08);
      osc.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.025, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(this.ambientBus);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  private playDistantHorn() {
    if (!this.ctx || !this.ambientBus || !this.ambientEnabled || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(480, t);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, t); // étouffé par la distance
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.03, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientBus);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  // ── MUSIQUE D'AMBIANCE PROCÉDURALE (AFRO-LOUNGE MARIMBA HORS-LIGNE) ──
  startMusic() {
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    this.scheduleNextMusicNote();
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleNextMusicNote() {
    if (!this.musicPlaying) return;

    // Gamme pentatonique majeure douce (G major / Sol majeur : G, A, B, D, E)
    const scale = [392, 440, 493.88, 587.33, 659.25, 784, 880];
    const pattern = [0, 2, 4, 3, 1, 3, 5, 4, 2, 0, 3, 2];
    const noteFreq = scale[pattern[this.musicStep % pattern.length]];
    this.musicStep = (this.musicStep + 1) % pattern.length;

    if (this.musicEnabled && !this.muted && this.ctx && this.musicBus) {
      this.playKalimbaNote(noteFreq);
    }

    const interval = this.musicStep % 4 === 0 ? 650 : 380;
    this.musicTimer = window.setTimeout(() => this.scheduleNextMusicNote(), interval);
  }

  private playKalimbaNote(freq: number) {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);

    // Harmonique douce de marimba
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 3.5, t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.07, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);

    osc.start(t);
    osc.stop(t + 0.72);
  }
}

export const audio = new AudioEngine();
