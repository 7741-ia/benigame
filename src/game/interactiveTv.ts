import * as THREE from "three";
import { audio } from "./audio";

export interface TvState {
  isOn: boolean;
  channel: number;
  channelName: string;
  volume: number;
}

export const CHANNELS = [
  { id: 0, name: "RTNC Beni · Journal du Kivu", icon: "📰" },
  { id: 1, name: "Beni Afrobeat & Rumba TV", icon: "🎵" },
  { id: 2, name: "Météo Beni & Ruwenzori", icon: "⛅" },
  { id: 3, name: "Kivu Sport · Stade du 15 Octobre", icon: "⚽" },
];

export class InteractiveTV {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;
  public isOn = false;
  public channel = 0;
  public volume = 75;

  private time = 0;
  private staticTimer = 0;
  private osdTimer = 0;
  private osdMessage = "";

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 512;
    this.canvas.height = 288;
    this.ctx = this.canvas.getContext("2d")!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.renderOffScreen();
  }

  togglePower(): boolean {
    this.isOn = !this.isOn;
    audio.tvSwitch();
    if (this.isOn) {
      this.staticTimer = 0.25;
      this.showOsd(CHANNELS[this.channel].name);
    } else {
      this.renderOffScreen();
    }
    return this.isOn;
  }

  nextChannel() {
    if (!this.isOn) {
      this.togglePower();
      return;
    }
    audio.tvSwitch();
    this.channel = (this.channel + 1) % CHANNELS.length;
    this.staticTimer = 0.2;
    this.showOsd(CHANNELS[this.channel].name);
  }

  prevChannel() {
    if (!this.isOn) {
      this.togglePower();
      return;
    }
    audio.tvSwitch();
    this.channel = (this.channel - 1 + CHANNELS.length) % CHANNELS.length;
    this.staticTimer = 0.2;
    this.showOsd(CHANNELS[this.channel].name);
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(100, vol));
    audio.click();
    this.showOsd(`Volume : ${this.volume}%`);
  }

  volumeUp() {
    this.setVolume(this.volume + 10);
  }

  volumeDown() {
    this.setVolume(this.volume - 10);
  }

  showOsd(msg: string) {
    this.osdMessage = msg;
    this.osdTimer = 2.5;
  }

  getState(): TvState {
    return {
      isOn: this.isOn,
      channel: this.channel,
      channelName: CHANNELS[this.channel].name,
      volume: this.volume,
    };
  }

  update(dt: number) {
    this.time += dt;
    if (this.staticTimer > 0) this.staticTimer -= dt;
    if (this.osdTimer > 0) this.osdTimer -= dt;

    if (!this.isOn) {
      return;
    }

    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    // Effet de neige/fuzz lors du changement de chaîne
    if (this.staticTimer > 0) {
      const imgData = ctx.createImageData(w, h);
      const buf = new Uint32Array(imgData.data.buffer);
      for (let i = 0; i < buf.length; i++) {
        const v = (Math.random() * 255) | 0;
        buf[i] = 0xff000000 | (v << 16) | (v << 8) | v;
      }
      ctx.putImageData(imgData, 0, 0);
      this.texture.needsUpdate = true;
      return;
    }

    ctx.save();

    // Rendu selon la chaîne
    switch (this.channel) {
      case 0:
        this.renderNewsChannel(ctx, w, h);
        break;
      case 1:
        this.renderMusicChannel(ctx, w, h);
        break;
      case 2:
        this.renderWeatherChannel(ctx, w, h);
        break;
      case 3:
        this.renderSportsChannel(ctx, w, h);
        break;
    }

    // Affichage OSD (Bandeau de volume / chaîne)
    if (this.osdTimer > 0) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.beginPath();
      ctx.roundRect(16, 16, w - 32, 44, 8);
      ctx.fill();

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(this.osdMessage, 28, 44);

      // Barre de volume
      const barW = 120;
      const barX = w - barW - 28;
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(barX, 32, barW, 10);
      ctx.fillStyle = "#10b981";
      ctx.fillRect(barX, 32, (barW * this.volume) / 100, 10);
    }

    // Scanlines cathodiques subtiles
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1.5);
    }

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  private renderOffScreen() {
    const { ctx, canvas } = this;
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Reflet subtil de la pièce
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.04)");
    grad.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0.02)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.texture.needsUpdate = true;
  }

  private renderNewsChannel(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Fond studio RTNC bleu et or
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#0f172a");
    bg.addColorStop(0.6, "#1e3a8a");
    bg.addColorStop(1, "#0284c7");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Écran du studio arrière
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(40, 30, w - 80, 140);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.strokeRect(40, 30, w - 80, 140);

    // Présentateur / Présentatrice en silhouette soignée
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(w / 2, 90, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 50, 190);
    ctx.quadraticCurveTo(w / 2, 120, w / 2 + 50, 190);
    ctx.closePath();
    ctx.fill();

    // Table de journal télévisé
    ctx.fillStyle = "#0284c7";
    ctx.fillRect(w / 2 - 80, 160, 160, 35);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(w / 2 - 80, 160, 160, 4);

    // Logo & Horloge
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(20, 20, 75, 26);
    ctx.fillStyle = "#ffffff";
    ctx.font = "black 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("EN DIRECT", 57, 38);

    ctx.fillStyle = "#facc15";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "right";
    const sec = Math.floor(this.time % 60);
    ctx.fillText(`19:45:${sec < 10 ? "0" : ""}${sec}`, w - 24, 38);

    // Bandeau d'actualités défilant
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, h - 55, w, 55);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(0, h - 55, w, 4);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("GRAND JOURNAL · BENI & NORD-KIVU", 16, h - 35);

    const tickerText =
      "★ BENI : Livraison de colis record dans les communes de Masiani et Bungulu ★ Marché central en pleine effervescence commerciale ★ Route Mavivi réhabilitée ★ Climat doux sur les contreforts du Ruwenzori ★";
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px system-ui, sans-serif";
    const tickerX = w - ((this.time * 65) % (w + 1400));
    ctx.fillText(tickerText, tickerX, h - 14);
  }

  private renderMusicChannel(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Fond lounge afrobeat
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#4c0519");
    bg.addColorStop(0.5, "#831843");
    bg.addColorStop(1, "#581c87");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Disque vinyle tournant
    const discX = 110;
    const discY = 120;
    ctx.save();
    ctx.translate(discX, discY);
    ctx.rotate(this.time * 2.5);

    ctx.fillStyle = "#09090b";
    ctx.beginPath();
    ctx.arc(0, 0, 65, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Barres d'égaliseur animé
    const bars = 18;
    const barWidth = 12;
    const startX = 210;
    const baseY = 175;

    for (let i = 0; i < bars; i++) {
      const freq = Math.sin(this.time * 8 + i * 0.7) * 0.5 + 0.5;
      const barH = 15 + freq * 85;
      const grad = ctx.createLinearGradient(0, baseY, 0, baseY - barH);
      grad.addColorStop(0, "#10b981");
      grad.addColorStop(0.6, "#facc15");
      grad.addColorStop(1, "#ef4444");
      ctx.fillStyle = grad;
      ctx.fillRect(startX + i * (barWidth + 4), baseY - barH, barWidth, barH);
    }

    // Titre de la piste
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, h - 60, w, 60);
    ctx.fillStyle = "#f43f5e";
    ctx.fillRect(0, h - 60, w, 3);

    ctx.fillStyle = "#f43f5e";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("🎵 AFROBEAT HIT CONGO", 20, h - 38);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.fillText("Fally Ipupa · Ambiance Kivu Express", 20, h - 16);
  }

  private renderWeatherChannel(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Ciel équatorial
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#0284c7");
    bg.addColorStop(0.7, "#38bdf8");
    bg.addColorStop(1, "#7dd3fc");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Silhouette Mont Ruwenzori au loin
    ctx.fillStyle = "#0369a1";
    ctx.beginPath();
    ctx.moveTo(0, 190);
    ctx.lineTo(120, 100);
    ctx.lineTo(220, 140);
    ctx.lineTo(340, 75); // Pic enneigé
    ctx.lineTo(460, 150);
    ctx.lineTo(w, 190);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Neige éternelle sur le sommet du pic
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(340, 75);
    ctx.lineTo(320, 105);
    ctx.lineTo(335, 98);
    ctx.lineTo(350, 108);
    ctx.lineTo(365, 100);
    ctx.closePath();
    ctx.fill();

    // Soleil radieux animé
    const sunX = 85;
    const sunY = 70;
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 32, 0, Math.PI * 2);
    ctx.fill();

    // Température et météo
    ctx.fillStyle = "#ffffff";
    ctx.font = "black 48px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("26°C", w - 30, 75);

    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.fillText("Beni · Beau temps chaud", w - 30, 105);
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("Humidité : 72% · Vent : 12 km/h", w - 30, 130);

    // Prévisions par commune
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, h - 65, w, 65);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(0, h - 65, w, 3);

    const spots = [
      { name: "Masiani", t: "26°C", icon: "☀️" },
      { name: "Bungulu", t: "25°C", icon: "⛅" },
      { name: "Mavivi", t: "27°C", icon: "☀️" },
      { name: "Ruwenzori", t: "18°C", icon: "🏔️" },
    ];
    spots.forEach((s, idx) => {
      const sx = 20 + idx * 125;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${s.icon} ${s.name}`, sx, h - 38);
      ctx.fillStyle = "#facc15";
      ctx.fillText(s.t, sx, h - 16);
    });
  }

  private renderSportsChannel(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Terrain de football vert
    ctx.fillStyle = "#15803d";
    ctx.fillRect(0, 0, w, h);

    // Lignes blanches de touche et rond central
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, w - 60, h - 90);

    ctx.beginPath();
    ctx.arc(w / 2, (h - 60) / 2 + 15, 45, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w / 2, 30);
    ctx.lineTo(w / 2, h - 60);
    ctx.stroke();

    // Ballon qui bouge
    const ballX = w / 2 + Math.sin(this.time * 3) * 110;
    const ballY = (h - 60) / 2 + 15 + Math.cos(this.time * 2.2) * 35;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ballX, ballY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Tableau de score en haut
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(w / 2 - 130, 8, 260, 36);
    ctx.fillStyle = "#facc15";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("FC BENI  2 - 1  AS MANIEMA", w / 2, 32);

    // Bandeau bas
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, h - 45, w, 45);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(0, h - 45, w, 3);
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Championnat National · Stade du 15 Octobre à guichets fermés", w / 2, h - 18);
  }
}
