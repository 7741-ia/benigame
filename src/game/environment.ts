import * as THREE from "three";
import { makeClouds, makeRainStreak } from "./textures";

export type Weather = "sunny" | "cloudy" | "rain";
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

// Étalonnage jour/nuit (interpolé). Heures en 0..24.
const KEYS: SkyKey[] = [
  { h: 0, top: 0x070b1c, horizon: 0x141c33, sun: 0x8fa6ff, sunI: 0.22, hemiI: 0.4, fogFar: 260 },
  { h: 5, top: 0x0b1130, horizon: 0x2a2f52, sun: 0x9fb0ff, sunI: 0.24, hemiI: 0.42, fogFar: 260 },
  { h: 6.5, top: 0x3f5f95, horizon: 0xf0a562, sun: 0xffc48a, sunI: 0.9, hemiI: 0.55, fogFar: 320 },
  { h: 9, top: 0x4f9de0, horizon: 0xc9e2f2, sun: 0xfff1d8, sunI: 2.4, hemiI: 0.95, fogFar: 380 },
  { h: 13, top: 0x3f8fdc, horizon: 0xd6e9f5, sun: 0xffffff, sunI: 2.8, hemiI: 1.0, fogFar: 400 },
  { h: 16.5, top: 0x4c93d4, horizon: 0xe9d7b8, sun: 0xffe7c0, sunI: 2.1, hemiI: 0.9, fogFar: 380 },
  { h: 18.2, top: 0x35427a, horizon: 0xff8f5e, sun: 0xffa66a, sunI: 0.9, hemiI: 0.55, fogFar: 320 },
  { h: 19.5, top: 0x121a3f, horizon: 0x3b3562, sun: 0xb8a4ff, sunI: 0.26, hemiI: 0.42, fogFar: 270 },
  { h: 24, top: 0x070b1c, horizon: 0x141c33, sun: 0x8fa6ff, sunI: 0.22, hemiI: 0.4, fogFar: 260 },
];

const cA = new THREE.Color();
const cB = new THREE.Color();

export class Environment {
  hour = 10;
  /** vitesse du temps : 1 h de jeu = 40 s réelles */
  timeScale = 1 / 40;
  weather: Weather = "sunny";
  wetness = 0; // 0..1 chaussée mouillée
  cloudCover = 0; // 0..1
  nightFactor = 0; // 0..1
  private weatherTimer = 90;
  private skyMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.MeshBasicMaterial;
  private rain: THREE.Points;
  private rainPos: Float32Array;
  private rainMat: THREE.PointsMaterial;
  private sunDir = new THREE.Vector3(0.4, 0.8, 0.3);
  private quality: Quality = "high";

  constructor(
    private scene: THREE.Scene,
    private sun: THREE.DirectionalLight,
    private hemi: THREE.HemisphereLight
  ) {
    // ── dôme de ciel dégradé ──
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
          col += sunColor * pow(s, 260.0) * 1.6 * sunGlow;   // disque
          col += sunColor * pow(s, 8.0) * 0.18 * sunGlow;    // halo
          if (vDir.y < 0.0) col = mix(horizonColor, horizonColor * 0.6, clamp(-vDir.y * 4.0, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 14), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // ── nuages : plan texturé qui dérive ──
    this.cloudMat = new THREE.MeshBasicMaterial({
      map: makeClouds(),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      fog: false,
    });
    this.cloudMat.map!.repeat.set(3, 3);
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), this.cloudMat);
    this.clouds.rotation.x = Math.PI / 2;
    this.clouds.position.y = 110;
    this.clouds.renderOrder = -5;
    scene.add(this.clouds);

    // ── pluie : nuage de points autour de la caméra ──
    const n = 1400;
    this.rainPos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 70;
      this.rainPos[i * 3 + 1] = Math.random() * 40;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rainMat = new THREE.PointsMaterial({
      map: makeRainStreak(),
      size: 0.9,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0xdfe9f5,
    });
    this.rain = new THREE.Points(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    scene.add(sun.target);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.clouds.visible = q !== "low";
  }

  setHour(h: number) {
    this.hour = ((h % 24) + 24) % 24;
  }

  setWeather(w: Weather, instant = false) {
    this.weather = w;
    this.weatherTimer = 120 + Math.random() * 120;
    if (instant) {
      this.cloudCover = w === "sunny" ? 0.25 : w === "cloudy" ? 0.8 : 1;
      this.wetness = w === "rain" ? 1 : 0;
      this.rainMat.opacity = w === "rain" ? 0.7 : 0;
    }
  }

  /** adhérence : 1 = sec, ~0.7 = chaussée détrempée */
  gripFactor() {
    return 1 - this.wetness * 0.3;
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

    // ── météo : change toutes les 2 à 4 minutes ──
    if (playing) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        const r = Math.random();
        this.weather = r < 0.5 ? "sunny" : r < 0.8 ? "cloudy" : "rain";
        this.weatherTimer = 120 + Math.random() * 140;
      }
    }
    const targetCloud = this.weather === "sunny" ? 0.25 : this.weather === "cloudy" ? 0.8 : 1;
    this.cloudCover += (targetCloud - this.cloudCover) * Math.min(1, dt * 0.15);
    const targetWet = this.weather === "rain" ? 1 : 0;
    this.wetness += (targetWet - this.wetness) * Math.min(1, dt * (targetWet ? 0.12 : 0.035));

    // ── soleil : lever 6 h, coucher 18 h ──
    const k = this.sample(this.hour);
    const dayT = (this.hour - 6) / 12; // 0 au lever, 1 au coucher
    const elev = Math.sin(Math.PI * Math.min(1, Math.max(0, dayT)));
    const isDay = this.hour > 6 && this.hour < 18;
    const az = (this.hour / 24) * Math.PI * 2;
    if (isDay) {
      this.sunDir.set(Math.cos(az) * 0.8, 0.15 + elev * 0.9, Math.sin(az) * 0.8).normalize();
    } else {
      // « lune » : faible lumière bleutée venant de haut
      this.sunDir.set(0.3, 0.9, -0.2).normalize();
    }
    this.nightFactor = THREE.MathUtils.clamp(1 - k.sunI / 1.2, 0, 1);
    const cloudDim = 1 - this.cloudCover * 0.45;

    this.sun.color.setHex(k.sun);
    this.sun.intensity = k.sunI * cloudDim;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 160);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    this.hemi.intensity = k.hemiI * (1 - this.cloudCover * 0.25);
    this.hemi.color.setHex(k.top).lerp(cB.setHex(0xffffff), 0.35);
    this.hemi.groundColor.setHex(0x6b4a2a).lerp(cB.setHex(k.horizon), 0.35);

    // ciel + brouillard cohérents
    const top = cA.setHex(k.top).lerp(cB.setHex(0x8c9aa8), this.cloudCover * 0.7).clone();
    const horizon = cA.setHex(k.horizon).lerp(cB.setHex(0xb8c2cc), this.cloudCover * 0.6).clone();
    (this.skyMat.uniforms.topColor.value as THREE.Color).copy(top);
    (this.skyMat.uniforms.horizonColor.value as THREE.Color).copy(horizon);
    (this.skyMat.uniforms.sunDir.value as THREE.Vector3).copy(this.sunDir);
    (this.skyMat.uniforms.sunColor.value as THREE.Color).setHex(k.sun);
    this.skyMat.uniforms.sunGlow.value = isDay ? 1 - this.cloudCover * 0.8 : 0;
    this.sky.position.copy(focus);
    if (this.scene.fog) {
      const fog = this.scene.fog as THREE.Fog;
      fog.color.copy(horizon);
      fog.far = k.fogFar - this.cloudCover * 60 - this.wetness * 40;
      fog.near = fog.far * 0.32;
    }

    // nuages
    this.cloudMat.opacity = 0.15 + this.cloudCover * 0.65;
    this.cloudMat.color.setHex(k.top).lerp(cB.setHex(0xffffff), 0.75 - this.nightFactor * 0.6);
    this.cloudMat.map!.offset.x += dt * 0.004;
    this.clouds.position.x = focus.x;
    this.clouds.position.z = focus.z;

    // pluie
    const raining = this.weather === "rain" && this.quality !== "low";
    this.rain.visible = raining || this.rainMat.opacity > 0.01;
    this.rainMat.opacity += ((raining ? 0.7 : 0) - this.rainMat.opacity) * Math.min(1, dt * 0.8);
    if (this.rain.visible) {
      const p = this.rainPos;
      for (let i = 0; i < p.length; i += 3) {
        p[i + 1] -= dt * 38;
        if (p[i + 1] < 0) {
          p[i + 1] = 40;
          p[i] = (Math.random() - 0.5) * 70;
          p[i + 2] = (Math.random() - 0.5) * 70;
        }
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      this.rain.position.set(focus.x, 0, focus.z);
    }
  }

  /** libellé pour le HUD */
  clockLabel() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
}
