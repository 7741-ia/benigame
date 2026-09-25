import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { audio } from "./audio";
import { GRID_LINES, CELL, ROAD, WORLD, HALF } from "./constants";
import type { HudState, Upgrades } from "./types";
import { getVehicle, type Vehicle } from "./vehicles";
import { DISTRICTS, POIS, landmarkWorld, getDistrictAt, type Landmark, type Poi, type PoiType } from "./districts";
import { addMissionRecord } from "./storage";
import { buildSign, buildSpeedBump, buildPothole, buildStoneObstacle } from "./road";
import type { PlayerProfile } from "./life";
import { buildCity, type CityResult, type VisitableBuilding } from "./city";
import { buildKiosk } from "./props";
import { Environment, type Quality, type Weather } from "./environment";
import {
  buildCharacter,
  animateRig,
  recolorRig,
  randomLook,
  seededLook,
  makeSpeechBubble,
  RIG_SCALE,
  DEFAULT_MOVEMENT,
  type Rig,
  type Pose,
  type CharacterLook,
} from "./character";

/** bulle de texte flottante (« Merci ! ») avec fondu */
interface Bubble {
  sprite: THREE.Sprite;
  follow: THREE.Object3D;
  life: number;
  total: number;
}

export type CameraView = "exterieure" | "rapprochee" | "conduite";

function detectQuality(): Quality {
  const saved = localStorage.getItem("beni_quality") as Quality | null;
  if (saved === "low" || saved === "medium" || saved === "high") return saved;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 4;
  if (mobile && (cores <= 4 || mem <= 3)) return "low";
  if (mobile) return "medium";
  return "high";
}

interface Callbacks {
  /** signale l'utilisation d'un commerce (pour petits effets UI) */
  onHud: (h: HudState) => void;
  onPoiUsed?: (kind: PoiType, label: string) => void;
  onDelivery: (reward: number, combo: number, x: number, y: number) => void;
  onLevelComplete: (level: number) => void;
  onGameOver: (score: number, money: number) => void;
  onVictory: (score: number, money: number) => void;
  onArrived?: (label: string) => void;
  onNpcGreet?: (message: string) => void;
}

/** voiture qui roule sur la grille */
interface Car {
  mesh: THREE.Object3D;
  axis: "x" | "z";
  line: number; // grid line index it drives along
  dir: number; // +1 / -1
  pos: number; // position along axis (world coord)
  lane: number; // offset from centerline
  speed: number;
}

/** piéton ambulant : marche le long d'un trottoir, s'écarte des véhicules */
interface Ped {
  mesh: THREE.Object3D;
  rig: Rig;
  vx: number;
  vz: number;
  timer: number;
  alive: boolean;
  respawn: number;
  axis: "x" | "z";
  line: number;
  side: number;
  dir: number;
  flee: number;
  walkSpeed: number;
  /** cap affiché (tourne progressivement, pas de demi-tour instantané) */
  yaw: number;
  /** pause naturelle (regarde une vitrine, discute) */
  pause: number;
  greet: number;
}

  // habitant qui vient donner/recevoir un colis
interface Courier {
  mesh: THREE.Group;
  rig: Rig;
  from: THREE.Vector2;
  to: THREE.Vector2;
  t: number;
  state: "come" | "wait" | "leave";
  waitT: number;
  cheer?: boolean;
}

  // colis qui vole en arc entre deux points (animation de remise)
interface FlyBox {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
}

/** feu tricolore avec deux directions */
interface TrafficLight {
  x: number;
  z: number;
  greenNS: boolean; // green for north-south
  timer: number;
  bulbsNS: THREE.Mesh[];
  bulbsEW: THREE.Mesh[];
}

const MAX_LEVEL = 5;

export class Game {
  /** prix des services (affichés dans l'UI) */
  static readonly PRICES = { meal: 8, drink: 5 } as const;
  private canvas: HTMLCanvasElement;
  private cb: Callbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;

  // bike
  private bike = new THREE.Group();
  private frontWheel = new THREE.Object3D();
  private rearWheel = new THREE.Object3D();
  private bikeTilt = new THREE.Group();
  private pos = new THREE.Vector2(0, 0);
  private heading = 0;
  private speed = 0;
  private vehicle: Vehicle = getVehicle("moto");
  private pickupLabel = "";
  private deliverLabel = "";

  // input
  private keys: Record<string, boolean> = {};
  // entrées tactiles
  private touchThrottle = 0;
  private touchSteer = 0;
  private touchBrake = false;
  private touchNitro = false;

  // world objects
  private buildings: { x: number; z: number; hw: number; hd: number }[] = [];
  private cars: Car[] = [];
  private peds: Ped[] = [];
  private lights: TrafficLight[] = [];
  private couriers: Courier[] = [];
  private flyboxes: FlyBox[] = [];

  // markers
  private pickupMarker!: THREE.Group;
  private deliverMarker!: THREE.Group;
  private navMarker!: THREE.Group;
  private hasPackage = false;
  private navActive = false;
  private navLabel = "";
  private navPos = new THREE.Vector2();

  // particles
  private particles!: THREE.Points;
  private pGeo!: THREE.BufferGeometry;
  private pPos!: Float32Array;
  private pVel!: Float32Array;
  private pLife!: Float32Array;
  private pColor!: Float32Array;
  private pCount = 400;
  private pHead = 0;

  // state
  /** phase courante du jeu */
  phase: HudState["phase"] = "menu";
  private money = 0;
  private score = 0;
  private level = 1;
  private timeLeft = 0;
  private timeTotal = 0;
  private deliveriesDone = 0;
  private deliveriesNeeded = 20; // 20 missions par niveau
  private combo = 1;
  private shake = 0;
  private crashCooldown = 0;
  private hazardCooldown = 0;
  private upgrades: Upgrades = { engine: 0, handling: 0, boost: 0, tires: 0 };
  private packageMesh!: THREE.Object3D;
  private hudAccum = 0;
  /** mobile : moins d'effets pour tenir les 60 fps */
  private isMobile = false;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  // fines & jail
  private fineAmount = 0;
  private jailTime = 0;
  // fatigue (restaure au restaurant) + commerces à proximité
  private fatigue = 0;
  private nearPoi: Poi | null = null;
  private poiCooldown = 0; // évite de spammer un commerce
  private poiMeshes: { poi: Poi; mesh: THREE.Object3D }[] = [];
  private shopReturn: "menu" | "playing" = "menu";
  private missionsCompleted = 0;
  private freeRoam = false;
  private playerMode: "vehicle" | "walk" = "vehicle";
  private walker = new THREE.Group();
  private walkerHeading = 0;
  private walkerRig!: Rig;
  private walkerPackage!: THREE.Mesh;
  private bikeRider: THREE.Object3D | null = null;
  private riderRig: Rig | null = null;
  private nearNpc: Ped | null = null;
  private socialAnimTimer = 0;
  /** pose sociale en cours (salut / remise) */
  private socialPose: Pose = "wave";
  private hunger = 10;
  private playerLook: CharacterLook = {
    ...randomLook(),
    skin: 0x5b3a24,
    top: 0x2196f3,
    hairStyle: "court",
    outfit: "tshirt",
    accessory: "none",
    female: false,
    height: 1.0,
    build: 1.0,
  };
  private bubbles: Bubble[] = [];
  /** transition monter/descendre : 0 = terminé, sinon temps restant (s) */
  private mountT = 0;
  private mountDir: "in" | "out" = "out";
  private mountFrom = new THREE.Vector3();
  private mountTo = new THREE.Vector3();
  private lastWalkPos = new THREE.Vector2();
  private clientRig: Rig | null = null;
  private clientTalkT = 0;
  private homeRoom: HudState["homeRoom"] = "outside";
  // nitro boost (cool feature)
  private nitroCharge = 0;
  private nitroMax = 100;
  private nitroActive = false;
  private nitroTimer = 0;
  private nitroWasPressed = false;
  // road hazards
  private signs: THREE.Group[] = [];
  private speedBumps: THREE.Group[] = [];
  private potholes: THREE.Group[] = [];
  private stoneObstacles: THREE.Group[] = [];

  // ── rendu réaliste : environnement, météo, qualité ──
  private env!: Environment;
  private city!: CityResult;
  quality: Quality = "high";
  private pmremTex: THREE.Texture | null = null;
  // ── conduite : régulateur, suspension, vues caméra ──
  private cruiseOn = false;
  private cruiseTarget = 0; // km/h
  private cameraView: CameraView = "exterieure";
  private camFov = 60;
  private prevSpeed = 0;
  private pitchVis = 0;
  private bounceVis = 0;
  private bounceVel = 0;
  private camLook = new THREE.Vector3();
  // ── livraison immersive : arrivée → se garer → descendre → remettre ──
  private deliveryStage: "drive" | "arrived" | "handover" = "drive";
  private clientNpc: THREE.Group | null = null;
  private clientWave = 0;
  private idlePeds: THREE.Group[] = [];
  private stepTimer = 0;
  private runToggled = false;
  private currentBuilding: VisitableBuilding | null = null;
  private currentRoom: { name: string; x: number; z: number; icon: string } | null = null;

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.canvas = canvas;
    this.cb = cb;

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
    this.isMobile = isMobile;
    this.quality = detectQuality();
    // sur mobile, moins de personnages visibles simultanément (voir spawnTraffic)
    if (this.isMobile && this.quality === "high") this.quality = "medium";
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality !== "low",
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === "low" ? 1 : this.quality === "medium" ? 1.5 : 2));
    this.renderer.shadowMap.enabled = this.quality !== "low";
    this.renderer.shadowMap.type = this.quality === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x9fd3e8, 120, 380);

    // reflets PBR (véhicules, vitres, chaussée mouillée) via une carte d'environnement légère
    if (this.quality !== "low") {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.pmremTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = this.pmremTex;
      this.scene.environmentIntensity = 0.35;
      pmrem.dispose();
    }

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1200);
    this.camera.position.set(0, 20, 30);

    this.buildWorld();
    this.env = new Environment(this.scene, this.sun, this.hemi);
    this.env.setQuality(this.quality);
    this.buildBike();
    this.buildWalker();
    this.buildMarkers();
    this.buildPois();
    this.buildParticles();

    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.loop();
  }

  // ---------- world building ----------
  private lineCoord(i: number) {
    return i * CELL - HALF;
  }

  private buildWorld() {
    // lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8b6f47, 0.9);
    this.hemi = hemi;
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
    this.sun = sun;
    sun.position.set(80, 120, 40);
    sun.castShadow = true;
    const shadowRes = this.quality === "high" ? 2048 : 1024;
    sun.shadow.mapSize.set(shadowRes, shadowRes);
    // ombres nettes autour du joueur (la caméra d'ombre suit le joueur à chaque image)
    const d = 90;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    this.scene.add(sun);

    // ville détaillée : sol, routes texturées, trottoirs, bâtiments fusionnés, instances
    this.city = buildCity(this.scene, this.quality);
    this.buildings.push(...this.city.colliders);

    // feux de circulation à certains carrefours
    for (let i = 1; i < GRID_LINES - 1; i++) {
       for (let j = 1; j < GRID_LINES - 1; j++) {
         if ((i + j) % 2 === 0) continue;
         if (Math.random() < 0.45) continue;
         this.buildTrafficLight(this.lineCoord(i), this.lineCoord(j));
       }
     }
     this.buildStreetFurniture();
   }

  private buildStreetFurniture() {
    // panneaux STOP aux carrefours
    for (let i = 1; i < GRID_LINES - 1; i++) {
      for (let j = 1; j < GRID_LINES - 1; j++) {
        if (Math.random() < 0.3) {
          const x = this.lineCoord(i);
          const z = this.lineCoord(j);
          const offset = ROAD / 2 + 2;
          this.signs.push(
            buildSign("stop", this.scene, x + offset, z + offset, Math.random() * Math.PI * 2)
          );
        }
      }
    }
    // Add yield signs at roadside spots (never inside building blocks)
    for (let i = 0; i < 6; i++) {
      const line = 1 + Math.floor(Math.random() * (GRID_LINES - 2));
      const c = this.lineCoord(line);
      const pos = (Math.random() - 0.5) * WORLD * 0.8;
      const offset = ROAD / 2 + 2;
      if (Math.random() < 0.5) {
        this.signs.push(buildSign("yield", this.scene, pos, c + offset));
      } else {
        this.signs.push(buildSign("yield", this.scene, c + offset, pos));
      }
    }
    // Add speed bumps on main roads — keep REAL mesh references for collisions
    for (let i = 0; i < 6; i++) {
      const line = 1 + Math.floor(Math.random() * (GRID_LINES - 2));
      const c = this.lineCoord(line);
      const pos = Math.random() * WORLD * 0.8 - WORLD * 0.4;
      if (Math.random() < 0.5) {
        this.speedBumps.push(buildSpeedBump(this.scene, pos, c, "z"));
      } else {
        this.speedBumps.push(buildSpeedBump(this.scene, c, pos, "x"));
      }
    }
    // Add potholes on roads only
    for (let i = 0; i < 8; i++) {
      const line = 1 + Math.floor(Math.random() * (GRID_LINES - 2));
      const c = this.lineCoord(line);
      const pos = (Math.random() - 0.5) * WORLD * 0.9;
      if (Math.random() < 0.5) {
        this.potholes.push(buildPothole(this.scene, pos, c + (Math.random() - 0.5) * ROAD * 0.5));
      } else {
        this.potholes.push(buildPothole(this.scene, c + (Math.random() - 0.5) * ROAD * 0.5, pos));
      }
    }
    // Add stone obstacles on roads only
    for (let i = 0; i < 5; i++) {
      const line = 1 + Math.floor(Math.random() * (GRID_LINES - 2));
      const c = this.lineCoord(line);
      const pos = (Math.random() - 0.5) * WORLD * 0.9;
      if (Math.random() < 0.5) {
        this.stoneObstacles.push(buildStoneObstacle(this.scene, pos, c));
      } else {
        this.stoneObstacles.push(buildStoneObstacle(this.scene, c, pos));
      }
    }
  }

  private buildTrafficLight(x: number, z: number) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 7, 6),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2b })
    );
    pole.position.set(0, 3.5, 0);
    pole.castShadow = true;
    g.add(pole);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 3, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x1b1b1b })
    );
    box.position.set(0, 6.5, 0);
    g.add(box);
    const mk = (color: number, y: number, dir: "z" | "x") => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 10, 10),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 })
      );
      // face the correct travel direction: NS lights on Z face, EW lights on X face
      if (dir === "z") m.position.set(0, y, 0.65);
      else m.position.set(0.65, y, 0);
      g.add(m);
      return m;
    };
    const redNS = mk(0xff3b30, 7.4, "z");
    const greenNS = mk(0x34c759, 5.6, "z");
    const redEW = mk(0xff3b30, 7.4, "x");
    const greenEW = mk(0x34c759, 5.6, "x");
    const offset = ROAD / 2 + 1.2;
    g.position.set(x + offset, 0, z + offset);
    this.scene.add(g);
    this.lights.push({
      x,
      z,
      greenNS: Math.random() < 0.5,
      timer: Math.random() * 6,
      bulbsNS: [redNS, greenNS],
      bulbsEW: [redEW, greenEW],
    });
  }

  // ---------- moto ----------
  private headlight: THREE.SpotLight | null = null;

  private buildBike() {
    this.bike.add(this.bikeTilt);
    this.rebuildVehicleMesh();
    // phare réel : éclaire la route la nuit (une seule lumière dynamique, sans ombre)
    if (this.quality !== "low") {
      this.headlight = new THREE.SpotLight(0xfff1cf, 0, 60, 0.5, 0.55, 1.2);
      this.headlight.position.set(0, 0.9, 0.8);
      this.headlight.target.position.set(0, 0.2, 40);
      this.bike.add(this.headlight, this.headlight.target);
    }
    // faisceau au sol (toutes qualités) : tache lumineuse additive devant le véhicule la nuit
    const beamGeo = new THREE.PlaneGeometry(7, 16);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0.05, 10);
    this.headBeam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffe2a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.headBeam.renderOrder = 2;
    this.bike.add(this.headBeam);
    this.scene.add(this.bike);
  }
  private headBeam: THREE.Mesh | null = null;

  private rebuildVehicleMesh() {
    // clear tilt group
    this.bikeRider = null;
    while (this.bikeTilt.children.length) {
      const c = this.bikeTilt.children[0];
      this.bikeTilt.remove(c);
    }
    const v = this.vehicle;
    const bodyMat = new THREE.MeshStandardMaterial({ color: v.color, roughness: 0.32, metalness: 0.55 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x9fc3d9, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.42,
    });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.3, metalness: 0.8 });

    const mkWheel = (radius = 0.75, width = 0.4) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), wheelMat);
      w.rotation.z = Math.PI / 2;
      w.castShadow = true;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 12), rimMat);
      rim.rotation.z = Math.PI / 2;
      const holder = new THREE.Object3D();
      holder.add(w, rim);
      return holder;
    };

    // livreur articulé : penché sur la moto (casque), ou assis sur le siège conducteur (voitures)
    const addRider = (z = -0.2, _shirtColor = 0x2196f3, seated = false, seatY = 0) => {
      const rider = new THREE.Group();
      rider.name = "bike-rider";
      const look: CharacterLook = { ...this.playerLook, accessory: seated ? this.playerLook.accessory : "casque" };
      const rig = buildCharacter(look, "high");
      rig.root.scale.setScalar(RIG_SCALE);
      rider.add(rig.root);
      // pose figée par la fonction d'animation (mains au guidon / au volant, genoux pliés)
      animateRig(rig, 1, seated ? "sit" : "ride", 0);
      animateRig(rig, 1, seated ? "sit" : "ride", 0);
      // En pose assise/moto, animateRig abaisse les hanches (sitDrop) : on place le groupe
      // pour que les hanches (après abaissement) tombent exactement sur la selle / le siège.
      const scale = RIG_SCALE;
      const hipsAfterPose = rig.hips.position.y * scale; // hauteur des hanches (repère du rig) une fois posé
      if (seated) {
        // hanches sur le siège, cuisses à l'horizontale, pieds vers les pédales
        rider.position.set(0, seatY + 0.36 - hipsAfterPose, z);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 8, 20), darkMat);
        wheel.position.set(0, hipsAfterPose + 0.5, 0.5);
        wheel.rotation.x = -1.0;
        rider.add(wheel);
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), darkMat);
        column.position.set(0, hipsAfterPose + 0.32, 0.66);
        column.rotation.x = 1.0;
        rider.add(column);
      } else {
        // moto : le bassin repose sur la selle (dessus de selle à 0.83 m)
        rider.position.set(0, 0.86 - hipsAfterPose, z);
      }
      rider.visible = this.playerMode === "vehicle";
      this.bikeRider = rider;
      this.riderRig = rig;
      this.bikeTilt.add(rider);
    };

    const t = v.bodyType;
    if (t === "van") {
      // camionnette : cabine vitrée + caisse
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 2.1), bodyMat);
      cab.position.set(0, 1.35, 1.35);
      cab.castShadow = true;
      this.bikeTilt.add(cab);
      const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.5, 3.2), bodyMat);
      cargo.position.set(0, 1.75, -1.0);
      cargo.castShadow = true;
      this.bikeTilt.add(cargo);
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 0.1), glassMat);
      windshield.position.set(0, 1.75, 2.42);
      this.bikeTilt.add(windshield);
      for (const sx of [-1, 1]) {
        const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 1.2), glassMat);
        sideGlass.position.set(sx * 1.12, 1.8, 1.45);
        this.bikeTilt.add(sideGlass);
        const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.1), darkMat);
        mirror.position.set(sx * 1.25, 1.85, 2.1);
        this.bikeTilt.add(mirror);
      }
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.3, 0.25), darkMat);
      bumper.position.set(0, 0.55, 2.45);
      this.bikeTilt.add(bumper);
      this.frontWheel = mkWheel(0.62, 0.5);
      this.frontWheel.position.set(0, 0.62, 1.6);
      this.rearWheel = mkWheel(0.62, 0.5);
      this.rearWheel.position.set(0, 0.62, -1.6);
      this.bikeTilt.add(this.frontWheel, this.rearWheel);
      addRider(0.9, 0x2196f3, true, 0.7);
    } else if (t === "tuktuk") {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.9, 2.6), bodyMat);
      cabin.position.set(0, 1.45, -0.4);
      cabin.castShadow = true;
      this.bikeTilt.add(cabin);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 2.9), darkMat);
      roof.position.set(0, 2.5, -0.4);
      this.bikeTilt.add(roof);
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.08), glassMat);
      windshield.position.set(0, 1.9, 0.94);
      this.bikeTilt.add(windshield);
      const front = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10), bodyMat);
      front.rotation.x = Math.PI / 2;
      front.position.set(0, 1.0, 1.4);
      this.bikeTilt.add(front);
      this.frontWheel = mkWheel(0.55);
      this.frontWheel.position.set(0, 0.55, 1.6);
      this.rearWheel = mkWheel(0.6);
      this.rearWheel.position.set(0, 0.6, -1.3);
      this.bikeTilt.add(this.frontWheel, this.rearWheel);
      addRider(-0.3, 0x2196f3, true, 0.85);
    } else {
      // deux-roues à l'échelle réelle : roues Ø 0.6 m, selle à 0.8 m, empattement ≈ 1.4 m
      const isScooter = t === "scooter";
      const isSport = t === "sport";
      const wheelBase = isSport ? 1.5 : isScooter ? 1.3 : 1.4;
      const wr = isScooter ? 0.25 : 0.31;
      const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.9 });
      // cadre / carénage
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, wheelBase * 0.75), bodyMat);
      frame.position.set(0, 0.55, 0.05);
      frame.castShadow = true;
      this.bikeTilt.add(frame);
      const engine = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.5), darkMat);
      engine.position.set(0, 0.42, 0.1);
      this.bikeTilt.add(engine);
      // réservoir (arrondi) ou tablier de scooter
      if (isScooter) {
        const apron = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.16), bodyMat);
        apron.position.set(0, 0.68, 0.55);
        this.bikeTilt.add(apron);
        const floor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.6), darkMat);
        floor.position.set(0, 0.3, 0.2);
        this.bikeTilt.add(floor);
      } else {
        const tank = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), bodyMat);
        tank.scale.set(0.9, 0.7, 1.4);
        tank.position.set(0, 0.78, 0.32);
        tank.castShadow = true;
        this.bikeTilt.add(tank);
      }
      if (isSport) {
        const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.6), bodyMat);
        fairing.position.set(0, 0.68, 0.72);
        this.bikeTilt.add(fairing);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.03), glassMat);
        screen.position.set(0, 0.98, 0.82);
        screen.rotation.x = -0.5;
        this.bikeTilt.add(screen);
      }
      // selle (dessus à 0.8 m) + porte-bagages
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.7), darkMat);
      seat.position.set(0, 0.78, -0.25);
      this.bikeTilt.add(seat);
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.3), chrome);
      rack.position.set(0, 0.8, -0.72);
      this.bikeTilt.add(rack);
      // fourche + guidon + rétroviseurs
      for (const sx of [-1, 1]) {
        const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6), chrome);
        fork.position.set(sx * 0.07, 0.6, wheelBase / 2 - 0.02);
        fork.rotation.x = -0.42;
        this.bikeTilt.add(fork);
        const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.03), darkMat);
        mirror.position.set(sx * 0.3, 1.12, 0.5);
        this.bikeTilt.add(mirror);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 4), chrome);
        stem.position.set(sx * 0.26, 1.04, 0.52);
        this.bikeTilt.add(stem);
        // garde-boue
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.66, 8), chrome);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 0.98, 0.56);
      this.bikeTilt.add(bar);
      for (const sx of [-1, 1]) {
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), darkMat);
        grip.rotation.z = Math.PI / 2;
        grip.position.set(sx * 0.3, 0.98, 0.56);
        this.bikeTilt.add(grip);
      }
      // phare
      const hl = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.8 })
      );
      hl.position.set(0, 0.86, wheelBase / 2 + 0.12);
      this.bikeTilt.add(hl);
      // pot d'échappement
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.7, 8), chrome);
      pipe.rotation.x = Math.PI / 2 - 0.12;
      pipe.position.set(0.16, 0.36, -0.35);
      this.bikeTilt.add(pipe);
      // garde-boue
      const fenderF = new THREE.Mesh(new THREE.CylinderGeometry(wr + 0.04, wr + 0.04, 0.12, 12, 1, false, Math.PI * 0.15, Math.PI * 0.7), bodyMat);
      fenderF.rotation.z = Math.PI / 2;
      fenderF.rotation.y = Math.PI / 2;
      fenderF.position.set(0, wr, wheelBase / 2);
      this.bikeTilt.add(fenderF);
      const fenderR = fenderF.clone();
      fenderR.position.set(0, wr, -wheelBase / 2);
      this.bikeTilt.add(fenderR);
      // roues
      this.frontWheel = mkWheel(wr, 0.1);
      this.frontWheel.position.set(0, wr, wheelBase / 2);
      this.rearWheel = mkWheel(wr, 0.12);
      this.rearWheel.position.set(0, wr, -wheelBase / 2);
      this.bikeTilt.add(this.frontWheel, this.rearWheel);
      // béquille latérale
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 5), chrome);
      stand.position.set(-0.16, 0.2, -0.2);
      stand.rotation.z = 0.45;
      this.bikeTilt.add(stand);
      addRider(-0.22);
    }

    // caisse de livraison à l'arrière (top-case), proportionnée au véhicule
    const isTwoWheel = t !== "van" && t !== "tuktuk";
    const pkg = new THREE.Mesh(
      new THREE.BoxGeometry(isTwoWheel ? 0.42 : 1.0, isTwoWheel ? 0.4 : 1.0, isTwoWheel ? 0.42 : 1.0),
      new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.9 })
    );
    if (isTwoWheel) pkg.position.set(0, 1.02, -0.72);
    else pkg.position.set(0, 2.0, -1.7);
    pkg.castShadow = true;
    pkg.visible = this.hasPackage && this.playerMode === "vehicle";
    this.bikeTilt.add(pkg);
    this.packageMesh = pkg;
  }

  private buildWalker() {
    // personnage du joueur (échelle ~1.7 m ; le monde utilise ~1 unité = 1 m)
    this.walkerRig = buildCharacter(this.playerLook, "high");
    this.walkerRig.root.scale.setScalar(RIG_SCALE);
    this.walker.add(this.walkerRig.root);

    // colis porté à deux mains devant soi (attaché à la main droite)
    this.walkerPackage = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.9 })
    );
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.31), new THREE.MeshStandardMaterial({ color: 0xa8763e, roughness: 0.8 }));
    this.walkerPackage.add(tape);
    this.walkerPackage.position.set(-0.14, -0.02, 0.12);
    this.walkerPackage.visible = false;
    this.walkerPackage.castShadow = true;
    this.walkerRig.handR.add(this.walkerPackage);

    this.walker.visible = false;
    this.scene.add(this.walker);
  }

  /** message flottant au-dessus d'un personnage, disparaît en fondu */
  private say(follow: THREE.Object3D, text: string, seconds = 2.6) {
    const sprite = makeSpeechBubble(text);
    this.scene.add(sprite);
    this.bubbles.push({ sprite, follow, life: seconds, total: seconds });
  }

  private updateBubbles(dt: number) {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.life -= dt;
      const p = new THREE.Vector3();
      b.follow.getWorldPosition(p);
      b.sprite.position.set(p.x, p.y + 2.35 + (1 - b.life / b.total) * 0.3, p.z);
      const t = b.life / b.total;
      (b.sprite.material as THREE.SpriteMaterial).opacity = t < 0.3 ? t / 0.3 : Math.min(1, (1 - t) / 0.12);
      if (b.life <= 0) {
        this.scene.remove(b.sprite);
        (b.sprite.material as THREE.SpriteMaterial).map?.dispose();
        (b.sprite.material as THREE.SpriteMaterial).dispose();
        this.bubbles.splice(i, 1);
      }
    }
  }

  // ---------- markers ----------
  private makeBeacon(color: number) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 0.2, 24, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    ring.position.y = 0.1;
    g.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.2, 18, 16, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    beam.position.y = 9;
    g.add(beam);
    const orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7 })
    );
    orb.position.y = 4;
    g.add(orb);
    (g as any)._orb = orb;
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  private buildMarkers() {
    this.pickupMarker = this.makeBeacon(0xffd93d);
    this.deliverMarker = this.makeBeacon(0x34c759);
    this.navMarker = this.makeBeacon(0x38bdf8);
  }

  // ---------- particles ----------
  private buildParticles() {
    this.pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(this.pCount * 3);
    this.pVel = new Float32Array(this.pCount * 3);
    this.pLife = new Float32Array(this.pCount);
    this.pColor = new Float32Array(this.pCount * 3);
    for (let i = 0; i < this.pCount; i++) {
      this.pPos[i * 3 + 1] = -100;
    }
    this.pGeo.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute("color", new THREE.BufferAttribute(this.pColor, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.6,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.particles = new THREE.Points(this.pGeo, mat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  private spawnParticle(x: number, y: number, z: number, color: THREE.Color, spread: number, up: number, life: number) {
    const i = this.pHead;
    this.pHead = (this.pHead + 1) % this.pCount;
    this.pPos[i * 3] = x;
    this.pPos[i * 3 + 1] = y;
    this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = (Math.random() - 0.5) * spread;
    this.pVel[i * 3 + 1] = up + Math.random() * up;
    this.pVel[i * 3 + 2] = (Math.random() - 0.5) * spread;
    this.pLife[i] = life;
    this.pColor[i * 3] = color.r;
    this.pColor[i * 3 + 1] = color.g;
    this.pColor[i * 3 + 2] = color.b;
  }

  private burst(x: number, y: number, z: number, color: number, n: number, spread = 8, up = 6, life = 0.9) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) this.spawnParticle(x, y, z, c, spread, up, life);
  }

  private updateParticles(dt: number) {
    for (let i = 0; i < this.pCount; i++) {
      if (this.pLife[i] > 0) {
        this.pLife[i] -= dt;
        this.pVel[i * 3 + 1] -= 12 * dt; // gravity
        this.pPos[i * 3] += this.pVel[i * 3] * dt;
        this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
        this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
        if (this.pPos[i * 3 + 1] < 0 || this.pLife[i] <= 0) {
          this.pPos[i * 3 + 1] = -100;
          this.pLife[i] = 0;
        }
      }
    }
    this.pGeo.attributes.position.needsUpdate = true;
  }

  // ---------- traffic ----------
  private npcSeed = 1;

  /** personnage articulé (piéton, client, expéditeur) — apparence unique et déterministe */
  private makePerson(look?: CharacterLook, lod: "high" | "low" = "high"): { group: THREE.Group; rig: Rig } {
    const rig = buildCharacter(look ?? seededLook(this.npcSeed++), lod);
    rig.root.scale.setScalar(RIG_SCALE);
    const group = new THREE.Group();
    group.add(rig.root);
    return { group, rig };
  }

  /** éloigne un point de départ des façades pour que les PNJ ne sortent pas d'un mur */
  private freeSpotNear(x: number, z: number, radius: number) {
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2;
      const cx = Math.max(-HALF, Math.min(HALF, x + Math.cos(a) * radius));
      const cz = Math.max(-HALF, Math.min(HALF, z + Math.sin(a) * radius));
      if (!this.insideBuilding(cx, cz)) return new THREE.Vector2(cx, cz);
    }
    return new THREE.Vector2(x, z);
  }

  // un habitant marche jusqu'au point de remise, puis repart
  private spawnCourier(mx: number, mz: number, px: number, pz: number) {
    const { group: mesh, rig } = this.makePerson();
    const start = this.freeSpotNear(mx, mz, 9);
    mesh.position.set(start.x, 0, start.y);
    this.scene.add(mesh);
    // se rencontre entre le repère et le joueur
    const tx = (mx + px) / 2;
    const tz = (mz + pz) / 2;
    this.couriers.push({
      mesh,
      rig,
      from: start.clone(),
      to: new THREE.Vector2(tx, tz),
      t: 0,
      state: "come",
      waitT: 1.4,
    });
  }

  // le colis vole en arc (animation)
  private throwPackage(from: THREE.Vector3, to: THREE.Vector3) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xd9a066 })
    );
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.flyboxes.push({ mesh, from: from.clone(), to: to.clone(), t: 0 });
  }

  /** tourne progressivement un angle vers une cible (évite les demi-tours instantanés) */
  private turnTo(current: number, target: number, rate: number, dt: number) {
    let d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const step = Math.min(Math.abs(d), rate * dt);
    return current + Math.sign(d) * step;
  }

  private updateCouriers(dt: number) {
    const walkSpeed = 3.2; // ≈ 11 km/h, allure d'un pas pressé
    for (let i = this.couriers.length - 1; i >= 0; i--) {
      const c = this.couriers[i];
      const dist = Math.max(0.01, c.from.distanceTo(c.to));
      const prev = c.mesh.position.clone();
      if (c.state === "come") {
        c.t = Math.min(1, c.t + (walkSpeed * dt) / dist);
        const x = c.from.x + (c.to.x - c.from.x) * c.t;
        const z = c.from.y + (c.to.y - c.from.y) * c.t;
        c.mesh.position.set(x, 0, z);
        c.mesh.rotation.y = this.turnTo(c.mesh.rotation.y, Math.atan2(c.to.x - c.from.x, c.to.y - c.from.y), 6, dt);
        animateRig(c.rig, dt, "walk", prev.distanceTo(c.mesh.position));
        if (c.t >= 1) c.state = "wait";
      } else if (c.state === "wait") {
        c.waitT -= dt;
        // face au joueur, remise du colis ou joie
        const target = Math.atan2(this.pos.x - c.mesh.position.x, this.pos.y - c.mesh.position.z);
        c.mesh.rotation.y = this.turnTo(c.mesh.rotation.y, target, 5, dt);
        animateRig(c.rig, dt, c.cheer ? "cheer" : "handover", 0);
        if (c.waitT <= 0) {
          c.state = "leave";
          c.t = 0;
        }
      } else {
        c.t = Math.min(1, c.t + (walkSpeed * dt) / dist);
        const x = c.to.x + (c.from.x - c.to.x) * c.t;
        const z = c.to.y + (c.from.y - c.to.y) * c.t;
        c.mesh.position.set(x, 0, z);
        c.mesh.rotation.y = this.turnTo(c.mesh.rotation.y, Math.atan2(c.from.x - c.to.x, c.from.y - c.to.y), 6, dt);
        animateRig(c.rig, dt, "walk", prev.distanceTo(c.mesh.position));
        if (c.t >= 1) {
          this.scene.remove(c.mesh);
          this.couriers.splice(i, 1);
        }
      }
    }
  }

  private updateFlyBoxes(dt: number) {
    for (let i = this.flyboxes.length - 1; i >= 0; i--) {
      const f = this.flyboxes[i];
      f.t = Math.min(1, f.t + dt / 0.55);
      const pos = new THREE.Vector3().lerpVectors(f.from, f.to, f.t);
      pos.y += Math.sin(f.t * Math.PI) * 3; // trajectoire en arc
      f.mesh.position.copy(pos);
      f.mesh.rotation.x += dt * 6;
      f.mesh.rotation.z += dt * 6;
      if (f.t >= 1) {
        this.burst(f.to.x, f.to.y, f.to.z, 0xffd93d, 8, 4, 3, 0.5);
        this.scene.remove(f.mesh);
        this.flyboxes.splice(i, 1);
      }
    }
  }

  private clearCouriers() {
    this.couriers.forEach((c) => this.scene.remove(c.mesh));
    this.couriers = [];
    this.flyboxes.forEach((f) => this.scene.remove(f.mesh));
    this.flyboxes = [];
  }

  private spawnTraffic() {
    // remove old
    this.cars.forEach((c) => this.scene.remove(c.mesh));
    this.peds.forEach((p) => this.scene.remove(p.mesh));
    this.cars = [];
    this.peds = [];

    const carColors = [0xc94a4a, 0x2b6cb0, 0x6b8e23, 0xd9a441, 0x5b4a8a, 0xe8e8e8, 0x2f2f2f, 0xb7b7b7];
    const glass = new THREE.MeshStandardMaterial({ color: 0x1d2a38, roughness: 0.12, metalness: 0.7 });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    const lowCount = this.quality === "low" ? 0.6 : 1;
    const numCars = Math.round((7 + this.level * 3) * lowCount);
    for (let i = 0; i < numCars; i++) {
      const axis: "x" | "z" = Math.random() < 0.5 ? "x" : "z";
      const line = Math.floor(Math.random() * GRID_LINES);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const lane = dir > 0 ? -ROAD / 4 : ROAD / 4;
      const carColor = carColors[Math.floor(Math.random() * carColors.length)];
      const kindRoll = Math.random();
      const kind: "car" | "moto" | "bus" = kindRoll < 0.45 ? "moto" : kindRoll < 0.85 ? "car" : "bus";
      const body = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: carColor, roughness: 0.35, metalness: 0.5 });
      if (kind === "moto") {
        // moto-taxi : le moyen de transport roi à Beni
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.9), paint);
        frame.position.y = 0.8;
        frame.castShadow = true;
        body.add(frame);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 1.0), tyre);
        seat.position.set(0, 1.15, -0.25);
        body.add(seat);
        // conducteur articulé en pose « moto » (le casque est une variante d'accessoire)
        const look = seededLook(this.npcSeed++);
        look.accessory = Math.random() < 0.6 ? "casque" : look.accessory;
        const { group: rider, rig } = this.makePerson(look, "low");
        rider.position.set(0, 0.62, -0.15);
        body.add(rider);
        animateRig(rig, 1, "ride", 0); // pose figée : pas d'animation par image pour le trafic
        animateRig(rig, 1, "ride", 0);
        for (const z of [0.8, -0.8]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 12), tyre);
          w.rotation.z = Math.PI / 2;
          w.position.set(0, 0.34, z);
          body.add(w);
        }
      } else {
        const long = kind === "bus" ? 6.4 : 4.3;
        const base = new THREE.Mesh(new THREE.BoxGeometry(kind === "bus" ? 2.3 : 2.0, kind === "bus" ? 2.3 : 1.0, long), paint);
        base.position.y = kind === "bus" ? 1.5 : 0.85;
        base.castShadow = true;
        body.add(base);
        if (kind === "bus") {
          // vitres latérales du taxi-bus
          for (const sx of [-1, 1]) {
            const g = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 5.4), glass);
            g.position.set(sx * 1.17, 1.9, 0);
            body.add(g);
          }
          const ws = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 0.06), glass);
          ws.position.set(0, 1.95, long / 2 + 0.01);
          body.add(ws);
        } else {
          const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.2), glass);
          cabin.position.set(0, 1.75, -0.2);
          body.add(cabin);
        }
        for (const [ox, oz] of [[-0.95, long / 2 - 0.8], [0.95, long / 2 - 0.8], [-0.95, -long / 2 + 0.8], [0.95, -long / 2 + 0.8]]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), tyre);
          w.rotation.z = Math.PI / 2;
          w.position.set(ox, 0.36, oz);
          body.add(w);
        }
        // phares (émissifs) pour la nuit
        for (const sx of [-0.6, 0.6]) {
          const hl = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xfff6d5, emissive: 0xfff0b0, emissiveIntensity: 1.2 })
          );
          hl.position.set(sx, kind === "bus" ? 1.0 : 0.85, long / 2 + 0.02);
          body.add(hl);
        }
      }
      this.scene.add(body);
      this.cars.push({
        mesh: body,
        axis,
        line,
        dir,
        pos: Math.random() * WORLD - HALF,
        lane: kind === "moto" ? lane * 1.35 : lane,
        speed: (kind === "moto" ? 15 : kind === "bus" ? 10 : 12) + Math.random() * 8 + this.level * 2.5,
      });
    }

    // piétons : chacun suit un trottoir précis (ligne de route + côté)
    const numPeds = Math.round((10 + this.level * 3) * lowCount);
    for (let i = 0; i < numPeds; i++) {
      const { group: g, rig } = this.makePerson(undefined, this.quality === "low" ? "low" : "high");
      const axis: "x" | "z" = Math.random() < 0.5 ? "x" : "z";
      const line = Math.floor(Math.random() * GRID_LINES);
      const side = Math.random() < 0.5 ? -1 : 1;
      const c = this.lineCoord(line);
      const along = Math.random() * (WORLD - 20) - (WORLD - 20) / 2;
      const off = side * (ROAD / 2 + 1.0 + Math.random() * 1.0);
      if (axis === "x") g.position.set(along, 0, c + off);
      else g.position.set(c + off, 0, along);
      const dir = Math.random() < 0.5 ? 1 : -1;
      g.rotation.y = axis === "x" ? Math.atan2(dir, 0) : Math.atan2(0, dir);
      this.scene.add(g);
      this.peds.push({
        mesh: g,
        rig,
        vx: 0,
        vz: 0,
        timer: 2 + Math.random() * 4,
        alive: true,
        respawn: 0,
        axis,
        line,
        side,
        dir,
        flee: 0,
        walkSpeed: 0.9 + Math.random() * 0.8,
        yaw: g.rotation.y,
        pause: 0,
        greet: 0,
      });
    }

    // petits groupes devant les commerces (discutent, regardent les étals) — apparences uniques
    this.idlePeds.forEach((p) => this.scene.remove(p));
    this.idlePeds = [];
    this.idleRigs = [];
    const fronts = [...this.city.shopFronts].sort(() => Math.random() - 0.5).slice(0, Math.round(18 * lowCount));
    for (const f of fronts) {
      const n = 1 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) {
        const { group: g, rig } = this.makePerson(undefined, "low");
        g.position.set(f.x + (k - 0.5) * 1.1, 0, f.z + (Math.random() - 0.5) * 0.6);
        g.rotation.y = f.facing + (Math.random() - 0.5) * 0.8;
        this.scene.add(g);
        this.idlePeds.push(g);
        this.idleRigs.push(rig);
      }
    }
  }
  private idleRigs: Rig[] = [];

  private updateTraffic(dt: number) {
    // traffic lights
    for (const tl of this.lights) {
      tl.timer -= dt;
      if (tl.timer <= 0) {
        tl.greenNS = !tl.greenNS;
        tl.timer = 5 + Math.random() * 2;
      }
      // update bulbs emissive
      const setB = (bulbs: THREE.Mesh[], green: boolean) => {
        (bulbs[0].material as THREE.MeshStandardMaterial).emissiveIntensity = green ? 0.1 : 1.2;
        (bulbs[1].material as THREE.MeshStandardMaterial).emissiveIntensity = green ? 1.2 : 0.1;
      };
      setB(tl.bulbsNS, tl.greenNS);
      setB(tl.bulbsEW, !tl.greenNS);
    }

    // cars
    for (const car of this.cars) {
      // feu rouge : s'arrêter avant le carrefour
      let stop = false;
      for (const tl of this.lights) {
        const onThis =
          car.axis === "z"
            ? Math.abs(this.lineCoord(car.line) - tl.x) < 0.5
            : Math.abs(this.lineCoord(car.line) - tl.z) < 0.5;
        if (!onThis) continue;
        const crossPos = car.axis === "z" ? tl.z : tl.x;
        const dist = (crossPos - car.pos) * car.dir;
        if (dist > 0 && dist < 8) {
          // axe z = nord-sud → concerne le feu « greenNS »
          const green = car.axis === "z" ? tl.greenNS : !tl.greenNS;
          if (!green) stop = true;
        }
      }
      if (!stop) car.pos += car.speed * car.dir * dt;
      if (car.pos > HALF + 6) car.pos = -HALF - 6;
      if (car.pos < -HALF - 6) car.pos = HALF + 6;

      const lineC = this.lineCoord(car.line);
      if (car.axis === "z") {
        car.mesh.position.set(lineC + car.lane, 0, car.pos);
        car.mesh.rotation.y = car.dir > 0 ? 0 : Math.PI;
      } else {
        car.mesh.position.set(car.pos, 0, lineC + car.lane);
        car.mesh.rotation.y = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }

    // pedestrians
    for (const p of this.peds) {
      if (!p.alive) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          p.alive = true;
          p.mesh.visible = true;
          p.mesh.position.y = 0;
        }
        continue;
      }
      p.timer -= dt;
      if (p.timer <= 0) {
        p.timer = 3 + Math.random() * 6;
        const r = Math.random();
        if (r < 0.25) p.dir *= -1; // fait demi-tour de temps en temps
        else if (r < 0.45) p.pause = 1.5 + Math.random() * 3; // s'arrête (regarde une vitrine, salue)
      }
      if (p.greet > 0) p.greet -= dt;
      const prevPos = p.mesh.position.clone();
      // réaction : un véhicule rapide arrive → on s'écarte vers le mur et on s'arrête
      const ddx = p.mesh.position.x - this.pos.x;
      const ddz = p.mesh.position.z - this.pos.y;
      if (this.playerMode === "vehicle" && Math.abs(this.speed) > 7 && ddx * ddx + ddz * ddz < 64) p.flee = 0.9;
      let move = p.walkSpeed;
      const c = this.lineCoord(p.line);
      if (p.pause > 0) {
        p.pause -= dt;
        move = 0;
      }
      if (p.flee > 0) {
        p.flee -= dt;
        move = 0;
        if (p.axis === "x") p.mesh.position.z += p.side * 2.5 * dt;
        else p.mesh.position.x += p.side * 2.5 * dt;
      }
      // avance le long du trottoir
      if (p.axis === "x") p.mesh.position.x += p.dir * move * dt;
      else p.mesh.position.z += p.dir * move * dt;
      // reste dans la bande piétonne (entre la bordure et les murs/façades)
      const minOff = ROAD / 2 + 0.8;
      const maxOff = ROAD / 2 + 2.1;
      if (p.axis === "x") {
        const off = THREE.MathUtils.clamp(Math.abs(p.mesh.position.z - c), minOff, maxOff);
        p.mesh.position.z = c + p.side * off;
      } else {
        const off = THREE.MathUtils.clamp(Math.abs(p.mesh.position.x - c), minOff, maxOff);
        p.mesh.position.x = c + p.side * off;
      }
      // demi-tour en bout de ville ou devant un obstacle (mur, façade, arbre)
      const along = p.axis === "x" ? p.mesh.position.x : p.mesh.position.z;
      const aheadX = p.axis === "x" ? p.mesh.position.x + p.dir * 1.4 : p.mesh.position.x;
      const aheadZ = p.axis === "x" ? p.mesh.position.z : p.mesh.position.z + p.dir * 1.4;
      let blocked = Math.abs(along) > HALF - 3;
      if (!blocked) {
        for (const b of this.buildings) {
          if (Math.abs(aheadX - b.x) < b.hw && Math.abs(aheadZ - b.z) < b.hd) { blocked = true; break; }
        }
      }
      if (blocked) p.dir *= -1;
      const facing = p.axis === "x" ? Math.atan2(p.dir, 0) : Math.atan2(0, p.dir);
      // orientation : vers le joueur si on le salue / on fuit, sinon dans le sens de marche (rotation progressive)
      const wantYaw =
        p.greet > 0 || p.flee > 0 ? Math.atan2(this.pos.x - p.mesh.position.x, this.pos.y - p.mesh.position.z) : facing;
      p.yaw = this.turnTo(p.yaw, wantYaw, 5, dt);
      p.mesh.rotation.y = p.yaw;
      p.mesh.position.y = 0;
      // animation : la phase de pas suit la distance réellement parcourue (aucun glissement)
      const moved = prevPos.distanceTo(p.mesh.position);
      const near = ddx * ddx + ddz * ddz < 45 * 45; // au-delà de 45 m : pas d'animation (LOD)
      if (near) animateRig(p.rig, dt, p.greet > 0 ? "wave" : moved > 0.001 ? "walk" : "idle", moved);
    }
    // badauds devant les commerces : respiration / léger mouvement de tête
    for (const r of this.idleRigs) animateRig(r, dt, "idle", 0);
  }

  // ---------- missions ----------
    // aligne sur la route la plus proche pour garantir un point atteignable
  private snapToRoad(x: number, z: number): THREE.Vector2 {
    let bestLine = 0;
    let bestD = Infinity;
    for (let i = 0; i < GRID_LINES; i++) {
      const c = this.lineCoord(i);
      const dx = Math.abs(c - x);
      if (dx < bestD) {
        bestD = dx;
        bestLine = i;
      }
    }
    let bestLineZ = 0;
    let bestDZ = Infinity;
    for (let i = 0; i < GRID_LINES; i++) {
      const c = this.lineCoord(i);
      const dz = Math.abs(c - z);
      if (dz < bestDZ) {
        bestDZ = dz;
        bestLineZ = i;
      }
    }
    // on place le point sur l'axe le plus proche
    if (bestD < bestDZ) return new THREE.Vector2(this.lineCoord(bestLine), z);
    return new THREE.Vector2(x, this.lineCoord(bestLineZ));
  }

  private landmarkPoint(l: Landmark): THREE.Vector2 {
    const [wx, wz] = landmarkWorld(l);
    return this.snapToRoad(wx, wz);
  }

  private pickupPos = new THREE.Vector2();
  private deliverPos = new THREE.Vector2();
  /** porte du client : sur le trottoir, devant le bâtiment (la remise se fait là, à pied) */
  private deliverDoor = new THREE.Vector2();
  private usedLandmarks: number[] = [];

  /** le client attend devant sa porte et fait signe quand le livreur approche */
  private ensureClientNpc() {
    if (this.clientNpc) return;
    const { group: npc, rig } = this.makePerson();
    npc.position.set(this.deliverDoor.x, 0, this.deliverDoor.y);
    // tourné vers la route (là d'où arrive le livreur)
    npc.rotation.y = Math.atan2(this.deliverPos.x - this.deliverDoor.x, this.deliverPos.y - this.deliverDoor.y);
    this.scene.add(npc);
    this.clientNpc = npc;
    this.clientRig = rig;
    this.clientWave = 0;
    this.clientTalkT = 0;
  }

  private removeClientNpc() {
    if (this.clientNpc) this.scene.remove(this.clientNpc);
    this.clientNpc = null;
    this.clientRig = null;
  }

  private updateClient(dt: number) {
    if (!this.clientNpc || !this.clientRig) return;
    // se tourne progressivement vers le livreur
    const target = Math.atan2(this.pos.x - this.clientNpc.position.x, this.pos.y - this.clientNpc.position.z);
    this.clientNpc.rotation.y = this.turnTo(this.clientNpc.rotation.y, target, 4, dt);
    this.clientWave += dt;
    const dist = this.pos.distanceTo(this.deliverDoor);
    // fait signe quand le livreur est en vue (par intermittence, comme quelqu'un qui attend)
    const waving = dist < 16 && Math.sin(this.clientWave * 0.9) > -0.2;
    animateRig(this.clientRig, dt, this.clientTalkT > 0 ? "handover" : waving ? "wave" : "idle", 0);
    if (this.clientTalkT > 0) this.clientTalkT -= dt;
  }

  /** action explicite de remise du colis (touche E / bouton) */
  deliverPackage() {
    if (this.phase !== "playing" || this.playerMode !== "walk" || !this.hasPackage) return false;
    if (this.pos.distanceTo(this.deliverDoor) > 3.6) return false;
    this.ensureClientNpc();
    const npc = this.clientNpc!;
    // le livreur tend le colis, le client tend les bras
    this.socialPose = "handover";
    this.socialAnimTimer = 1.3;
    this.clientTalkT = 0.9;
    this.walkerPackage.visible = false;
    const from = new THREE.Vector3();
    this.walkerRig.handR.getWorldPosition(from);
    this.throwPackage(from, new THREE.Vector3(npc.position.x, 1.35, npc.position.z));
    this.deliveryStage = "drive";
    this.completeDelivery();
    return true;
  }

  private pickLandmark(exclude: number[]): number {
    const candidates = DISTRICTS.map((_, i) => i).filter((i) => !exclude.includes(i));
    const pool = candidates.length ? candidates : DISTRICTS.map((_, i) => i);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private newMission() {
    this.hasPackage = false;
    if (this.packageMesh) this.packageMesh.visible = false;
    if (this.walkerPackage) this.walkerPackage.visible = false;

    // pick two DIFFERENT districts, far enough apart & away from the player,
    // retrying a few times so missions always feel meaningful
    let pi = 0;
    let di = 1;
    for (let attempt = 0; attempt < 12; attempt++) {
      pi = this.pickLandmark(this.usedLandmarks);
      di = this.pickLandmark([pi, ...this.usedLandmarks]);
      const p = this.landmarkPoint(DISTRICTS[pi]);
      const d = this.landmarkPoint(DISTRICTS[di]);
      if (p.distanceTo(d) > 60 && p.distanceTo(this.pos) > 20) break;
    }
    this.usedLandmarks = [pi, di];

    const pLm = DISTRICTS[pi];
    const dLm = DISTRICTS[di];
    // ~35 % of runs target a shop / restaurant — real handovers at businesses
    let dLmFinal = dLm;
    if (Math.random() < 0.35) {
      const poi = POIS[Math.floor(Math.random() * POIS.length)];
      dLmFinal = { name: poi.name, short: poi.name, emoji: poi.emoji, kind: poi.type, fx: poi.fx, fz: poi.fz };
    }
    this.pickupPos = this.landmarkPoint(pLm);
    this.deliverPos = this.landmarkPoint(dLmFinal);
    this.pickupLabel = `${pLm.emoji} ${pLm.short}`;
    this.deliverLabel = `${dLmFinal.emoji} ${dLmFinal.short}`;

    this.pickupMarker.position.set(this.pickupPos.x, 0, this.pickupPos.y);
    this.pickupMarker.visible = true;
    // porte du client : décalée de la chaussée vers le trottoir, côté du bâtiment visé
    {
      const [wx, wz] = landmarkWorld(dLmFinal);
      const onVerticalRoad = Math.abs(this.deliverPos.y - wz) < 0.01;
      const off = ROAD / 2 + 1.4; // sur le trottoir, juste devant la façade
      if (onVerticalRoad) {
        const s = wx - this.deliverPos.x >= 0 ? 1 : -1;
        this.deliverDoor.set(this.deliverPos.x + s * off, this.deliverPos.y);
      } else {
        const s = wz - this.deliverPos.y >= 0 ? 1 : -1;
        this.deliverDoor.set(this.deliverPos.x, this.deliverPos.y + s * off);
      }
      // ne pas placer la porte du client sous l'auvent d'un kiosque : on glisse le long du trottoir
      for (let k = 0; k < 6; k++) {
        const clash = this.poiMeshes.find(
          (pm) => Math.abs(pm.mesh.position.x - this.deliverDoor.x) < 4.5 && Math.abs(pm.mesh.position.z - this.deliverDoor.y) < 4.5
        );
        if (!clash) break;
        if (onVerticalRoad) {
          this.deliverDoor.y += 5;
          this.deliverPos.y += 5;
        } else {
          this.deliverDoor.x += 5;
          this.deliverPos.x += 5;
        }
      }
    }
    this.deliverMarker.position.set(this.deliverDoor.x, 0, this.deliverDoor.y);
    this.deliverMarker.visible = false;
    this.deliveryStage = "drive";
    this.removeClientNpc();

    // progressive difficulty: less time each level
    const dist = this.pickupPos.distanceTo(this.deliverPos);
    this.timeTotal = Math.max(16, 48 - this.level * 4 + dist * 0.15);
    this.timeLeft = this.timeTotal;
  }

  // ---------- public API ----------
  /** démarre un niveau avec les améliorations et l'argent du joueur */
  start(level: number, upgrades: Upgrades, startMoney = 0) {
    this.upgrades = upgrades;
    this.level = level;
    if (level === 1 || this.phase === "menu" || this.phase === "gameover" || this.phase === "victory") {
      this.score = 0;
      this.money = startMoney;
    }
    this.deliveriesDone = 0;
    this.deliveriesNeeded = 20; // 20 livraisons par niveau (3 niveaux = 60 livraisons au total)
    this.combo = 1;
    this.speed = 0;
    this.fatigue = 0;
    if (level === 1) this.hunger = 10;
    this.nearPoi = null;
    this.poiCooldown = 0;
    // reset transient state so a fresh run never inherits stale jail/nitro/crash data
    this.jailTime = 0;
    this.fineAmount = 0;
    this.nitroCharge = this.nitroMax;
    this.nitroActive = false;
    this.nitroTimer = 0;
    this.crashCooldown = 0;
    this.missionsCompleted = 0;
    this.freeRoam = false;
    this.deliveryChoice = false;
    this.deliveryChoiceT = 0;
    this.mountT = 0;
    this.walkVel = 0;
    this.navActive = false;
    this.navLabel = "";
    this.navMarker.visible = false;
    this.playerMode = "vehicle";
    this.walker.visible = false;
    if (this.bikeRider) this.bikeRider.visible = true;
    this.cruiseOn = false;
    this.prevSpeed = 0;
    this.pitchVis = 0;
    this.bounceVis = 0;
    this.bounceVel = 0;
    this.snapCam = true;
    this.deliveryStage = "drive";
    this.removeClientNpc();
    // chaque niveau démarre à un moment différent de la journée (puis le temps s'écoule)
    if (this.env) this.env.setHour([9, 11.5, 15.5, 17.6, 19.5][Math.min(4, level - 1)]);
    this.hazardCooldown = 0;
    this.usedLandmarks = [];
    this.pos.set(this.lineCoord(Math.floor(GRID_LINES / 2)), this.lineCoord(Math.floor(GRID_LINES / 2)));
    this.heading = 0;
    this.spawnTraffic();
    this.clearCouriers();
    this.applyLevelAmbience();
    this.newMission();
    this.phase = "playing";
    audio.resume();
    audio.startEngine();
    this.emitHud();
  }

  // Each level has a different time-of-day mood → progressive difficulty & variety
  private applyLevelAmbience() {
    const moods = [
      { sky: 0x87ceeb, fog: 0x9fd3e8 }, // day
      { sky: 0xffd7a8, fog: 0xffc98a }, // golden hour
      { sky: 0xff9e7d, fog: 0xff8c66 }, // sunset
      { sky: 0x3b4a7a, fog: 0x2c3a63 }, // dusk
      { sky: 0x151a3a, fog: 0x1a1f45 }, // night
    ];
    const m = moods[Math.min(moods.length - 1, this.level - 1)];
    (this.scene.background as THREE.Color).setHex(m.sky);
    // le ciel, le brouillard et les lumières sont désormais pilotés par le cycle jour/nuit (Environment)
    if (this.env) this.env.setWeather(this.level === 3 ? "cloudy" : this.level === 4 ? "rain" : "sunny");
  }

  /** applique les améliorations achetées */
  setUpgrades(u: Upgrades) {
    this.upgrades = u;
  }

  /** change le véhicule (depuis le garage / la boutique) */
  setVehicle(id: string) {
    this.vehicle = getVehicle(id);
    this.rebuildVehicleMesh();
    this.emitHud();
  }

  setAppearance(profile: Pick<PlayerProfile, "skinColor" | "shirtColor"> & Partial<PlayerProfile>) {
    const skin = new THREE.Color(profile.skinColor).getHex();
    const top = new THREE.Color(profile.shirtColor).getHex();
    // genre / coiffure du profil → apparence du personnage
    if (profile.gender) this.playerLook.female = profile.gender === "femme";
    if (profile.hair) {
      const map: Record<string, CharacterLook["hairStyle"]> = {
        Court: "court", Tresses: "tresses", Locks: "locks", "Rasé": "rase", Afro: "afro",
      };
      this.playerLook.hairStyle = map[profile.hair] ?? "court";
    }
    this.playerLook.skin = skin;
    this.playerLook.top = top;
    recolorRig(this.walkerRig, skin, top);
    if (this.riderRig) recolorRig(this.riderRig, skin, top);
    // coiffure/genre changés → reconstruire les deux personnages du joueur
    if (profile.hair || profile.gender) this.rebuildPlayerCharacters();
  }

  private rebuildPlayerCharacters() {
    const wasVisible = this.walker.visible;
    this.walker.remove(this.walkerRig.root);
    this.walkerRig = buildCharacter(this.playerLook, "high");
    this.walkerRig.root.scale.setScalar(RIG_SCALE);
    this.walker.add(this.walkerRig.root);
    this.walkerPackage.removeFromParent();
    this.walkerPackage.position.set(-0.14, -0.02, 0.12);
    this.walkerRig.handR.add(this.walkerPackage);
    this.walker.visible = wasVisible;
    this.rebuildVehicleMesh();
  }

  /** compatibilité : ancien interrupteur « économie » → préréglages de qualité */
  setEconomyGraphics(enabled: boolean) {
    this.setQuality(enabled ? "low" : "high");
  }

  setNavigation(x: number, z: number, label: string) {
    const point = this.snapToRoad(x, z);
    this.navPos.copy(point);
    this.navLabel = label;
    this.navActive = true;
    this.navMarker.position.set(point.x, 0, point.y);
    this.navMarker.visible = true;
    this.emitHud();
  }

  cancelNavigation() {
    this.navActive = false;
    this.navLabel = "";
    this.navMarker.visible = false;
    this.emitHud();
  }

  exploreFreeRoam() {
    this.freeRoam = true;
    this.deliveryChoice = false;
    this.phase = "playing";
    this.hasPackage = false;
    this.timeLeft = 0;
    this.pickupMarker.visible = false;
    this.deliverMarker.visible = false;
    if (this.packageMesh) this.packageMesh.visible = false;
    if (this.walkerPackage) this.walkerPackage.visible = false;
    audio.resume();
    if (this.playerMode === "vehicle") audio.startEngine();
    this.emitHud();
  }

  finishCareer() {
    this.phase = "victory";
    audio.updateEngine(0);
    this.cb.onVictory(this.score, this.money);
    this.emitHud();
  }

  /** position « à côté du véhicule » (côté gauche, hors du gabarit) */
  private dismountSpot() {
    const wide = this.vehicle.bodyType === "van" || this.vehicle.bodyType === "tuktuk";
    const off = wide ? 2.3 : 1.1;
    const h = this.bike.rotation.y;
    const sideX = Math.cos(h) * off;
    const sideZ = -Math.sin(h) * off;
    let x = this.bike.position.x + sideX;
    let z = this.bike.position.z + sideZ;
    // si ce côté est dans un mur, descendre de l'autre côté
    if (this.insideBuilding(x, z)) {
      x = this.bike.position.x - sideX;
      z = this.bike.position.z - sideZ;
    }
    return new THREE.Vector2(x, z);
  }

  /** position du siège conducteur dans le monde (le personnage part / arrive de là) */
  private seatWorld() {
    const p = new THREE.Vector3();
    if (this.bikeRider) this.bikeRider.getWorldPosition(p);
    else p.set(this.bike.position.x, 0.9, this.bike.position.z);
    return p;
  }

  toggleVehicleMode() {
    if (this.phase !== "playing" || this.mountT > 0) return false;
    if (this.playerMode === "vehicle") {
      if (Math.abs(this.speed) > 1.5) return false;
      this.speed = 0;
      this.cruiseOn = false;
      this.playerMode = "walk";
      this.walkerHeading = this.bike.rotation.y;
      const spot = this.dismountSpot();
      this.pos.copy(spot);
      this.lastWalkPos.copy(spot);
      // animation : le personnage glisse du siège vers le sol (≈0.7 s), pieds posés à l'arrivée
      this.mountDir = "out";
      this.mountT = 0.7;
      this.mountFrom.copy(this.seatWorld()).setY(0.55);
      this.mountTo.set(spot.x, 0, spot.y);
      this.walker.position.copy(this.mountFrom);
      this.walker.rotation.y = this.walkerHeading;
      this.walker.visible = true;
      if (this.bikeRider) this.bikeRider.visible = false;
      this.packageMesh.visible = false;
      this.walkerPackage.visible = this.hasPackage;
      audio.updateEngine(0);
      audio.vehicleExit();
    } else {
      const dx = this.pos.x - this.bike.position.x;
      const dz = this.pos.y - this.bike.position.z;
      if (Math.hypot(dx, dz) > 5) return false;
      // animation : marche vers le siège puis s'assoit ; le mode véhicule s'active à la fin
      this.mountDir = "in";
      this.mountT = 0.75;
      this.mountFrom.set(this.pos.x, 0, this.pos.y);
      this.mountTo.copy(this.seatWorld()).setY(0.55);
      this.walkerPackage.visible = false;
      audio.vehicleEnter();
    }
    this.emitHud();
    return true;
  }

  /** transition monter/descendre : interpolation lissée + pose du personnage */
  private updateMount(dt: number) {
    if (this.mountT <= 0) return false;
    const total = this.mountDir === "out" ? 0.7 : 0.75;
    this.mountT = Math.max(0, this.mountT - dt);
    const t = 1 - this.mountT / total;
    const s = t * t * (3 - 2 * t); // smoothstep
    const p = new THREE.Vector3().lerpVectors(this.mountFrom, this.mountTo, s);
    // petit arc pour enjamber le véhicule
    p.y += Math.sin(s * Math.PI) * 0.35;
    this.walker.position.copy(p);
    const face = this.mountDir === "in"
      ? Math.atan2(this.mountTo.x - this.mountFrom.x, this.mountTo.z - this.mountFrom.z)
      : this.bike.rotation.y;
    this.walker.rotation.y = this.turnTo(this.walker.rotation.y, face, 8, dt);
    // pose : « assis » près du siège, « marche » près du sol
    const seatBlend = this.mountDir === "out" ? 1 - s : s;
    const ride = this.vehicle.bodyType === "moto" || this.vehicle.bodyType === "scooter" || this.vehicle.bodyType === "sport";
    animateRig(this.walkerRig, dt, seatBlend > 0.5 ? (ride ? "ride" : "sit") : "walk", seatBlend > 0.5 ? 0 : dt * 2.5);
    if (this.mountT <= 0) {
      if (this.mountDir === "in") {
        this.playerMode = "vehicle";
        this.pos.set(this.bike.position.x, this.bike.position.z);
        this.heading = this.bike.rotation.y;
        this.walker.visible = false;
        if (this.bikeRider) this.bikeRider.visible = this.cameraView !== "conduite";
        this.packageMesh.visible = this.hasPackage;
        audio.startEngine();
      } else {
        this.walker.position.copy(this.mountTo);
      }
      this.emitHud();
    }
    return true;
  }

  greetNearbyNpc() {
    if (this.playerMode !== "walk" || !this.nearNpc || this.socialAnimTimer > 0) return false;
    const npc = this.nearNpc;
    // le passant s'arrête, se tourne vers vous et répond d'un geste + d'une bulle
    npc.pause = Math.max(npc.pause, 2.2);
    npc.greet = 1.8;
    this.socialPose = "wave";
    this.socialAnimTimer = 1.4;
    const replies = ["Bonjour !", "Bonne journée !", "Bienvenue à Beni !", "Salut voisin !", "Jambo !", "Ça va bien ?"];
    const reply = replies[Math.floor(Math.random() * replies.length)];
    this.say(npc.mesh, reply, 2.4);
    this.cb.onNpcGreet?.(reply);
    audio.pickup();
    return true;
  }

  askNearbyNpcDirection() {
    if (this.playerMode !== "walk" || !this.nearNpc) return false;
    this.nearNpc.pause = Math.max(this.nearNpc.pause, 2.5);
    this.nearNpc.greet = 2.0;
    const destination = this.navActive
      ? this.navLabel
      : this.freeRoam
        ? "le Grand Marché"
        : this.hasPackage
          ? this.deliverLabel
          : this.pickupLabel;
    const replies = [
      `${destination} est indiqué sur ta carte.`,
      `Continue vers le marqueur bleu pour ${destination}.`,
      `Prends l'avenue la plus proche, puis suis la flèche vers ${destination}.`,
    ];
    this.cb.onNpcGreet?.(replies[Math.floor(Math.random() * replies.length)]);
    audio.click();
    return true;
  }

  restAtHome() {
    this.homeRoom = "living";
    this.fatigue = Math.max(0, this.fatigue - 45);
    this.hunger = Math.min(100, this.hunger + 8);
    this.emitHud();
  }

  sleepAtHome() {
    this.homeRoom = "bedroom";
    this.fatigue = 0;
    this.hunger = Math.min(100, this.hunger + 12);
    this.emitHud();
  }

  eatHomeMeal(energy: number) {
    this.homeRoom = "dining";
    this.hunger = Math.max(0, this.hunger - energy);
    this.fatigue = Math.max(0, this.fatigue - Math.round(energy * 0.35));
    audio.deliver();
    this.emitHud();
  }

  washAtHome() {
    this.homeRoom = "bathroom";
    this.fatigue = Math.max(0, this.fatigue - 15);
    this.emitHud();
  }

  sitAtHome() {
    this.homeRoom = "living";
    this.fatigue = Math.max(0, this.fatigue - 8);
    this.emitHud();
  }

  enterHomeRoom(room: HudState["homeRoom"]) {
    this.homeRoom = room;
    this.emitHud();
  }

  payFineAndRelease() {
    const fine = 50 + (this.level - 1) * 10;
    if (this.money >= fine) {
      this.money -= fine;
      this.jailTime = 0;
      this.fineAmount = 0;
      this.phase = "playing";
      this.speed = 0;
      audio.coin();
      this.emitHud();
    } else {
      audio.fail();
    }
  }

  // (les courses s'enchaînent automatiquement)
  //  immediately spawns the next mission via newMission(), like a real courier shift.)

  /** porte-monnaie courant */
  getMoney() {
    return this.money;
  }
  getScore() {
    return this.score;
  }

  spendMoney(amount: number) {
    if (amount <= 0 || this.money < amount) return false;
    this.money -= amount;
    audio.coin();
    this.emitHud();
    return true;
  }

  /** pause */
  pause() {
    if (this.phase === "playing") {
      this.phase = "paused";
      audio.updateEngine(0);
      this.emitHud();
    }
  }
  /** reprise */
  resume() {
    if (this.phase === "paused") {
      this.phase = "playing";
      audio.resume();
      this.emitHud();
    }
  }

  /** niveau suivant (ou victoire finale) */
  nextLevel() {
    this.level = Math.min(MAX_LEVEL, this.level + 1);
    this.start(this.level, this.upgrades, this.money);
  }

  toGarage() {
    this.shopReturn = "menu";
    this.phase = "garage";
    this.emitHud();
  }

  // ── Commerces : boutiques, restaurants, kiosques ──
  /** Place les commerces sur la carte (points colorés + petits étals). */
  private poiLights: THREE.PointLight[] = [];
  private poiSigns: THREE.MeshStandardMaterial[] = [];

  /** éloigne une coordonnée le long d'une route des carrefours (évite arbres et passages piétons) */
  private awayFromCross(v: number) {
    const c = Math.round((v + HALF) / CELL) * CELL - HALF;
    if (Math.abs(v - c) < 12) v = c + 12 * (v - c >= 0 ? 1 : -1);
    return Math.max(-HALF + 12, Math.min(HALF - 12, v));
  }

  private buildPois() {
    for (const poi of POIS) {
      const [wx, wz] = landmarkWorld(poi);
      const pos = this.snapToRoad(wx, wz);
      // sur le trottoir du côté du lieu, devanture tournée vers la route
      let rot = 0;
      if (Math.abs(pos.x - wx) > Math.abs(pos.y - wz)) {
        const side = wx >= pos.x ? 1 : -1;
        pos.x += (side * ROAD) / 2;
        rot = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        pos.y = this.awayFromCross(pos.y);
      } else {
        const side = wz >= pos.y ? 1 : -1;
        pos.y += (side * ROAD) / 2;
        rot = side > 0 ? Math.PI : 0;
        pos.x = this.awayFromCross(pos.x);
      }
      const colorMap: Record<PoiType, number> = {
        shop: 0xffb703,
        restaurant: 0x80ed99,
        kiosk: 0x48cae4,
        home: 0xf472b6,
        market: 0xf59e0b,
        clothing: 0xfacc15,
        leisure: 0xc084fc,
        pharmacy: 0x10b981,
        fuel: 0xf97316,
        admin: 0x64748b,
      };
      const color = colorMap[poi.type] ?? 0xffb703;
      const g = buildKiosk(this.scene, pos.x, pos.y, rot, poi.type, poi.name, color);
      this.poiSigns.push(g.signMat);
      if (this.quality === "high") {
        const lamp = new THREE.PointLight(0xffd9a0, 0, 16, 2);
        lamp.position.set(0, 2.8, 0.8);
        g.add(lamp);
        this.poiLights.push(lamp);
      }
      this.poiMeshes.push({ poi, mesh: g });
      this.buildings.push({ x: pos.x, z: pos.y, hw: 2.1, hd: 2.1 });
    }
  }

  /** Boutique (véhicules/équipement), restaurant (repos), kiosque (nitro). */
  getNearPoi(): Poi | null {
    return this.nearPoi;
  }

  /** Liste des commerces avec position monde (pour l'UI "voir sur la carte") */
  getPoiList() {
    return this.poiMeshes.map((p) => ({
      name: p.poi.name,
      type: p.poi.type,
      emoji: p.poi.emoji,
      x: p.mesh.position.x,
      z: p.mesh.position.z,
    }));
  }

  toggleRun() {
    this.runToggled = !this.runToggled;
    return this.runToggled;
  }

  interact(): PoiType | null {
    if (this.phase !== "playing") return null;
    if (this.deliveryStage === "handover" || this.mountT > 0) return null;
    if (Math.abs(this.speed) > 3) return null;

    // Interaction dans les intérieurs 3D de bâtiments visitables
    if (this.currentBuilding) {
      audio.click();
      if (this.currentBuilding.id === "home") {
        if (this.currentRoom?.name === "Chambre") {
          this.fatigue = 0;
          if (this.env) this.env.setHour((this.env.hour + 6) % 24);
          audio.levelup();
        } else if (this.currentRoom?.name === "Cuisine") {
          this.hunger = 0;
          this.fatigue = Math.max(0, this.fatigue - 15);
          audio.coin();
        } else if (this.currentRoom?.name === "Salle de bain") {
          this.fatigue = Math.max(0, this.fatigue - 20);
          audio.coin();
        } else {
          this.fatigue = Math.max(0, this.fatigue - 10);
          audio.coin();
        }
        this.emitHud();
        return "home";
      } else if (this.currentBuilding.id === "restaurant") {
        this.eatAtRestaurant();
        return "restaurant";
      } else if (this.currentBuilding.id === "shop") {
        this.shopReturn = "playing";
        this.phase = "garage";
        audio.updateEngine(0);
        this.emitHud();
        return "shop";
      } else if (this.currentBuilding.id === "pharmacy") {
        this.fatigue = 0;
        this.hunger = Math.max(0, this.hunger - 30);
        audio.levelup();
        this.emitHud();
        return "pharmacy";
      }
    }

    if (!this.nearPoi) return null;
    const poi = this.nearPoi;
    audio.click();
    if (poi.type === "shop") {
      this.shopReturn = "playing";
      this.phase = "garage";
      audio.updateEngine(0);
      this.emitHud();
    } else if (poi.type === "restaurant") {
      this.eatAtRestaurant();
    } else if (poi.type === "kiosk") {
      this.useKiosk();
    } else {
      // Life activities are handled by React panels while the 3D world is paused.
      this.phase = "paused";
      audio.updateEngine(0);
      this.emitHud();
    }
    this.cb.onPoiUsed?.(poi.type, poi.name);
    this.nearPoi = null;
    this.poiCooldown = 4; // pause avant de pouvoir réutiliser ce commerce
    this.emitHud();
    return poi.type;
  }

  /** se restaurer : fatigue à zéro, +15 s */
  eatAtRestaurant() {
    const meal = Game.PRICES.meal;
    if (this.money < meal) return;
    this.money -= meal;
    this.fatigue = 0;
    this.hunger = Math.max(0, this.hunger - 55);
    this.timeLeft += 15; // repas = pause revigorante
    this.burst(this.pos.x, 2, this.pos.y, 0x80ed99, 20, 6, 6, 0.9);
    audio.deliver();
    this.emitHud();
  }

  /** buvette/kiosque : nitro plein, fatigue en baisse */
  useKiosk() {
    const drink = Game.PRICES.drink;
    if (this.money < drink) return;
    this.money -= drink;
    this.nitroCharge = this.nitroMax;
    this.fatigue = Math.max(0, this.fatigue - 25);
    this.hunger = Math.max(0, this.hunger - 12);
    this.burst(this.pos.x, 2, this.pos.y, 0x48cae4, 16, 5, 6, 0.7);
    audio.upgrade();
    this.emitHud();
  }

  /** Ferme le garage et revient soit au menu, soit à la partie. */
  closeShop() {
    if (this.shopReturn === "playing") {
      this.phase = "playing";
      audio.resume();
      if (this.playerMode === "vehicle") audio.startEngine();
      this.emitHud();
    } else {
      this.goMenu();
    }
  }

  /** retour au menu */
  goMenu() {
    this.phase = "menu";
    audio.stopEngine();
    this.emitHud();
  }

  /** commandes tactiles (pédale, direction, frein) */
  setTouchInput(throttle: number, steer: number, brake: boolean, nitro: boolean = false) {
    this.touchThrottle = throttle;
    this.touchSteer = steer;
    this.touchBrake = brake;
    if (nitro) this.touchNitro = true;
  }

  // separate nitro trigger so it never clobbers throttle/steer on mobile
  setNitro(active: boolean) {
    if (!active) this.nitroWasPressed = false;
    this.touchNitro = active;
  }

  // ---------- commandes ----------
  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.key.toLowerCase()] = true;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) e.preventDefault();
    if (e.key.toLowerCase() === "p" || e.key === "Escape") {
      if (this.phase === "playing") this.pause();
      else if (this.phase === "paused") this.resume();
    }
    if (e.key.toLowerCase() === "e") {
      // devant la porte du client : remise du colis ; sinon commerce / resto / kiosque
      if (!this.deliverPackage()) this.interact();
    }
    if (e.key.toLowerCase() === "f") this.toggleVehicleMode();
    if (e.key.toLowerCase() === "k") this.toggleCruise();
    if (e.key === "+" || e.key === "]") this.adjustCruise(5);
    if (e.key === "-" || e.key === "[") this.adjustCruise(-5);
    if (e.key.toLowerCase() === "c") this.cycleCamera();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.key.toLowerCase()] = false;
  };

  // ---------- main loop ----------
  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.gameTime += dt;
    if (this.phase === "playing" || this.phase === "jail") {
      this.update(dt);
    } else {
      // les animations de remise continuent sur les écrans de fin/pause/choix
      if (this.phase === "levelup" || this.phase === "paused" || this.phase === "delivered") {
        this.updateCouriers(dt);
        this.updateFlyBoxes(dt);
        if (this.phase === "delivered") this.updateTraffic(dt);
      }
      // caméra en léger mouvement sur le menu : survol de la ville
      if (this.phase === "menu") {
        const t = performance.now() * 0.00012;
        this.camera.position.set(Math.cos(t) * 95, 34, Math.sin(t) * 95);
        this.camera.lookAt(0, 6, 0);
        if (this.camera.fov !== 55) {
          this.camera.fov = 55;
          this.camFov = 55;
          this.camera.updateProjectionMatrix();
        }
      }
    }
    this.updateEnvironment(dt);
    if (this.phase === "playing") this.updateClient(dt);
    this.updateBubbles(dt);
    // après la remise : petit délai (on regarde le client remercier), puis écran de choix
    if (this.deliveryChoice && this.deliveryChoiceT > 0 && this.phase === "playing") {
      this.deliveryChoiceT -= dt;
      if (this.deliveryChoiceT <= 0) {
        this.phase = "delivered";
        audio.updateEngine(0);
        this.emitHud();
      }
    }
    // conducteur : légère animation de conduite (respiration, regard) quand on roule
    if (this.riderRig && this.playerMode === "vehicle" && this.phase === "playing") {
      const ride = this.vehicle.bodyType === "moto" || this.vehicle.bodyType === "scooter" || this.vehicle.bodyType === "sport";
      animateRig(this.riderRig, dt, ride ? "ride" : "sit", 0);
      // les bras suivent le guidon (léger braquage) sur la moto
      if (ride) {
        const steer = this.frontWheel.rotation.y;
        this.riderRig.shoulderL.rotation.x += steer * 0.25;
        this.riderRig.shoulderR.rotation.x -= steer * 0.25;
      }
    }
    this.updateParticles(dt);
    // animate markers
    const spin = performance.now() * 0.002;
    [this.pickupMarker, this.deliverMarker, this.navMarker].forEach((m) => {
      if (m.visible) {
        const orb = (m as any)._orb as THREE.Mesh;
        orb.rotation.y = spin;
        orb.position.y = 4 + Math.sin(spin * 2) * 0.5;
        m.children[0].rotation.y = spin * 0.5;
      }
    });
    this.renderer.render(this.scene, this.camera);
  };

  private getMaxSpeed() {
    return (this.vehicle?.maxSpeed ?? 42) + this.upgrades.engine * 8;
  }

  /** cycle jour/nuit, météo, éclairage urbain et matériaux mouillés */
  private updateEnvironment(dt: number) {
    const focus =
      this.phase === "menu" ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(this.pos.x, 0, this.pos.y);
    this.env.update(dt, focus, this.phase === "playing");
    const night = this.env.nightFactor;
    this.city.lampMaterial.emissiveIntensity = night * 2.6;
    this.city.lampGlowMaterial.opacity = night * 0.22;
    for (const m of this.city.facadeMaterials) m.emissiveIntensity = night * 0.9;
    for (const s of this.poiSigns) s.emissiveIntensity = night * 0.7;
    for (const l of this.poiLights) l.intensity = night * 14;
    if (this.headlight) this.headlight.intensity = this.playerMode === "vehicle" ? night * 60 : 0;
    if (this.headBeam) (this.headBeam.material as THREE.MeshBasicMaterial).opacity = this.playerMode === "vehicle" ? night * 0.28 : 0;
    const wet = this.env.wetness;
    const asphalt = this.city.roadMaterials[0];
    asphalt.roughness = 0.95 - wet * 0.62;
    // sans carte d'environnement (qualité faible), trop de métal rendrait la route noire
    asphalt.metalness = wet * (this.quality === "low" ? 0.08 : 0.28);
    this.city.roadMaterials[1].roughness = 0.98 - wet * 0.4;
    this.renderer.toneMappingExposure = 1.18 - night * 0.14;

    if (this.phase === "playing") {
      const currentHour = parseInt(this.env.clockLabel().split(":")[0], 10) || 12;
      const isNearMarket = Math.abs(this.pos.x) < 50 && Math.abs(this.pos.y) < 50;
      audio.updateAmbience({
        hour: currentHour,
        speed: Math.abs(this.speed),
        nearMarket: isNearMarket,
        weather: this.env.weather,
      });
    }
  }

  // ── régulateur de vitesse ──
  toggleCruise() {
    if (this.playerMode !== "vehicle") return false;
    if (this.cruiseOn) {
      this.cruiseOn = false;
    } else {
      const kmh = Math.abs(this.speed) * 3.6;
      this.cruiseTarget = Math.round(Math.max(20, Math.min(this.getMaxSpeed() * 3.6, kmh || 40)) / 5) * 5;
      this.cruiseOn = true;
    }
    audio.click();
    this.emitHud();
    return this.cruiseOn;
  }

  adjustCruise(delta: number) {
    const max = Math.round(this.getMaxSpeed() * 3.6);
    this.cruiseTarget = Math.max(10, Math.min(max, this.cruiseTarget + delta));
    if (!this.cruiseOn && this.playerMode === "vehicle") this.cruiseOn = true;
    audio.click();
    this.emitHud();
  }

  cycleCamera() {
    const order: CameraView[] = ["exterieure", "rapprochee", "conduite"];
    this.cameraView = order[(order.indexOf(this.cameraView) + 1) % order.length];
    audio.click();
    this.emitHud();
    return this.cameraView;
  }

  /** qualité graphique : faible / moyenne / élevée (sauvegardée) */
  setQuality(q: Quality) {
    this.quality = q;
    localStorage.setItem("beni_quality", q);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === "low" ? 1 : q === "medium" ? 1.5 : 2));
    this.renderer.shadowMap.enabled = q !== "low";
    this.renderer.shadowMap.type = q === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    this.sun.shadow.mapSize.set(q === "high" ? 2048 : 1024, q === "high" ? 2048 : 1024);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.scene.environment = q === "low" ? null : this.pmremTex;
    this.env.setQuality(q);
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
    this.emitHud();
  }

  getWeather(): Weather {
    return this.env.weather;
  }

  private update(dt: number) {
    // jail: player is detained — count down, freeze controls
    if (this.phase === "jail" || this.jailTime > 0) {
      this.speed = 0;
      this.nitroActive = false;
      this.jailTime -= dt;
      if (this.jailTime <= 0) {
        this.jailTime = 0;
        this.phase = "playing";
        this.emitHud();
      }
      // keep the world alive while detained (fatigue keeps building slowly)
      this.updateTraffic(dt);
      this.updateCouriers(dt);
      this.updateFlyBoxes(dt);
      // HUD rafraîchi ~12 fois/s (pas 60) pour ne pas surcharger React
      this.hudAccum += dt;
      if (this.hudAccum > 0.08) {
        this.hudAccum = 0;
        this.emitHud();
      }
      return;
    }

    // transition monter/descendre : le monde continue, les commandes sont suspendues
    if (this.updateMount(dt)) {
      this.updateTraffic(dt);
      this.updateCouriers(dt);
      this.updateFlyBoxes(dt);
      const fx = Math.sin(this.walker.rotation.y);
      const fz = Math.cos(this.walker.rotation.y);
      if (this.playerMode === "walk") this.updateWalkCamera(dt, fx, fz, false);
      else this.updateCamera(dt, Math.sin(this.heading), Math.cos(this.heading));
      this.hudAccum += dt;
      if (this.hudAccum > 0.06) {
        this.hudAccum = 0;
        this.emitHud();
      }
      return;
    }
    if (this.playerMode === "walk") {
      this.updateWalking(dt);
      return;
    }

    const maxSpeed = this.getMaxSpeed();
    const hungerPenalty = 1 - Math.max(0, this.hunger - 70) * 0.004;
    const accelPower =
      ((this.vehicle?.accel ?? 55) + this.upgrades.engine * 10) *
      (1 - this.fatigue * 0.002) *
      hungerPenalty;
    const turnRate = ((this.vehicle?.turn ?? 2.6) + this.upgrades.handling * 0.4) * (1 - this.fatigue * 0.003);
    const grip = 1 + this.upgrades.tires * 0.08;

    // gather input
    let throttle = 0;
    let steer = 0;
    if (this.keys["w"] || this.keys["arrowup"]) throttle += 1;
    if (this.keys["s"] || this.keys["arrowdown"]) throttle -= 1;
    if (this.keys["a"] || this.keys["arrowleft"]) steer -= 1;
    if (this.keys["d"] || this.keys["arrowright"]) steer += 1;
    // nitro : une activation par appui (relâcher puis réappuyer)
    const nitroKey = this.keys["b"] || this.touchNitro;
    if (nitroKey && !this.nitroWasPressed && this.nitroCharge >= this.nitroMax * 0.3 && !this.nitroActive) {
      this.nitroActive = true;
      // amélioration Turbo : nitro plus long
      this.nitroTimer = 3.0 + this.upgrades.boost * 0.6;
      audio.upgrade();
    }
    this.nitroWasPressed = nitroKey;
    throttle += this.touchThrottle;
    steer += this.touchSteer;
    throttle = Math.max(-1, Math.min(1, throttle));
    steer = Math.max(-1, Math.min(1, steer));
    const braking = this.touchBrake || this.keys[" "];
    const heavy = this.vehicle.bodyType === "van" || this.vehicle.bodyType === "tuktuk";
    const surfaceGrip = this.env.gripFactor(); // 1 sec, ~0.7 sous la pluie
    const speedCap = maxSpeed * (this.nitroActive ? 1.7 : 1);

    // ── régulateur de vitesse : maintient la cible sans à-coups ──
    if (this.cruiseOn) {
      if (braking || throttle < 0) {
        this.cruiseOn = false; // toute action incompatible coupe le régulateur
      } else {
        const err = this.cruiseTarget / 3.6 - this.speed;
        const auto = THREE.MathUtils.clamp(err * 0.5, -0.3, 1);
        throttle = auto > 0 ? Math.max(throttle, auto) : throttle > 0 ? throttle : auto;
      }
    }

    // ── longitudinal : accélération progressive, inertie, freinage réaliste ──
    const massFactor = heavy ? 0.72 : 1;
    if (throttle > 0) {
      const ramp = 1.1 - (Math.abs(this.speed) / speedCap) * 0.8; // moins de poussée près de la vitesse max
      this.speed += accelPower * 0.42 * massFactor * ramp * throttle * dt;
    } else if (throttle < 0) {
      if (this.speed > 0.5) {
        this.speed -= (heavy ? 9 : 12) * surfaceGrip * -throttle * dt; // ralentissement doux
      } else {
        this.speed += accelPower * 0.2 * massFactor * throttle * dt; // marche arrière lente
      }
    } else {
      this.speed *= 1 - (heavy ? 0.55 : 0.9) * dt; // frein moteur
    }
    if (braking) {
      const decel = (heavy ? 13 : 19) * surfaceGrip;
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), decel * dt);
    }
    // traînée aérodynamique : convergence naturelle vers la vitesse de pointe
    this.speed -= this.speed * Math.abs(this.speed) * 0.0009 * dt;
    this.speed = Math.max(-maxSpeed * 0.3, Math.min(speedCap, this.speed));
    if (Math.abs(this.speed) < 0.05) this.speed = 0;

    // ── direction : précise à basse vitesse, stable à haute vitesse ──
    const speedFactor = Math.min(1, (Math.abs(this.speed) / 4) * grip);
    const stability = 1 / (1 + Math.abs(this.speed) / (heavy ? 22 : 30));
    const dirSign = this.speed >= 0 ? 1 : -1;
    this.heading -= steer * turnRate * speedFactor * (0.55 + 0.45 * stability) * (0.7 + 0.3 * surfaceGrip) * dirSign * dt;

    // ── suspensions visuelles : tangage à l'accélération/freinage, rebond amorti ──
    const accelNow = (this.speed - this.prevSpeed) / Math.max(dt, 1e-3);
    this.prevSpeed = this.speed;
    const targetPitch = THREE.MathUtils.clamp(-accelNow * (heavy ? 0.0035 : 0.006), -0.11, 0.11);
    this.pitchVis += (targetPitch - this.pitchVis) * Math.min(1, dt * 6);
    this.bounceVel += (-this.bounceVis * 70 - this.bounceVel * 9) * dt;
    this.bounceVis += this.bounceVel * dt;
    this.bikeTilt.rotation.x = this.pitchVis;
    this.bikeTilt.position.y = this.bounceVis;
    // braquage visible de la roue avant
    this.frontWheel.rotation.y += (-steer * 0.35 - this.frontWheel.rotation.y) * Math.min(1, dt * 10);

    // move
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    // nitro boost
    if (this.nitroActive) {
      this.nitroTimer -= dt;
      if (this.nitroTimer <= 0) this.nitroActive = false;
      this.speed += accelPower * 2.5 * dt;
      // amélioration Turbo : consomme moins
      this.nitroCharge = Math.max(0, this.nitroCharge - dt * (15 - this.upgrades.boost * 1.5));
      if (Math.random() < 0.8) {
        const ex = this.pos.x - fx * 1.8;
        const ez = this.pos.y - fz * 1.8;
        this.burst(ex, 0.6, ez, 0x22d3ee, 8, 6, 4, 0.3);
      }
    } else {
      if (Math.abs(this.speed) > maxSpeed * 0.6) {
        this.nitroCharge = Math.min(this.nitroMax, this.nitroCharge + dt * 8);
      }
    }
    let nx = this.pos.x + fx * this.speed * dt;
    let nz = this.pos.y + fz * this.speed * dt;

    // building collisions
    const r = 2.0;
    for (const b of this.buildings) {
      const dx = nx - b.x;
      const dz = nz - b.z;
      const px = Math.max(-b.hw, Math.min(b.hw, dx));
      const pz = Math.max(-b.hd, Math.min(b.hd, dz));
      const cx = b.x + px;
      const cz = b.z + pz;
      const ddx = nx - cx;
      const ddz = nz - cz;
      const distSq = ddx * ddx + ddz * ddz;
      if (distSq < r * r) {
        const dist = Math.sqrt(distSq) || 0.001;
        const push = (r - dist) / dist;
        nx += ddx * push;
        nz += ddz * push;
        if (Math.abs(this.speed) > 14) {
          this.triggerCrash();
        }
        this.fatigue = Math.min(100, this.fatigue + dt * 2);
        this.speed *= 0.4;
      }
    }

    // limites de la carte
    const bound = HALF + 8;
    nx = Math.max(-bound, Math.min(bound, nx));
    nz = Math.max(-bound, Math.min(bound, nz));

    this.pos.set(nx, nz);
    this.bike.position.set(nx, 0, nz);
    this.bike.rotation.y = this.heading;

    // inclinaison dans les virages (réduite si fatigué)
    // moto : penche dans le virage ; voiture : léger roulis vers l'extérieur
    const lean = (heavy ? 0.1 : -0.4) * steer * speedFactor * dirSign * (1 - this.fatigue * 0.004);
    this.bikeTilt.rotation.z += (lean - this.bikeTilt.rotation.z) * Math.min(1, dt * 8);

    // wheel spin
    const spin = this.speed * dt * 1.3;
    this.frontWheel.children[0].rotation.x += spin;
    this.rearWheel.children[0].rotation.x += spin;

    // car collisions
    for (const car of this.cars) {
      if (!car.mesh.visible) continue;
      const cdx = nx - car.mesh.position.x;
      const cdz = nz - car.mesh.position.z;
      const carRadius = car.mesh.children.length > 0 && car.mesh.children[0].scale.x < 0.8 ? 1.7 : 2.35;
      if (Math.hypot(cdx, cdz) < carRadius) {
        if (Math.abs(this.speed) > 8) this.triggerCrash();
        this.speed *= 0.2;
        const d = Math.hypot(cdx, cdz) || 0.001;
        nx += (cdx / d) * 1.5;
        nz += (cdz / d) * 1.5;
        this.pos.set(nx, nz);
        this.bike.position.set(nx, 0, nz);
      }
    }

    // crash/hazard cooldowns (prevent audio & shake spam on prolonged contact)
    if (this.crashCooldown > 0) this.crashCooldown -= dt;
    if (this.hazardCooldown > 0) this.hazardCooldown -= dt;
    for (const bump of this.speedBumps) {
      const bdx = nx - bump.position.x;
      const bdz = nz - bump.position.z;
      if (Math.abs(bdx) < 2.5 && Math.abs(bdz) < 3 && this.hazardCooldown <= 0 && Math.abs(this.speed) > 4) {
        this.speed *= 0.75;
        this.shake = Math.max(this.shake, 0.08);
        this.bounceVel = 2.2 + Math.min(2, Math.abs(this.speed) * 0.06); // la suspension encaisse
        audio.click();
        this.hazardCooldown = 0.4;
      }
    }

    // pothole collisions
    for (const hole of this.potholes) {
      const hdx = nx - hole.position.x;
      const hdz = nz - hole.position.z;
      if (Math.hypot(hdx, hdz) < 2.0 && this.hazardCooldown <= 0 && Math.abs(this.speed) > 4) {
        this.speed *= 0.6;
        this.shake = Math.max(this.shake, 0.18);
        this.bounceVel = -2.6;
        this.nitroCharge = Math.max(0, this.nitroCharge - 10);
        audio.crash();
        this.hazardCooldown = 0.6;
      }
    }

    // stone obstacle collisions
    for (const obs of this.stoneObstacles) {
      const odx = nx - obs.position.x;
      const odz = nz - obs.position.z;
      if (Math.hypot(odx, odz) < 2.2 && this.hazardCooldown <= 0) {
        this.speed *= 0.3;
        this.shake = Math.max(this.shake, 0.25);
        audio.crash();
        this.hazardCooldown = 0.6;
      }
    }

    // collisions avec les piétons
    for (const p of this.peds) {
      if (!p.alive) continue;
      const pdx = nx - p.mesh.position.x;
      const pdz = nz - p.mesh.position.z;
      if (pdx * pdx + pdz * pdz < 2.6 * 2.6 && Math.abs(this.speed) > 5) {
        p.alive = false;
        p.mesh.visible = false;
        p.respawn = 3;
        this.combo = 1;
        this.timeLeft = Math.max(0, this.timeLeft - 3);
        this.shake = Math.max(this.shake, 0.35);
        this.burst(p.mesh.position.x, 1.5, p.mesh.position.z, 0xff5555, 14);
        audio.crash();
        // Amende ou prison : avec de l'argent on paie, sinon prison
        const fine = 50 + (this.level - 1) * 10;
        this.fineAmount += fine;
        this.fatigue = Math.min(100, this.fatigue + 12);
        this.combo = 1;
        if (this.money >= fine) {
          this.money -= fine;
          audio.coin();
          // red "-$xx" floating text at the crash site
          const world = new THREE.Vector3(p.mesh.position.x, 3, p.mesh.position.z);
          world.project(this.camera);
          const fx2 = (world.x * 0.5 + 0.5) * this.canvas.clientWidth;
          const fy2 = (-world.y * 0.5 + 0.5) * this.canvas.clientHeight;
          this.cb.onDelivery(-fine, 0, fx2, fy2);
        } else {
          // broke → straight to jail
          this.jailTime = 10;
          this.phase = "jail";
          audio.fail();
          this.emitHud();
          return; // halt the rest of this frame's logic immediately
        }
      }
    }

    this.detectNearbyPoi(dt);

    // fatigue builds up with the distance travelled, slows handling when high
    this.fatigue = Math.min(100, this.fatigue + Math.abs(this.speed) * dt * 0.12 + dt * 0.3);
    this.hunger = Math.min(100, this.hunger + dt * 0.07);

    // exhaust particles when moving
    if (Math.abs(this.speed) > 8 && Math.random() < 0.6) {
      const ex = nx - fx * 0.9;
      const ez = nz - fz * 0.9;
      this.spawnParticle(ex, 0.35, ez, new THREE.Color(0x888888), 1.2, 1.2, 0.5);
    }

    // prise du colis : il faut s'arrêter devant l'expéditeur (pas au passage)
    if (!this.freeRoam && !this.hasPackage) {
      if (this.pos.distanceTo(this.pickupPos) < 6 && Math.abs(this.speed) < 2.5) {
        this.hasPackage = true;
        this.packageMesh.visible = true;
        this.pickupMarker.visible = false;
        this.deliverMarker.visible = true;
        this.deliveryStage = "drive";
        audio.pickup();
        this.burst(this.pickupPos.x, 2, this.pickupPos.y, 0xffd93d, 16);
        this.shake = Math.max(this.shake, 0.12);
        // l'expéditeur sort et vous remet le colis
        this.spawnCourier(this.pickupPos.x, this.pickupPos.y, this.pos.x, this.pos.y);
        this.throwPackage(
          new THREE.Vector3((this.pickupPos.x + this.pos.x) / 2, 1.4, (this.pickupPos.y + this.pos.y) / 2),
          new THREE.Vector3(this.pos.x, 2.4, this.pos.y)
        );
      }
    } else if (!this.freeRoam) {
      // livraison : passer devant ne suffit pas — il faut se garer et descendre
      const near = this.pos.distanceTo(this.deliverPos) < 14;
      if (near && this.deliveryStage === "drive") {
        this.deliveryStage = "arrived";
        this.ensureClientNpc();
        audio.click();
      } else if (!near && this.deliveryStage === "arrived") {
        this.deliveryStage = "drive";
      }
    }

    this.checkNavigationArrival();

    // timer
    if (!this.freeRoam) this.timeLeft -= dt;
    if (!this.freeRoam && this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.gameOver();
      return;
    }

    // caméra de poursuite
    this.updateCamera(dt, fx, fz);

    // son moteur
    audio.updateEngine(Math.min(1, Math.abs(this.speed) / maxSpeed));

    // HUD limité à ~15 fps
    this.hudAccum += dt;
    if (this.hudAccum > 0.06) {
      this.hudAccum = 0;
      this.emitHud();
    }

    this.updateTraffic(dt);
    this.updateCouriers(dt);
    this.updateFlyBoxes(dt);
  }

  private updateWalking(dt: number) {
    let move = 0;
    let steer = 0;
    if (this.keys["w"] || this.keys["arrowup"]) move += 1;
    if (this.keys["s"] || this.keys["arrowdown"]) move -= 1;
    if (this.keys["a"] || this.keys["arrowleft"]) steer -= 1;
    if (this.keys["d"] || this.keys["arrowright"]) steer += 1;
    move = Math.max(-1, Math.min(1, move + this.touchThrottle));
    steer = Math.max(-1, Math.min(1, steer + this.touchSteer));

    const running = (this.keys["shift"] || this.touchBrake || this.runToggled) && move > 0;
    // Déplacements physiques réalistes : marche naturelle et course rapide
    const targetSpeed = move * (running ? DEFAULT_MOVEMENT.runSpeed : DEFAULT_MOVEMENT.walkSpeed) * (1 - this.fatigue * 0.003);
    const accelRate = (move !== 0) ? DEFAULT_MOVEMENT.acceleration : DEFAULT_MOVEMENT.deceleration;
    this.walkVel += (targetSpeed - this.walkVel) * Math.min(1, dt * accelRate);
    this.walkerHeading -= steer * (running ? DEFAULT_MOVEMENT.turnSpeedRun : DEFAULT_MOVEMENT.turnSpeedWalk) * dt;
    const fx = Math.sin(this.walkerHeading);
    const fz = Math.cos(this.walkerHeading);
    let nx = this.pos.x + fx * this.walkVel * dt;
    let nz = this.pos.y + fz * this.walkVel * dt;

    // collisions piéton (rayon 0.45 m) avec bâtiments, murs, arbres, véhicules garés
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.buildings) {
        const dx = nx - b.x;
        const dz = nz - b.z;
        if (Math.abs(dx) > b.hw + 1 || Math.abs(dz) > b.hd + 1) continue;
        const px = Math.max(-b.hw, Math.min(b.hw, dx));
        const pz = Math.max(-b.hd, Math.min(b.hd, dz));
        let ddx = nx - (b.x + px);
        let ddz = nz - (b.z + pz);
        let distSq = ddx * ddx + ddz * ddz;
        if (distSq < 1e-6) {
          // à l'intérieur : sortir par la face la plus proche
          const ex = b.hw - Math.abs(dx);
          const ez = b.hd - Math.abs(dz);
          if (ex < ez) { ddx = Math.sign(dx) || 1; ddz = 0; distSq = 0; }
          else { ddx = 0; ddz = Math.sign(dz) || 1; distSq = 0; }
          nx += ddx * (ex < ez ? ex + 0.45 : 0);
          nz += ddz * (ex < ez ? 0 : ez + 0.45);
          continue;
        }
        if (distSq < 0.45 * 0.45) {
          const dist = Math.sqrt(distSq);
          nx += (ddx / dist) * (0.45 - dist);
          nz += (ddz / dist) * (0.45 - dist);
        }
      }
    }
    // le véhicule du joueur est aussi un obstacle
    {
      const dx = nx - this.bike.position.x;
      const dz = nz - this.bike.position.z;
      const d = Math.hypot(dx, dz);
      const wide = this.vehicle.bodyType === "van" || this.vehicle.bodyType === "tuktuk";
      const minD = wide ? 1.9 : 0.75;
      if (d < minD && d > 1e-4) {
        nx += (dx / d) * (minD - d);
        nz += (dz / d) * (minD - d);
      }
    }

    const bound = HALF + 8;
    nx = Math.max(-bound, Math.min(bound, nx));
    nz = Math.max(-bound, Math.min(bound, nz));
    const moved = Math.hypot(nx - this.pos.x, nz - this.pos.y);
    this.pos.set(nx, nz);
    this.walker.position.set(nx, 0, nz);
    this.walker.rotation.y = this.walkerHeading;

    // Détection des pas sonores
    if (moved > 0.001) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = running ? 0.30 : 0.48;
        const isDirt = Math.abs(nx) > 175 || Math.abs(nz) > 175;
        audio.step(isDirt ? "dirt" : "asphalt", running);
      }
    }

    // Détection des bâtiments visitables et pièces intérieures
    this.currentBuilding = null;
    this.currentRoom = null;
    if (this.city.visitableBuildings) {
      for (const vb of this.city.visitableBuildings) {
        if (nx >= vb.bounds.minX && nx <= vb.bounds.maxX && nz >= vb.bounds.minZ && nz <= vb.bounds.maxZ) {
          this.currentBuilding = vb;
          if (vb.rooms) {
            let closestRoom = null;
            let closestDist = 5.0;
            for (const rm of vb.rooms) {
              const d = Math.hypot(nx - rm.x, nz - rm.z);
              if (d < closestDist) {
                closestDist = d;
                closestRoom = rm;
              }
            }
            if (closestRoom) this.currentRoom = closestRoom;
          }
          break;
        }
      }
    }

    // animation : la foulée suit la distance réellement parcourue (aucun glissement)
    let pose: Pose = moved > 0.002 ? (running ? "run" : "walk") : "idle";
    if (this.socialAnimTimer > 0) {
      this.socialAnimTimer -= dt;
      pose = this.socialPose;
    } else if (this.hasPackage && pose === "idle") {
      pose = "idle";
    }
    animateRig(this.walkerRig, dt, pose, moved, running);
    // colis porté : les deux bras se replient vers l'avant quand on marche avec
    if (this.hasPackage && this.socialAnimTimer <= 0) {
      const carry = Math.min(1, this.walkerRig.blend.walk + this.walkerRig.blend.run + 0.6);
      this.walkerRig.shoulderR.rotation.x = -1.1 * carry;
      this.walkerRig.shoulderL.rotation.x = -1.1 * carry;
      this.walkerRig.elbowR.rotation.x = -0.9;
      this.walkerRig.elbowL.rotation.x = -0.9;
      this.walkerRig.shoulderR.rotation.z = -0.15;
      this.walkerRig.shoulderL.rotation.z = 0.15;
    }

    this.nearNpc = null;
    for (const p of this.peds) {
      if (!p.alive) continue;
      if (Math.hypot(nx - p.mesh.position.x, nz - p.mesh.position.z) < 3.5) {
        this.nearNpc = p;
        break;
      }
    }

    for (const car of this.cars) {
      const dx = nx - car.mesh.position.x;
      const dz = nz - car.mesh.position.z;
      if (Math.hypot(dx, dz) < 2.4) {
        this.pos.x -= fx * 1.2;
        this.pos.y -= fz * 1.2;
        this.walker.position.set(this.pos.x, 0, this.pos.y);
        this.fatigue = Math.min(100, this.fatigue + 10);
        this.triggerCrash();
        break;
      }
    }

    this.detectNearbyPoi(dt);
    this.checkNavigationArrival();

    if (!this.freeRoam) {
      if (!this.hasPackage && this.pos.distanceTo(this.pickupPos) < 4) {
        this.hasPackage = true;
        this.walkerPackage.visible = true;
        this.pickupMarker.visible = false;
        this.deliverMarker.visible = true;
        audio.pickup();
        this.spawnCourier(this.pickupPos.x, this.pickupPos.y, nx, nz);
      } else if (this.hasPackage) {
        // à pied devant la porte du client : proposer la remise en main propre (touche E)
        const atDoor = this.pos.distanceTo(this.deliverDoor) < 3.4;
        if (atDoor && this.deliveryStage !== "handover") {
          this.deliveryStage = "handover";
          this.ensureClientNpc();
          audio.click();
        } else if (!atDoor && this.deliveryStage === "handover") {
          this.deliveryStage = "arrived";
        }
      }
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.gameOver();
        return;
      }
    }

    this.fatigue = Math.min(100, this.fatigue + Math.abs(move) * dt * (running ? 0.45 : 0.18));
    this.hunger = Math.min(100, this.hunger + dt * 0.09);
    this.updateTraffic(dt);
    this.updateCouriers(dt);
    this.updateFlyBoxes(dt);

    this.updateWalkCamera(dt, fx, fz, running);

    this.hudAccum += dt;
    if (this.hudAccum > 0.06) {
      this.hudAccum = 0;
      this.emitHud();
    }
  }

  private walkVel = 0;

  /** caméra épaule : derrière et légèrement au-dessus du personnage, recule en courant, ne traverse pas les murs */
  private updateWalkCamera(dt: number, fx: number, fz: number, running: boolean) {
    const px = this.walker.position.x;
    const pz = this.walker.position.z;
    // vue par-dessus l'épaule : décalée à droite pour ne pas cacher ce qui est devant (client, porte)
    let dist = running ? 6.0 : 5.0;
    let height = 3.4;
    let side = 0.9;
    if (this.cameraView === "rapprochee") { dist = 3.4; height = 2.4; side = 0.7; }
    if (this.cameraView === "conduite") { dist = 2.4; height = 2.0; side = 0.5; }
    const rx = Math.cos(this.walkerHeading); // vecteur « droite » du personnage
    const rz = -Math.sin(this.walkerHeading);
    let cx = px - fx * dist + rx * side;
    let cz = pz - fz * dist + rz * side;
    // anti-obstruction : si la caméra tombe dans un mur ou sous un auvent/parasol, se rapprocher
    for (let k = 0; k < 8 && this.cameraBlocked(cx, height, cz); k++) {
      const f = 1 - (k + 1) / 8;
      cx = px - fx * dist * f + rx * side * f;
      cz = pz - fz * dist * f + rz * side * f;
      height = Math.max(2.0, height - 0.15);
    }
    // dernier recours : passer au-dessus de l'obstacle plutôt que de rester dedans
    if (this.cameraBlocked(cx, height, cz)) height = 3.6;
    const desired = new THREE.Vector3(cx, height, cz);
    this.camera.position.lerp(desired, this.snapCam ? 1 : Math.min(1, dt * 6));
    const look = new THREE.Vector3(px + fx * 3.5 + rx * side * 0.5, 1.3, pz + fz * 3.5 + rz * side * 0.5);
    if (this.snapCam) {
      this.camLook.copy(look);
      this.snapCam = false;
    } else this.camLook.lerp(look, Math.min(1, dt * 8));
    this.camera.lookAt(this.camLook);
    const fov = 58 + (running ? 6 : 0);
    this.camFov += (fov - this.camFov) * Math.min(1, dt * 3);
    if (Math.abs(this.camera.fov - this.camFov) > 0.05) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private detectNearbyPoi(dt: number) {
    if (this.poiCooldown > 0) this.poiCooldown -= dt;
    const prevPoi = this.nearPoi;
    this.nearPoi = null;
    if (this.poiCooldown > 0) return;
    for (const pm of this.poiMeshes) {
      const dx = this.pos.x - pm.mesh.position.x;
      const dz = this.pos.y - pm.mesh.position.z;
      if (Math.hypot(dx, dz) < 9 && Math.abs(this.speed) <= 3) {
        this.nearPoi = pm.poi;
        break;
      }
    }
    if (this.nearPoi && this.nearPoi !== prevPoi) audio.click();
  }

  private checkNavigationArrival() {
    if (!this.navActive || this.pos.distanceTo(this.navPos) > 6) return;
    const label = this.navLabel;
    this.navActive = false;
    this.navLabel = "";
    this.navMarker.visible = false;
    audio.deliver();
    this.cb.onArrived?.(label);
  }

  /** vrai si le point (x,z) est à l'intérieur d'un bâtiment (test 2D des boîtes de collision) */
  private insideBuilding(x: number, z: number) {
    for (const b of this.buildings) {
      if (b.hw < 1.5 || b.hd < 1.5) continue; // ignorer arbres, motos garées…
      if (Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd) return true;
    }
    return false;
  }

  /** vrai si une caméra à (x, y, z) serait masquée : bâtiment, ou kiosque/paillote avec toit bas (< 3.4 m) */
  private cameraBlocked(x: number, y: number, z: number) {
    if (this.insideBuilding(x, z)) return true;
    if (y < 3.4) {
      for (const pm of this.poiMeshes) {
        const dx = Math.abs(x - pm.mesh.position.x);
        const dz = Math.abs(z - pm.mesh.position.z);
        if (dx < 3.2 && dz < 3.2) return true; // sous l'auvent / le parasol
      }
    }
    return false;
  }

  private snapCam = false;

  /** outils de vérification (exposés uniquement avec ?debug dans l'URL) */
  debugTeleport(x: number, z: number, heading = 0) {
    // remet le joueur EN VÉHICULE à cet endroit (tests)
    this.mountT = 0;
    this.playerMode = "vehicle";
    this.walker.visible = false;
    if (this.bikeRider) this.bikeRider.visible = this.cameraView !== "conduite";
    this.walkerPackage.visible = false;
    this.packageMesh.visible = this.hasPackage;
    this.speed = 0;
    this.cruiseOn = false;
    this.pos.set(x, z);
    this.heading = heading;
    this.walkerHeading = heading;
    this.bike.position.set(x, 0, z);
    this.bike.rotation.y = heading;
    this.walker.position.set(x, 0, z);
    this.snapCam = true;
  }
  /** temps de jeu écoulé (s) — permet aux tests d'attendre en temps simulé */
  gameTime = 0;
  debugSetHour(h: number) {
    this.env.setHour(h);
  }
  debugSetWeather(w: Weather) {
    this.env.setWeather(w, true);
  }
  /** instantané de l'état interne (tests automatisés uniquement) */
  debugState() {
    return {
      phase: this.phase,
      mode: this.playerMode,
      speed: Math.round(Math.abs(this.speed) * 3.6),
      cruiseOn: this.cruiseOn,
      cruiseTarget: this.cruiseTarget,
      hasPackage: this.hasPackage,
      stage: this.deliveryStage,
      pos: [Math.round(this.pos.x * 10) / 10, Math.round(this.pos.y * 10) / 10],
      bike: [Math.round(this.bike.position.x * 10) / 10, Math.round(this.bike.position.z * 10) / 10],
      pickup: [Math.round(this.pickupPos.x), Math.round(this.pickupPos.y)],
      door: [Math.round(this.deliverDoor.x * 10) / 10, Math.round(this.deliverDoor.y * 10) / 10],
      deliveries: this.deliveriesDone,
      money: this.money,
      timeLeft: Math.round(this.timeLeft),
      freeRoam: this.freeRoam,
      bubbles: this.bubbles.length,
      mounting: this.mountT > 0,
      walkerVisible: this.walker.visible,
      riderVisible: !!this.bikeRider?.visible,
      client: !!this.clientNpc,
      couriers: this.couriers.length,
      peds: this.peds.length,
    };
  }
  /** téléporte le joueur À PIED (tests) */
  debugTeleportWalk(x: number, z: number, heading = 0) {
    if (this.playerMode !== "walk") {
      this.playerMode = "walk";
      this.walker.visible = true;
      if (this.bikeRider) this.bikeRider.visible = false;
      this.packageMesh.visible = false;
      this.walkerPackage.visible = this.hasPackage;
      this.speed = 0;
    }
    this.mountT = 0;
    this.pos.set(x, z);
    this.walkerHeading = heading;
    this.walker.position.set(x, 0, z);
    this.walker.rotation.y = heading;
    this.snapCam = true;
  }

  private updateCamera(dt: number, fx: number, fz: number) {
    const spd = Math.abs(this.speed);
    const v01 = Math.min(1, spd / Math.max(1, this.getMaxSpeed()));
    let dist: number;
    let height: number;
    let lookAhead: number;
    let fov: number;
    if (this.cameraView === "conduite") {
      dist = -0.3; // au niveau des yeux du conducteur
      height = this.vehicle.bodyType === "van" || this.vehicle.bodyType === "tuktuk" ? 1.9 : 1.5;
      lookAhead = 30;
      fov = 70 + v01 * 10;
    } else if (this.cameraView === "rapprochee") {
      dist = 8 + v01 * 3;
      height = 3.6 + v01 * 0.6;
      lookAhead = 10;
      fov = 62 + v01 * 8;
    } else {
      dist = 13 + v01 * 6; // recule légèrement avec la vitesse
      height = 6.5 + v01 * 2;
      lookAhead = 8 + v01 * 6;
      fov = 60 + v01 * 12;
    }
    // le livreur est masqué en vue conduite pour ne pas traverser la caméra
    if (this.bikeRider) this.bikeRider.visible = this.cameraView !== "conduite" && this.playerMode === "vehicle";

    let camX = this.pos.x - fx * dist;
    let camZ = this.pos.y - fz * dist;
    // anti-traversée : si la position souhaitée est dans un bâtiment/kiosque, se rapprocher du véhicule
    if (dist > 2) {
      for (let k = 0; k < 8 && this.cameraBlocked(camX, height, camZ); k++) {
        const d2 = dist * (1 - (k + 1) / 8);
        camX = this.pos.x - fx * d2;
        camZ = this.pos.y - fz * d2;
        height = Math.max(3, height - 0.4);
      }
    }
    const desired = new THREE.Vector3(camX, height + this.bounceVis * 0.3, camZ);
    // suivi souple : plus rapide quand on va vite, pour ne jamais « perdre » le véhicule
    let follow = this.cameraView === "conduite" ? 1 : Math.min(1, dt * (3.5 + v01 * 4));
    if (this.snapCam) {
      follow = 1; // départ de niveau / téléportation : placement immédiat (pas de survol des toits)
      this.camLook.set(this.pos.x + fx * lookAhead, 1.8, this.pos.y + fz * lookAhead);
      this.snapCam = false;
    }
    this.camera.position.lerp(desired, follow);
    if (this.shake > 0) {
      this.shake -= dt;
      const s = this.shake * 2.2;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.camFov += (fov - this.camFov) * Math.min(1, dt * 3);
    if (Math.abs(this.camera.fov - this.camFov) > 0.05) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }
    const look = new THREE.Vector3(this.pos.x + fx * lookAhead, this.cameraView === "conduite" ? 1.5 : 1.8, this.pos.y + fz * lookAhead);
    this.camLook.lerp(look, Math.min(1, dt * 6));
    this.camera.lookAt(this.camLook);
  }

  private triggerCrash() {
    if (this.crashCooldown > 0) return; // one crash burst per contact, not per frame
    this.crashCooldown = 0.8;
    this.shake = Math.max(this.shake, 0.4);
    this.burst(this.pos.x, 1.5, this.pos.y, 0xffaa33, 10, 6, 5, 0.6);
    audio.crash();
    this.combo = 1;
  }

  private completeDelivery() {
    // Realistic courier pay: short trips never exceed $20,
    // only long hauls pay more (up to $45).
    const dist = this.pickupPos.distanceTo(this.deliverPos);
    const far = dist > 180;
    // plafond strict : 20 $ si ce n'est pas très loin, 42 $ pour les longs trajets
    const cap = far ? 42 : 20;
    const speedBonus = Math.max(0, Math.min(5, Math.round((this.timeLeft / this.timeTotal) * 5)));
    let reward = Math.min(cap, Math.round(6 + dist * 0.035) + speedBonus);
    // combo : livraison rapide = bonus
    if (this.timeLeft / this.timeTotal > 0.4) this.combo = Math.min(5, this.combo + 1);
    if (this.combo > 1) reward = Math.round(reward * (1 + (this.combo - 1) * 0.1));
    reward = Math.min(cap, reward); // jamais au-dessus du plafond
    this.money += reward;
    this.score += reward + this.combo * 10;
    this.deliveriesDone++;
    this.missionsCompleted++;

    audio.deliver();
    audio.coin();
    this.burst(this.deliverPos.x, 2, this.deliverPos.y, 0x34c759, 24, 10, 9, 1.1);
    this.burst(this.deliverPos.x, 2, this.deliverPos.y, 0xffd93d, 16, 8, 8, 1.0);
    this.shake = Math.max(this.shake, 0.2);

    // remise en main propre : le client attend déjà devant sa porte (clientNpc) ;
    // s'il n'y en a pas (mode véhicule ancien), un habitant vient recevoir le colis
    if (!this.clientNpc) {
      this.spawnCourier(this.deliverPos.x, this.deliverPos.y, this.pos.x, this.pos.y);
      this.throwPackage(
        new THREE.Vector3(this.pos.x, 2.4, this.pos.y),
        new THREE.Vector3((this.pos.x + this.deliverPos.x) / 2, 1.4, (this.pos.y + this.deliverPos.y) / 2)
      );
    } else {
      // le client remercie (réaction variée + bulle « Merci ! ») puis rentre chez lui
      const npc = this.clientNpc;
      const rig = this.clientRig!;
      this.clientNpc = null;
      this.clientRig = null;
      const reactions: { text: string; cheer: boolean }[] = [
        { text: "Merci !", cheer: false },
        { text: "Bonne journée !", cheer: false },
        { text: "Merci beaucoup !", cheer: true },
        { text: "Asante sana !", cheer: false },
        { text: "Super, merci !", cheer: true },
        { text: "À la prochaine !", cheer: false },
      ];
      const r = reactions[Math.floor(Math.random() * reactions.length)];
      this.say(npc, r.text, 2.8);
      // « sourire » : la tête se relève vers le livreur pendant le remerciement
      rig.head.rotation.x = -0.12;
      const home = new THREE.Vector2(npc.position.x, npc.position.z).add(
        new THREE.Vector2(this.deliverDoor.x - this.deliverPos.x, this.deliverDoor.y - this.deliverPos.y).normalize().multiplyScalar(2.2)
      );
      this.couriers.push({
        mesh: npc,
        rig,
        from: home,
        to: new THREE.Vector2(npc.position.x, npc.position.z),
        t: 1,
        state: "wait",
        waitT: r.cheer ? 2.4 : 1.8,
        cheer: r.cheer,
      });
    }
    // le colis disparaît de l'arrière de la moto
    if (this.packageMesh) this.packageMesh.visible = false;

    // position écran pour le texte flottant
    const world = new THREE.Vector3(this.deliverPos.x, 4, this.deliverPos.y);
    world.project(this.camera);
    const sx = (world.x * 0.5 + 0.5) * this.canvas.clientWidth;
    const sy = (-world.y * 0.5 + 0.5) * this.canvas.clientHeight;
    this.cb.onDelivery(reward, this.combo, sx, sy);

    // Sons de livraison et de remerciement du client
    audio.deliver();
    audio.clientThank();

    // Enregistrement de la vraie mission dans le Journal des Missions
    const currentDistrictName = getDistrictAt(this.deliverPos.x, this.deliverPos.y);
    addMissionRecord({
      level: this.level,
      missionNumber: this.deliveriesDone,
      destination: this.deliverLabel || "Destinataire à Beni",
      district: currentDistrictName,
      reward,
      status: "Terminée",
      time: this.env.clockLabel(),
    });

    this.fatigue = Math.max(0, this.fatigue - 5); // courte pause à la remise
    this.hasPackage = false;
    this.deliverMarker.visible = false;
    this.pickupMarker.visible = false;
    if (this.deliveriesDone >= this.deliveriesNeeded) {
      // 20 livraisons terminées pour ce niveau
      this.freeRoam = true;
      this.timeLeft = 0;
      audio.updateEngine(0);
      audio.levelup();

      if (this.level >= 3) {
        // Niveau 3 terminé = Victoire totale des 60 missions !
        this.phase = "victory";
        this.emitHud();
        this.cb.onVictory(this.score, this.money);
      } else {
        // Fin de niveau 1 ou 2 : déblocage du niveau suivant
        this.phase = "levelup";
        this.emitHud();
        this.cb.onLevelComplete(this.level);
      }
    } else {
      // livraison réussie : on laisse le joueur choisir la suite, sans compte à rebours
      audio.missionComplete();
      this.freeRoam = true;
      this.timeLeft = 0;
      this.deliveryChoice = true;
      this.deliveryChoiceT = 2.2; // laisse le temps de voir le « Merci ! » avant le menu
    }
    this.emitHud();
  }

  private deliveryChoice = false;
  private deliveryChoiceT = 0;

  /** reprend les livraisons après une pause libre (nouvelle mission avec son propre chrono) */
  continueDeliveries() {
    this.freeRoam = false;
    this.deliveryChoice = false;
    this.phase = "playing";
    this.newMission();
    audio.resume();
    if (this.playerMode === "vehicle") audio.startEngine();
    audio.click();
    this.emitHud();
  }

  /** ferme l'écran de choix et laisse le joueur libre (exploration, maison, quartier) */
  dismissDeliveryChoice() {
    this.deliveryChoice = false;
    this.freeRoam = true;
    if (this.phase === "delivered") this.phase = "playing";
    audio.click();
    this.emitHud();
  }

  private gameOver() {
    this.phase = "gameover";
    audio.fail();
    audio.updateEngine(0);
    this.cb.onGameOver(this.score, this.money);
    this.emitHud();
  }

  private emitHud() {
    const missionTarget = this.hasPackage ? this.deliverPos : this.pickupPos;
    const target = this.navActive
      ? this.navPos
      : this.freeRoam
        ? this.pos
        : missionTarget;
    this.cb.onHud({
      phase: this.phase,
      money: this.money,
      score: this.score,
      level: this.level,
      speed: Math.round(Math.abs(this.speed) * 3.6),
      maxSpeed: Math.round(this.getMaxSpeed() * 3.6),
      timeLeft: this.timeLeft,
      timeTotal: this.timeTotal,
      hasPackage: this.hasPackage,
      deliveriesDone: this.deliveriesDone,
      deliveriesNeeded: this.deliveriesNeeded,
      playerX: this.pos.x,
      playerZ: this.pos.y,
      playerHeading: this.playerMode === "walk" ? this.walkerHeading : this.heading,
      targetX: target.x,
      targetZ: target.y,
      worldSize: WORLD,
      targetLabel: this.navActive
        ? this.navLabel
        : this.freeRoam
          ? "Exploration libre"
          : this.hasPackage
            ? this.deliverLabel
            : this.pickupLabel,
      vehicleId: this.vehicle.id,
      lastReward: 0,
      combo: this.combo,
      fineAmount: this.fineAmount,
      jailTime: this.jailTime,
      nitroCharge: this.nitroCharge,
      nitroActive: this.nitroActive,
      nitroMax: this.nitroMax,
      currentMissionIndex: this.missionsCompleted,
      fatigue: Math.round(this.fatigue),
      // le prompt commerce est masqué pendant une remise de colis (priorité à la livraison)
      nearPoi:
        this.nearPoi && this.speed <= 3 && this.deliveryStage !== "handover" && this.mountT <= 0
          ? { name: this.nearPoi.name, type: this.nearPoi.type, emoji: this.nearPoi.emoji }
          : null,
      finePerHit: 50 + (this.level - 1) * 10,
      difficulty: this.level,
      playerMode: this.playerMode,
      freeRoam: this.freeRoam,
      navActive: this.navActive,
      navLabel: this.navLabel,
      navX: this.navPos.x,
      navZ: this.navPos.y,
      hunger: Math.round(this.hunger),
      nearNpc: !!this.nearNpc,
      canEnterVehicle:
        this.playerMode === "walk" &&
        Math.hypot(this.pos.x - this.bike.position.x, this.pos.y - this.bike.position.z) <= 5,
      vehicleX: this.bike.position.x,
      vehicleZ: this.bike.position.z,
      cruiseOn: this.cruiseOn,
      cruiseTarget: this.cruiseTarget,
      cameraView: this.cameraView,
      clock: this.env ? this.env.clockLabel() : "08:00",
      weather: this.env ? this.env.weather : "sunny",
      quality: this.quality,
      deliveryStage: this.deliveryStage,
      running: (this.keys["shift"] || this.touchBrake || this.runToggled) && Math.abs(this.walkVel) > 0.2,
      buildingName: this.currentBuilding ? this.currentBuilding.name : undefined,
      interiorRoom: this.currentRoom ? this.currentRoom.name : undefined,
      deliveryPrompt:
        this.currentBuilding
          ? this.currentBuilding.id === "home"
            ? this.currentRoom?.name === "Chambre"
              ? "Appuyer sur [E] pour dormir et récupérer"
              : this.currentRoom?.name === "Cuisine"
                ? "Appuyer sur [E] pour cuisiner un repas"
                : this.currentRoom?.name === "Salle de bain"
                  ? "Appuyer sur [E] pour prendre une douche"
                  : this.currentRoom?.name === "Salon"
                    ? "Appuyer sur [E] pour vous asseoir au salon"
                    : "Maison du joueur (Masiani)"
            : this.currentBuilding.id === "restaurant"
              ? "Appuyer sur [E] pour commander chez Mama Léontine"
              : this.currentBuilding.id === "shop"
                ? "Appuyer sur [E] pour faire vos achats (Kivu Express)"
                : this.currentBuilding.id === "pharmacy"
                  ? "Appuyer sur [E] pour acheter des soins médicaux"
                  : ""
          : (this.freeRoam || !this.hasPackage)
            ? ""
            : this.deliveryStage === "handover"
              ? "Remettre le colis au client"
              : this.deliveryStage === "arrived"
                ? this.playerMode === "vehicle"
                  ? "Client en vue : gare-toi et descends (F)"
                  : "Rejoins le client devant sa porte"
                : "",
      currentDistrict: getDistrictAt(this.pos.x, this.pos.y),
      homeRoom: this.homeRoom,
    });
  }

  dispose() {
    this.clearCouriers();
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    audio.stopEngine();
    this.renderer.dispose();
  }
}