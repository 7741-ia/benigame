import * as THREE from "three";
import { InteractiveTV } from "./interactiveTv";
import { audio } from "./audio";
import type { Recipe } from "./life";
import { RECIPES } from "./life";

export interface ContextualInteraction {
  id: string;
  type: string;
  title: string;
  prompt: string;
  actionText: string;
  icon: string;
  distance: number;
}

export interface HouseState {
  lightsOn: boolean;
  tvOn: boolean;
  tvChannel: number;
  tvVolume: number;
  frontDoorOpen: boolean;
  bedroomDoorOpen: boolean;
  bathroomDoorOpen: boolean;
  fridgeOpen: boolean;
  tapFlowing: boolean;
  showerActive: boolean;
  isCooking: boolean;
  cookedFood: string | null;
  servedFood: string | null;
  isSitting: boolean;
  sittingTarget: "sofa" | "table" | null;
}

export class HouseManager {
  public tv: InteractiveTV;
  public state: HouseState = {
    lightsOn: true,
    tvOn: false,
    tvChannel: 0,
    tvVolume: 75,
    frontDoorOpen: false,
    bedroomDoorOpen: true,
    bathroomDoorOpen: false,
    fridgeOpen: false,
    tapFlowing: false,
    showerActive: false,
    isCooking: false,
    cookedFood: null,
    servedFood: null,
    isSitting: false,
    sittingTarget: null,
  };

  // Coordonnées de base de la maison (gx 2, gz 7)
  public hx = 0;
  public hz = 0;

  // Références aux objets 3D pour animations
  public frontDoorGroup: THREE.Group | null = null;
  public bedroomDoorGroup: THREE.Group | null = null;
  public bathroomDoorGroup: THREE.Group | null = null;
  public tvScreenMesh: THREE.Mesh | null = null;
  public waterStreamMesh: THREE.Mesh | null = null;
  public showerSprayMesh: THREE.Mesh | null = null;
  public stoveFlameMesh: THREE.Mesh | null = null;
  public ceilingLight: THREE.PointLight | null = null;

  constructor() {
    this.tv = new InteractiveTV();
  }

  initHouseCoordinates(hx: number, hz: number) {
    this.hx = hx;
    this.hz = hz;
  }

  update(dt: number) {
    this.tv.update(dt);
    this.state.tvOn = this.tv.isOn;
    this.state.tvChannel = this.tv.channel;
    this.state.tvVolume = this.tv.volume;

    // Animation des portes pivotantes
    if (this.frontDoorGroup) {
      const targetRot = this.state.frontDoorOpen ? Math.PI * 0.48 : 0;
      this.frontDoorGroup.rotation.y += (targetRot - this.frontDoorGroup.rotation.y) * Math.min(1, dt * 10);
    }
    if (this.bedroomDoorGroup) {
      const targetRot = this.state.bedroomDoorOpen ? -Math.PI * 0.48 : 0;
      this.bedroomDoorGroup.rotation.y += (targetRot - this.bedroomDoorGroup.rotation.y) * Math.min(1, dt * 10);
    }
    if (this.bathroomDoorGroup) {
      const targetRot = this.state.bathroomDoorOpen ? Math.PI * 0.48 : 0;
      this.bathroomDoorGroup.rotation.y += (targetRot - this.bathroomDoorGroup.rotation.y) * Math.min(1, dt * 10);
    }

    // Animation eau de l'évier
    if (this.waterStreamMesh) {
      this.waterStreamMesh.visible = this.state.tapFlowing;
    }

    // Animation douche
    if (this.showerSprayMesh) {
      this.showerSprayMesh.visible = this.state.showerActive;
    }

    // Animation cuisson cuisinière
    if (this.stoveFlameMesh) {
      this.stoveFlameMesh.visible = this.state.isCooking;
      if (this.state.isCooking) {
        this.stoveFlameMesh.scale.setScalar(0.9 + Math.sin(performance.now() * 0.02) * 0.15);
      }
    }

    // Éclairage intérieur
    if (this.ceilingLight) {
      this.ceilingLight.intensity = this.state.lightsOn ? 1.4 : 0.05;
    }
  }

  toggleLights(): boolean {
    this.state.lightsOn = !this.state.lightsOn;
    audio.lightSwitch();
    return this.state.lightsOn;
  }

  toggleFrontDoor(): boolean {
    this.state.frontDoorOpen = !this.state.frontDoorOpen;
    audio.doorInteract(this.state.frontDoorOpen);
    return this.state.frontDoorOpen;
  }

  toggleBedroomDoor(): boolean {
    this.state.bedroomDoorOpen = !this.state.bedroomDoorOpen;
    audio.doorInteract(this.state.bedroomDoorOpen);
    return this.state.bedroomDoorOpen;
  }

  toggleBathroomDoor(): boolean {
    this.state.bathroomDoorOpen = !this.state.bathroomDoorOpen;
    audio.doorInteract(this.state.bathroomDoorOpen);
    return this.state.bathroomDoorOpen;
  }

  toggleFridge(): boolean {
    this.state.fridgeOpen = !this.state.fridgeOpen;
    audio.fridgeInteract();
    return this.state.fridgeOpen;
  }

  toggleTap(): boolean {
    this.state.tapFlowing = !this.state.tapFlowing;
    audio.waterTap(this.state.tapFlowing);
    return this.state.tapFlowing;
  }

  startShower(): boolean {
    this.state.showerActive = !this.state.showerActive;
    audio.shower();
    return this.state.showerActive;
  }

  cookMeal(recipeName = "Makemba"): Recipe | null {
    this.state.isCooking = true;
    audio.cookSizzle();
    const recipe = RECIPES.find((r) => r.name === recipeName) || RECIPES[0];
    this.state.cookedFood = recipe.name;
    window.setTimeout(() => {
      this.state.isCooking = false;
      this.state.servedFood = recipe.name;
    }, 2500);
    return recipe;
  }

  eatServedMeal(): string | null {
    if (!this.state.servedFood) return null;
    const food = this.state.servedFood;
    this.state.servedFood = null;
    audio.eatSound();
    return food;
  }

  toggleSit(target: "sofa" | "table"): boolean {
    if (this.state.isSitting) {
      this.state.isSitting = false;
      this.state.sittingTarget = null;
      audio.sitDown();
      return false;
    } else {
      this.state.isSitting = true;
      this.state.sittingTarget = target;
      audio.sitDown();
      return true;
    }
  }

  flushToilet() {
    audio.waterTap(true);
  }

  /**
   * Détecte intelligemment l'objet interactif le plus proche du joueur.
   * Retourne une interaction unique et contextuelle.
   */
  getClosestInteraction(px: number, pz: number): ContextualInteraction | null {
    const hx = this.hx;
    const hz = this.hz;

    // Définition de tous les objets interactifs de la maison
    const targets = [
      // 1. Porte d'entrée
      {
        id: "frontDoor",
        type: "door",
        title: "Porte d'entrée",
        prompt: this.state.frontDoorOpen ? "Fermer la porte" : "Ouvrir la porte",
        actionText: this.state.frontDoorOpen ? "Fermer" : "Ouvrir",
        icon: "🚪",
        x: hx,
        z: hz + 5.0,
        radius: 2.2,
      },
      // 2. Télévision (Salon)
      {
        id: "tv",
        type: "tv",
        title: "Télévision",
        prompt: this.tv.isOn ? `Regarder TV (${CHANNELS[this.tv.channel].name})` : "Allumer la télévision",
        actionText: this.tv.isOn ? "Zapper" : "Allumer",
        icon: "📺",
        x: hx - 5.2,
        z: hz + 1.4,
        radius: 2.8,
      },
      // 3. Canapé (Salon)
      {
        id: "sofa",
        type: "sofa",
        title: "Canapé du salon",
        prompt: this.state.isSitting && this.state.sittingTarget === "sofa" ? "Se lever du canapé" : "S'asseoir sur le canapé",
        actionText: this.state.isSitting && this.state.sittingTarget === "sofa" ? "Se lever" : "S'asseoir",
        icon: "🛋️",
        x: hx - 3.8,
        z: hz + 2.5,
        radius: 2.2,
      },
      // 4. Interrupteur d'éclairage
      {
        id: "light",
        type: "light",
        title: "Éclairage intérieur",
        prompt: this.state.lightsOn ? "Éteindre les lumières" : "Allumer les lumières",
        actionText: this.state.lightsOn ? "Éteindre" : "Allumer",
        icon: "💡",
        x: hx - 0.4,
        z: hz + 4.6,
        radius: 1.8,
      },
      // 5. Réfrigérateur (Cuisine)
      {
        id: "fridge",
        type: "fridge",
        title: "Réfrigérateur",
        prompt: this.state.fridgeOpen ? "Fermer le réfrigérateur" : "Ouvrir le réfrigérateur",
        actionText: this.state.fridgeOpen ? "Fermer" : "Ouvrir",
        icon: "❄️",
        x: hx + 5.4,
        z: hz + 3.4,
        radius: 2.2,
      },
      // 6. Cuisinière & réchaud (Cuisine)
      {
        id: "stove",
        type: "stove",
        title: "Cuisinière à gaz",
        prompt: this.state.isCooking ? "Cuisson en cours..." : "Préparer un repas",
        actionText: "Cuisiner",
        icon: "🍳",
        x: hx + 3.4,
        z: hz + 1.2,
        radius: 2.2,
      },
      // 7. Évier (Cuisine)
      {
        id: "sink",
        type: "sink",
        title: "Évier & Robinet",
        prompt: this.state.tapFlowing ? "Couper l'eau" : "Ouvrir le robinet",
        actionText: this.state.tapFlowing ? "Fermer" : "Nettoyer",
        icon: "🚰",
        x: hx + 4.2,
        z: hz + 1.6,
        radius: 2.0,
      },
      // 8. Table à manger
      {
        id: "dining",
        type: "dining",
        title: "Table à manger",
        prompt: this.state.servedFood ? `Manger : ${this.state.servedFood}` : "S'asseoir à table",
        actionText: this.state.servedFood ? "Manger" : "S'asseoir",
        icon: "🍽️",
        x: hx + 2.4,
        z: hz + 3.6,
        radius: 2.2,
      },
      // 9. Grand Lit (Chambre)
      {
        id: "bed",
        type: "bed",
        title: "Grand Lit",
        prompt: "Dormir et faire avancer le temps",
        actionText: "Dormir",
        icon: "🛏️",
        x: hx - 4.2,
        z: hz - 3.2,
        radius: 2.4,
      },
      // 10. Douche (Salle de bain)
      {
        id: "shower",
        type: "shower",
        title: "Douche",
        prompt: this.state.showerActive ? "Couper la douche" : "Prendre une douche",
        actionText: this.state.showerActive ? "Couper" : "Douche",
        icon: "🚿",
        x: hx + 4.8,
        z: hz - 3.8,
        radius: 2.2,
      },
      // 11. Toilettes (Salle de bain)
      {
        id: "toilet",
        type: "toilet",
        title: "Toilettes",
        prompt: "Tirer la chasse d'eau",
        actionText: "Chasse",
        icon: "🚽",
        x: hx + 2.0,
        z: hz - 2.2,
        radius: 1.8,
      },
      // 12. Porte Chambre
      {
        id: "bedroomDoor",
        type: "door",
        title: "Porte de la chambre",
        prompt: this.state.bedroomDoorOpen ? "Fermer la chambre" : "Ouvrir la chambre",
        actionText: this.state.bedroomDoorOpen ? "Fermer" : "Ouvrir",
        icon: "🚪",
        x: hx - 1.2,
        z: hz - 0.2,
        radius: 2.0,
      },
      // 13. Porte Salle de bain
      {
        id: "bathroomDoor",
        type: "door",
        title: "Porte salle de bain",
        prompt: this.state.bathroomDoorOpen ? "Fermer la salle de bain" : "Ouvrir la salle de bain",
        actionText: this.state.bathroomDoorOpen ? "Fermer" : "Ouvrir",
        icon: "🚪",
        x: hx + 1.2,
        z: hz - 0.2,
        radius: 2.0,
      },
    ];

    let closest: ContextualInteraction | null = null;
    let minDistance = Infinity;

    for (const t of targets) {
      const d = Math.hypot(px - t.x, pz - t.z);
      if (d <= t.radius && d < minDistance) {
        minDistance = d;
        closest = {
          id: t.id,
          type: t.type,
          title: t.title,
          prompt: t.prompt,
          actionText: t.actionText,
          icon: t.icon,
          distance: d,
        };
      }
    }

    return closest;
  }
}

export const houseManager = new HouseManager();
