import * as THREE from "three";
import { makeClouds, makeRainStreak, makeRainSplash, makeFogPuff, makeCloudShadowMap } from "./textures";

export type Weather = "sunny" | "cloudy" | "rain" | "fog";
export type Quality = "low" | "medium" | "high";

interface SkyKey {
  h: number; // heure
  top: number;
  horizon: number;
  sun: number;
  sunI: number; // intensité soleil
  hemiI: number;
  fogFar: number;
}

// Étalonnage réaliste jour/nuit (interpolé). Heures en 0..24.
const KEYS: SkyKey[] = [
  { h: 0, top: 0x070b1c, horizon: 0x141c33, sun: 0x8fa6ff, sunI: 0.22, hemiI: 0.4, fogFar: 300 },
  { h: 5, top: 0x0b1130, horizon: 0x2a2f52, sun: 0x9fb0ff, sunI: 0.24, hemiI: 0.42, fogFar: 300 },
  { h: 6.5, top: 0x3f5f95, horizon: 0xf0a562, sun: 0xffc48a, sunI: 0.9, hemiI: 0.55, fogFar: 360 },
  { h: 9, top: 0x4f9de0, horizon: 0xc9e2f2, sun: 0xfff1d8, sunI: 2.4, hemiI: 0.95, fogFar: 440 },
  { h: 13, top: 0x3f8fdc, horizon: 0xd6e9f5, sun: 0xffffff, sunI: 2.8, hemiI: 1.0, fogFar: 480 },
  { h: 16.5, top: 0x4c93d4, horizon: 0xe9d7b8, sun: 0xffe7c0, sunI: 2.1, hemiI: 0.9, fogFar: 440 },
  { h: 18.2, top: 0x35427a, horizon: 0xff8f5e, sun: 0xffa66a, sunI: 0.9, hemiI: 0.55, fogFar: 360 },
  { h: 19.5, top: 0x121a3f, horizon: 0x3b3562, sun: 0xb8a4ff, sunI: 0.26, hemiI: 0.42, fogFar: 320 },
  { h: 24, top: 0x070b1c, horizon: 0x141c33, sun: 0x8fa6ff, sunI: 0.22, hemiI: 0.4, fogFar: 300 },
];

const cA = new THREE.Color();
const cB = new THREE.Color();

export class Environment {
  hour = 10;
  /** vitesse du temps : 1 h de jeu = 45 s réelles */
  timeScale = 1 / 45;
  weather: Weather = "sunny";
  wetness = 0; // 0..1 chaussée mouillée
  cloudCover = 0; // 0..1
  nightFactor = 0; // 0..1
  private weatherTimer = 120;
  private skyMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.MeshBasicMaterial;

  // Gouttes de pluie tombantes
  private rain: THREE.Points;
  private rainCount = 2400;
  private rainPos: Float32Array;
  private rainMat: THREE.PointsMaterial;

  // Éclaboussures d'impact de pluie au sol
  private rainSplashes: THREE.Points;
  private splashCount = 550;
  private splashPos: Float32Array;
  private splashVel: Float32Array;
  private splashLife: Float32Array;
  private splashMat: THREE.PointsMaterial;

  // Nappes de brume et brouillard volumétrique
  private fogParticles: THREE.Points;
  private fogCount = 160;
  private fogPos: Float32Array;
  private fogVel: Float32Array;
  private fogPhase: Float32Array;
  private fogMat: THREE.PointsMaterial;

  // Ombres de nuages glissant sur le sol
  private groundShadow: THREE.Mesh;
  private groundShadowMat: THREE.MeshBasicMaterial;
  private groundShadowTex: THREE.CanvasTexture;

  private stars: THREE.Points;
  private starsMat: THREE.PointsMaterial;
  private sunDir = new THREE.Vector3(0.4, 0.8, 0.3);
  private quality: Quality = "high";

  constructor(
    private scene: THREE.Scene,
    private sun: THREE.DirectionalLight,
    private hemi: THREE.HemisphereLight
  ) {
    // ── Dôme de ciel équatorial avec dégradé ──
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x4f9de0) },
        horizonColor: { value: new THREE.Color(0xc9e2f2) },
        sunDir: { value: this.sunDir.clone() },
        sunColor: { value: new THREE.Color(0xfff1d8) },
        sunGlow: { value: 1 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunColor * pow(s, 260.0) * 1.6 * sunGlow;   // disque solaire
          col += sunColor * pow(s, 8.0) * 0.18 * sunGlow;    // halo atmosphérique
          if (vDir.y < 0.0) col = mix(horizonColor, horizonColor * 0.6, clamp(-vDir.y * 4.0, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 14), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // ── Ciel étoilé nocturne ──
    const starCount = 800;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 850;
      const y = Math.abs(r * Math.cos(phi));
      starPos[i * 3] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 1] = y + 50;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.cos(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    this.starsMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.2,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starsMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    // ── Nuages tropicaux en dérive dans le ciel ──
    this.cloudMat = new THREE.MeshBasicMaterial({
      map: makeClouds(),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      fog: false,
    });
    if (this.cloudMat.map) this.cloudMat.map.repeat.set(3, 3);
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.cloudMat);
    this.clouds.rotation.x = Math.PI / 2;
    this.clouds.position.y = 130;
    this.clouds.renderOrder = -5;
    scene.add(this.clouds);

    // ── Ombres portées des nuages glissant au sol ──
    this.groundShadowTex = makeCloudShadowMap();
    this.groundShadowMat = new THREE.MeshBasicMaterial({
      map: this.groundShadowTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0x060c14,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.groundShadowMat);
    this.groundShadow.rotation.x = -Math.PI / 2;
    this.groundShadow.position.y = 0.032;
    this.groundShadow.renderOrder = -4;
    scene.add(this.groundShadow);

    // ── Gouttes de pluie tropicale inclinées ──
    const n = this.rainCount;
    this.rainPos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 110;
      this.rainPos[i * 3 + 1] = Math.random() * 52;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 110;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rainMat = new THREE.PointsMaterial({
      map: makeRainStreak(),
      size: 1.25,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0xdfeaf7,
    });
    this.rain = new THREE.Points(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    // ── Particules d'éclaboussures de pluie au sol ──
    const sn = this.splashCount;
    this.splashPos = new Float32Array(sn * 3);
    this.splashVel = new Float32Array(sn * 3);
    this.splashLife = new Float32Array(sn);
    for (let i = 0; i < sn; i++) {
      this.splashPos[i * 3] = (Math.random() - 0.5) * 80;
      this.splashPos[i * 3 + 1] = 0.04 + Math.random() * 0.1;
      this.splashPos[i * 3 + 2] = (Math.random() - 0.5) * 80;
      this.splashVel[i * 3] = (Math.random() - 0.5) * 1.5;
      this.splashVel[i * 3 + 1] = 0.8 + Math.random() * 1.4;
      this.splashVel[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
      this.splashLife[i] = Math.random() * 0.2;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(this.splashPos, 3));
    this.splashMat = new THREE.PointsMaterial({
      map: makeRainSplash(),
      size: 1.5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0xd6e8fa,
    });
    this.rainSplashes = new THREE.Points(sg, this.splashMat);
    this.rainSplashes.frustumCulled = false;
    this.rainSplashes.visible = false;
    scene.add(this.rainSplashes);

    // ── Particules de brume / brouillard volumétrique au sol ──
    const fn = this.fogCount;
    this.fogPos = new Float32Array(fn * 3);
    this.fogVel = new Float32Array(fn * 3);
    this.fogPhase = new Float32Array(fn);
    for (let i = 0; i < fn; i++) {
      this.fogPos[i * 3] = (Math.random() - 0.5) * 150;
      this.fogPos[i * 3 + 1] = 1.0 + Math.random() * 2.8;
      this.fogPos[i * 3 + 2] = (Math.random() - 0.5) * 150;
      this.fogVel[i * 3] = 0.4 + Math.random() * 0.6;
      this.fogVel[i * 3 + 1] = 0;
      this.fogVel[i * 3 + 2] = 0.2 + Math.random() * 0.4;
      this.fogPhase[i] = Math.random() * Math.PI * 2;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(this.fogPos, 3));
    this.fogMat = new THREE.PointsMaterial({
      map: makeFogPuff(),
      size: 24,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0xdae6f2,
    });
    this.fogParticles = new THREE.Points(fg, this.fogMat);
    this.fogParticles.frustumCulled = false;
    this.fogParticles.visible = false;
    scene.add(this.fogParticles);

    scene.add(sun.target);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.clouds.visible = q !== "low";
    this.groundShadow.visible = q !== "low" && this.groundShadowMat.opacity > 0.01;
    this.fogParticles.visible = this.fogMat.opacity > 0.008;
    this.rainSplashes.visible = this.splashMat.opacity > 0.01;
  }

  setHour(h: number) {
    this.hour = ((h % 24) + 24) % 24;
  }

  clockLabel() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  setWeather(w: Weather, instant = false) {
    this.weather = w;
    this.weatherTimer = 140 + Math.random() * 120;
    if (instant) {
      this.cloudCover = w === "sunny" ? 0.2 : w === "cloudy" ? 0.85 : w === "fog" ? 0.6 : 1;
      this.wetness = w === "rain" ? 1 : w === "cloudy" ? 0.25 : w === "fog" ? 0.2 : 0;
      this.rainMat.opacity = w === "rain" ? 0.75 : 0;
      this.splashMat.opacity = w === "rain" ? 0.8 : 0;
      this.fogMat.opacity = w === "fog" ? (this.quality === "low" ? 0.22 : 0.36) : 0;
      const isDay = this.hour > 6 && this.hour < 18;
      this.groundShadowMat.opacity = isDay
        ? (w === "rain" ? 0.44 : w === "cloudy" ? 0.38 : w === "fog" ? 0.08 : 0.16)
        : 0;
    }
  }

  /** Adhérence des pneus : 1 = sol sec, ~0.82 sous nuages denses, ~0.55 sous forte pluie */
  gripFactor(): number {
    if (this.weather === "rain") {
      // Sol inondé / aquaplaning : forte perte d'adhérence
      return Math.max(0.5, 1 - (0.28 + this.wetness * 0.17));
    }
    if (this.weather === "cloudy") {
      // Temps très couvert, brumasse et condensation sur l'asphalte
      const coverNorm = Math.min(1, this.cloudCover / 0.8);
      return Math.max(0.78, 1 - 0.18 * coverNorm);
    }
    if (this.weather === "fog") {
      return 0.78;
    }
    // Temps sec / ensoleillé (légère glisse si la pluie vient de cesser)
    return Math.max(0.75, 1 - this.wetness * 0.25);
  }

  /** Facteur de vitesse de pointe selon la météo (pluie ou nuages lourds réduisent la vitesse max) */
  weatherSpeedFactor(): number {
    if (this.weather === "rain") {
      // Pluie battante : vitesse réduite de ~28%
      return Math.max(0.68, 1 - (0.18 + this.wetness * 0.1));
    }
    if (this.weather === "cloudy") {
      // Nuages denses / temps lourd : vitesse ralentie de ~12%
      const coverNorm = Math.min(1, this.cloudCover / 0.8);
      return Math.max(0.85, 1 - 0.12 * coverNorm);
    }
    if (this.weather === "fog") {
      // Brume / brouillard : visibilité et vitesse réduites (-16%)
      return 0.84;
    }
    return 1.0;
  }

  /** Facteur d'accélération selon la météo (motricité au démarrage et reprises) */
  weatherAccelFactor(): number {
    if (this.weather === "rain") {
      // Patinage des roues sur asphalte détrempé : accélération réduite de ~32%
      return Math.max(0.65, 1 - (0.2 + this.wetness * 0.12));
    }
    if (this.weather === "cloudy") {
      // Nuages denses : motricité diminuée de ~15%
      const coverNorm = Math.min(1, this.cloudCover / 0.8);
      return Math.max(0.82, 1 - 0.15 * coverNorm);
    }
    if (this.weather === "fog") {
      return 0.8;
    }
    return 1.0;
  }

  private sample(hour: number): SkyKey {
    let a = KEYS[0];
    let b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
    const t = (hour - a.h) / Math.max(0.001, b.h - a.h);
    const lerpHex = (x: number, y: number) => cA.setHex(x).lerp(cB.setHex(y), t).getHex();
    return {
      h: hour,
      top: lerpHex(a.top, b.top),
      horizon: lerpHex(a.horizon, b.horizon),
      sun: lerpHex(a.sun, b.sun),
      sunI: a.sunI + (b.sunI - a.sunI) * t,
      hemiI: a.hemiI + (b.hemiI - a.hemiI) * t,
      fogFar: a.fogFar + (b.fogFar - a.fogFar) * t,
    };
  }

  update(dt: number, focus: THREE.Vector3, playing: boolean) {
    if (playing) this.hour = (this.hour + dt * this.timeScale) % 24;

    // Transition météorologique
    if (playing) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        const r = Math.random();
        this.weather = r < 0.5 ? "sunny" : r < 0.75 ? "cloudy" : r < 0.92 ? "rain" : "fog";
        this.weatherTimer = 140 + Math.random() * 160;
      }
    }

    const targetCloud = this.weather === "sunny" ? 0.2 : this.weather === "cloudy" ? 0.8 : this.weather === "fog" ? 0.6 : 1;
    this.cloudCover += (targetCloud - this.cloudCover) * Math.min(1, dt * 0.15);
    this.clouds.visible = this.quality !== "low";
    const targetWet = this.weather === "rain" ? 1 : this.weather === "cloudy" ? 0.28 : this.weather === "fog" ? 0.2 : 0;
    this.wetness += (targetWet - this.wetness) * Math.min(1, dt * (targetWet ? 0.12 : 0.035));

    // Position du soleil et de la lune
    const k = this.sample(this.hour);
    const dayT = (this.hour - 6) / 12;
    const elev = Math.sin(Math.PI * Math.min(1, Math.max(0, dayT)));
    const isDay = this.hour > 6 && this.hour < 18;
    const az = (this.hour / 24) * Math.PI * 2;

    if (isDay) {
      this.sunDir.set(Math.cos(az) * 0.8, 0.15 + elev * 0.9, Math.sin(az) * 0.8).normalize();
    } else {
      this.sunDir.set(0.3, 0.9, -0.2).normalize();
    }

    this.nightFactor = THREE.MathUtils.clamp(1 - k.sunI / 1.2, 0, 1);
    const cloudDim = 1 - this.cloudCover * 0.45;

    this.sun.color.setHex(k.sun);
    this.sun.intensity = k.sunI * cloudDim;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 180);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    this.hemi.intensity = k.hemiI * (1 - this.cloudCover * 0.25);

    // Dérive des nuages dans le ciel
    this.clouds.position.x = focus.x + (Date.now() * 0.002) % 400;
    this.clouds.position.z = focus.z + (Date.now() * 0.001) % 400;
    this.cloudMat.opacity = THREE.MathUtils.lerp(0.2, 0.65, this.cloudCover);

    // Ombres portées des nuages glissant sur le sol
    if (this.groundShadow) {
      this.groundShadow.position.set(focus.x, 0.032, focus.z);
      this.groundShadowTex.offset.x = (this.groundShadowTex.offset.x + dt * 0.006) % 1;
      this.groundShadowTex.offset.y = (this.groundShadowTex.offset.y + dt * 0.003) % 1;

      let targetShadow = 0;
      if (isDay && elev > 0.03 && this.quality !== "low") {
        if (this.weather === "rain") targetShadow = 0.44;
        else if (this.weather === "cloudy") targetShadow = 0.38;
        else if (this.weather === "fog") targetShadow = 0.08;
        else targetShadow = 0.16; // soleil : ombres de cumulus éparses
      }
      this.groundShadowMat.opacity += (targetShadow - this.groundShadowMat.opacity) * Math.min(1, dt * 1.8);
      this.groundShadow.visible = this.quality !== "low" && this.groundShadowMat.opacity > 0.01;
    }

    // Étoiles de nuit
    this.starsMat.opacity = Math.max(0, (this.nightFactor - 0.45) * 1.8);
    this.stars.position.copy(focus);

    // Animation de la pluie (gouttes tropicales inclinées avec le vent)
    const isRaining = this.weather === "rain";
    const targetRainOp = isRaining ? 0.75 : 0;
    this.rainMat.opacity += (targetRainOp - this.rainMat.opacity) * Math.min(1, dt * 2.5);
    this.rain.visible = this.rainMat.opacity > 0.01;

    const windX = 6;
    const windZ = 2.5;

    if (this.rain.visible) {
      this.rain.position.set(focus.x, 0, focus.z);
      const pos = this.rainPos;
      const count = this.rainCount;
      const fallSpeed = 54;
      for (let i = 0; i < count; i++) {
        pos[i * 3] += dt * windX;
        pos[i * 3 + 1] -= dt * fallSpeed;
        pos[i * 3 + 2] += dt * windZ;

        if (pos[i * 3] > 55) pos[i * 3] -= 110;
        else if (pos[i * 3] < -55) pos[i * 3] += 110;

        if (pos[i * 3 + 2] > 55) pos[i * 3 + 2] -= 110;
        else if (pos[i * 3 + 2] < -55) pos[i * 3 + 2] += 110;

        if (pos[i * 3 + 1] < 0) {
          pos[i * 3 + 1] = 46 + Math.random() * 6;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // Particules d'éclaboussures de pluie au sol
    const targetSplashOp = isRaining ? 0.8 : (this.wetness > 0.4 ? 0.35 : 0);
    this.splashMat.opacity += (targetSplashOp - this.splashMat.opacity) * Math.min(1, dt * 3.0);
    this.rainSplashes.visible = this.splashMat.opacity > 0.01;

    if (this.rainSplashes.visible) {
      this.rainSplashes.position.set(focus.x, 0, focus.z);
      const spos = this.splashPos;
      const svel = this.splashVel;
      const slife = this.splashLife;
      const scount = this.splashCount;

      for (let i = 0; i < scount; i++) {
        slife[i] -= dt;
        svel[i * 3 + 1] -= dt * 9.8;
        spos[i * 3] += svel[i * 3] * dt;
        spos[i * 3 + 1] += svel[i * 3 + 1] * dt;
        spos[i * 3 + 2] += svel[i * 3 + 2] * dt;

        if (slife[i] <= 0 || spos[i * 3 + 1] < 0.03) {
          spos[i * 3] = (Math.random() - 0.5) * 80;
          spos[i * 3 + 1] = 0.04 + Math.random() * 0.05;
          spos[i * 3 + 2] = (Math.random() - 0.5) * 80;
          svel[i * 3] = (Math.random() - 0.5) * 1.6 + windX * 0.12;
          svel[i * 3 + 1] = 0.9 + Math.random() * 1.5;
          svel[i * 3 + 2] = (Math.random() - 0.5) * 1.6 + windZ * 0.12;
          slife[i] = 0.14 + Math.random() * 0.16;
        }
      }
      this.rainSplashes.geometry.attributes.position.needsUpdate = true;
    }

    // Nappes de brume et brouillard volumétrique au ras du sol
    const isFoggy = this.weather === "fog";
    const isMorningMist = this.hour >= 5.5 && this.hour <= 7.2;
    const targetFogOp = isFoggy ? (this.quality === "low" ? 0.22 : 0.36) : (isMorningMist ? 0.14 : 0);
    this.fogMat.opacity += (targetFogOp - this.fogMat.opacity) * Math.min(1, dt * 1.6);
    this.fogParticles.visible = this.fogMat.opacity > 0.008;

    if (this.fogParticles.visible) {
      this.fogParticles.position.set(focus.x, 0, focus.z);
      const fpos = this.fogPos;
      const fvel = this.fogVel;
      const fphase = this.fogPhase;
      const fcount = this.fogCount;
      const t = Date.now() * 0.001;

      // Teinte de la brume harmonisée avec l'horizon
      this.fogMat.color.setHex(k.horizon);

      for (let i = 0; i < fcount; i++) {
        fpos[i * 3] += (fvel[i * 3] + Math.sin(t * 0.4 + fphase[i]) * 0.35) * dt;
        fpos[i * 3 + 1] = 1.6 + Math.sin(t * 0.6 + fphase[i]) * 0.8;
        fpos[i * 3 + 2] += (fvel[i * 3 + 2] + Math.cos(t * 0.3 + fphase[i]) * 0.35) * dt;

        if (fpos[i * 3] > 75) fpos[i * 3] -= 150;
        else if (fpos[i * 3] < -75) fpos[i * 3] += 150;

        if (fpos[i * 3 + 2] > 75) fpos[i * 3 + 2] -= 150;
        else if (fpos[i * 3 + 2] < -75) fpos[i * 3 + 2] += 150;
      }
      this.fogParticles.geometry.attributes.position.needsUpdate = true;
    }

    // Teinte du ciel
    const u = this.skyMat.uniforms;
    u.topColor.value.setHex(k.top);
    u.horizonColor.value.setHex(k.horizon);
    u.sunDir.value.copy(this.sunDir);
    u.sunColor.value.setHex(k.sun);
    u.sunGlow.value = isDay ? 1 - this.cloudCover * 0.7 : 0.2;

    // Brouillard équatorial
    if (this.scene.fog && this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(k.horizon);
      const isFoggy = this.weather === "fog";
      const fogTarget = isFoggy ? 90 : isRaining ? 180 : k.fogFar;
      this.scene.fog.far += (fogTarget - this.scene.fog.far) * Math.min(1, dt * 0.5);
    }
  }

  applyRoadWetness(roads: THREE.MeshStandardMaterial[]) {
    const wetRough = 0.45;
    const dryRough = 0.95;
    const r = THREE.MathUtils.lerp(dryRough, wetRough, this.wetness);
    for (const m of roads) m.roughness = r;
  }
}
