import * as THREE from "three";

// Road signs
export type SignType = "stop" | "yield" | "oneway" | "speedbump" | "pedestrian" | "work";

// Build a sign mesh
export function buildSign(
  type: SignType,
  scene: THREE.Scene,
  x: number,
  z: number,
  dir: number = 0
): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 4, 6),
    new THREE.MeshStandardMaterial({ color: 0x444444 })
  );
  pole.position.y = 2;
  g.add(pole);

  let signGeo: THREE.BufferGeometry;
  let signColor: number;

  switch (type) {
    case "stop":
      signGeo = new THREE.OctahedronGeometry(0.6, 0);
      signColor = 0xff3b30;
      break;
    case "yield":
      signGeo = new THREE.ConeGeometry(0.5, 0.3, 8);
      signColor = 0xffd93d;
      break;
    case "oneway":
      signGeo = new THREE.BoxGeometry(0.8, 0.6, 0.1);
      signColor = 0xffffff;
      break;
    case "speedbump":
      signGeo = new THREE.BoxGeometry(0.7, 0.4, 0.1);
      signColor = 0xffd93d;
      break;
    case "pedestrian":
      signGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 8);
      signColor = 0x00bbf9;
      break;
    case "work":
      signGeo = new THREE.BoxGeometry(0.6, 0.5, 0.1);
      signColor = 0xff595e;
      break;
    default:
      signGeo = new THREE.BoxGeometry(0.5, 0.5, 0.1);
      signColor = 0x888888;
  }

  const sign = new THREE.Mesh(
    signGeo,
    new THREE.MeshStandardMaterial({ color: signColor, roughness: 0.5 })
  );
  sign.position.y = 3.8;
  g.add(sign);

  g.position.set(x, 0, z);
  g.rotation.y = dir;
  scene.add(g);
  return g;
}

// Build a speed bump
export function buildSpeedBump(
  scene: THREE.Scene,
  x: number,
  z: number,
  dir: "x" | "z" = "z"
): THREE.Group {
  const g = new THREE.Group();
  const bump = new THREE.Mesh(
    new THREE.BoxGeometry(dir === "x" ? 4 : 0.5, 0.2, dir === "x" ? 0.5 : 4),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1 })
  );
  bump.position.y = 0.1;
  g.add(bump);
  for (let i = -1; i <= 1; i += 0.4) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(
        dir === "x" ? 3.8 : 0.4,
        0.15,
        dir === "x" ? 0.4 : 3.8
      ),
      new THREE.MeshStandardMaterial({
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.3,
      })
    );
    stripe.position[dir === "x" ? "x" : "z"] = i;
    stripe.position.y = 0.16;
    g.add(stripe);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}

// Build pothole
export function buildPothole(scene: THREE.Scene, x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.5, 0.3, 12, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x2a1e18,
      roughness: 1,
      side: THREE.DoubleSide,
    })
  );
  hole.position.y = -0.05;
  hole.rotation.x = Math.PI / 2;
  g.add(hole);
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}

// Build stone obstacle
export function buildStoneObstacle(
  scene: THREE.Scene,
  x: number,
  z: number
): THREE.Group {
  const g = new THREE.Group();
  const numStones = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < numStones; i++) {
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.3, 0),
      new THREE.MeshStandardMaterial({
        color: 0x6b7280 + Math.floor(Math.random() * 60),
        roughness: 0.9,
      })
    );
    stone.position.set(
      (Math.random() - 0.5) * 2,
      0.2 + Math.random() * 0.3,
      (Math.random() - 0.5) * 2
    );
    stone.castShadow = true;
    g.add(stone);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}


