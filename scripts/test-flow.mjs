// Test de bout en bout du flux de jeu (rendu logiciel, hook ?debug).
// Vérifie : conduite, accélération, freinage, régulateur, descente, marche,
// remontée, prise du colis, livraison, réaction du client, message « Merci ! », écran de choix.
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname } from "path";

const dist = join(process.cwd(), "dist");
mkdirSync("shots", { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const server = createServer((req, res) => {
  let p = join(dist, req.url === "/" || req.url.startsWith("/?") ? "index.html" : req.url.split("?")[0]);
  if (!existsSync(p)) p = join(dist, "index.html");
  res.writeHead(200, { "Content-Type": types[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4175, r));

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(300000);
await page.addInitScript(() => localStorage.setItem("beni_quality", "low"));
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const state = () => page.evaluate(() => window.__beniGame.debugState());
const shot = (name) => page.screenshot({ path: `shots/${name}.png`, timeout: 300000 });
// Le rendu logiciel tourne à ~3 fps et dt est plafonné à 50 ms : le temps de jeu
// s'écoule plus lentement que le temps réel. On attend donc en TEMPS DE JEU.
const gameTime = () => page.evaluate(() => window.__beniGame.gameTime);
const waitGame = async (seconds) => {
  const start = await gameTime();
  while ((await gameTime()) - start < seconds) await page.waitForTimeout(120);
};
const hold = async (key, gameSeconds) => {
  await page.keyboard.down(key);
  await waitGame(gameSeconds);
  await page.keyboard.up(key);
};

await page.goto("http://localhost:4175/?debug", { waitUntil: "load" });
await page.waitForTimeout(4000);
await page.getByText("JOUER").first().click();
await waitGame(0.5);
let s = await state();
check("partie démarrée en mode véhicule", s.phase === "playing" && s.mode === "vehicle", JSON.stringify(s.pos));

// ── 1. accélération progressive ──
await hold("w", 0.6);
const s1 = await state();
await hold("w", 1.4);
const s2 = await state();
check("accélération progressive", s1.speed > 0 && s2.speed > s1.speed, `${s1.speed} → ${s2.speed} km/h`);
await shot("t_drive");

// ── 2. freinage progressif ──
await hold(" ", 0.5);
const s3 = await state();
await hold(" ", 1.5);
const s4 = await state();
check("freinage progressif jusqu'à l'arrêt", s3.speed < s2.speed && s4.speed <= 2, `${s2.speed} → ${s3.speed} → ${s4.speed} km/h`);

// ── 3. régulateur (sur l'avenue centrale, dégagée sur ~250 m vers +z) ──
await page.evaluate(() => window.__beniGame.debugTeleport(24, -150, 0));
await waitGame(0.2);
await hold("w", 0.8);
await page.keyboard.press("k");
await waitGame(0.1);
s = await state();
check("régulateur activé", s.cruiseOn && s.cruiseTarget > 0, `cible ${s.cruiseTarget} km/h`);
// ramener la cible à 40 km/h avec les touches ] et [
for (let i = 0; i < 30 && (await state()).cruiseTarget > 40; i++) await page.keyboard.press("[");
for (let i = 0; i < 30 && (await state()).cruiseTarget < 40; i++) await page.keyboard.press("]");
s = await state();
await page.keyboard.press("]");
await page.keyboard.press("]");
const sUp = await state();
check("augmenter la cible (+10)", sUp.cruiseTarget === s.cruiseTarget + 10, `${s.cruiseTarget} → ${sUp.cruiseTarget}`);
await page.keyboard.press("[");
await page.keyboard.press("[");
const sDown = await state();
check("diminuer la cible (−10)", sDown.cruiseTarget === sUp.cruiseTarget - 10, `${sUp.cruiseTarget} → ${sDown.cruiseTarget}`);
await waitGame(4.0); // sans toucher à l'accélérateur
const sHold = await state();
check("maintient 40 km/h sans accélérer", sHold.cruiseOn && Math.abs(sHold.speed - sHold.cruiseTarget) <= 4, `${sHold.speed} km/h (cible ${sHold.cruiseTarget})`);
await shot("t_cruise");
await hold(" ", 0.3);
const sBrake = await state();
check("le frein désactive le régulateur", !sBrake.cruiseOn);

// ── 4. descendre du véhicule ──
await hold(" ", 2.0);
s = await state();
check("véhicule arrêté avant de descendre", s.speed <= 2, `${s.speed} km/h`);
await page.keyboard.press("f");
await waitGame(0.15);
const sMount = await state();
check("animation de descente en cours (pas de téléportation)", sMount.mounting === true && sMount.mode === "walk");
await waitGame(1.0);
s = await state();
const distBike = Math.hypot(s.pos[0] - s.bike[0], s.pos[1] - s.bike[1]);
check("descendu à côté du véhicule, visible", s.mode === "walk" && !s.mounting && s.walkerVisible && !s.riderVisible && distBike > 0.8 && distBike < 4, `distance ${distBike.toFixed(2)} m`);
await shot("t_dismount");

// ── 5. marche / course ──
const p0 = s.pos;
await hold("w", 2.0);
s = await state();
const walked = Math.hypot(s.pos[0] - p0[0], s.pos[1] - p0[1]);
check("marche ≈ 1.5 m/s (déplacement réel)", walked > 1.8 && walked < 4.5, `${walked.toFixed(2)} m en 2 s`);
const p1 = s.pos;
await page.keyboard.down("Shift");
await hold("w", 2.0);
await page.keyboard.up("Shift");
s = await state();
const ran = Math.hypot(s.pos[0] - p1[0], s.pos[1] - p1[1]);
check("course nettement plus rapide que la marche", ran > walked * 1.6, `${ran.toFixed(2)} m vs ${walked.toFixed(2)} m`);
await shot("t_walk");

// ── 6. remonter ──
await page.evaluate(() => { const g = window.__beniGame; const st = g.debugState(); g.debugTeleportWalk(st.bike[0] + 1.6, st.bike[1], 0); });
await waitGame(0.2);
await page.keyboard.press("f");
await waitGame(0.15);
const sIn = await state();
check("animation de remontée en cours", sIn.mounting === true);
await waitGame(1.0);
s = await state();
check("de retour au volant", s.mode === "vehicle" && !s.mounting && s.riderVisible && !s.walkerVisible);

// ── 7. prise du colis (il faut s'arrêter devant l'expéditeur) ──
s = await state();
await page.evaluate(([x, z]) => window.__beniGame.debugTeleport(x, z, 0), s.pickup);
await waitGame(0.6);
s = await state();
check("colis récupéré à l'arrêt devant l'expéditeur", s.hasPackage === true, `couriers=${s.couriers}`);
await shot("t_pickup");

// ── 8. livraison : arriver, se garer, descendre, marcher jusqu'au client, remettre ──
await page.evaluate(() => { const g = window.__beniGame; const st = g.debugState(); g.debugTeleport(st.door[0], st.door[1], 0); });
await waitGame(0.6);
s = await state();
check("arrivée détectée : consigne « gare-toi et descends »", s.stage === "arrived" && s.client === true && s.hasPackage);
await page.keyboard.press("f");
await waitGame(1.1);
s = await state();
check("descendu avec le colis en main", s.mode === "walk" && !s.mounting && s.hasPackage);
// marcher jusqu'à la porte du client
await page.evaluate(() => { const g = window.__beniGame; const st = g.debugState(); g.debugTeleportWalk(st.door[0] + 1.2, st.door[1] + 1.2, Math.PI); });
await waitGame(0.5);
s = await state();
check("devant le client : remise proposée", s.stage === "handover");
await shot("t_handover");
const moneyBefore = s.money;
await page.keyboard.press("e");
await waitGame(0.3);
s = await state();
check("colis remis, argent reçu", s.hasPackage === false && s.money > moneyBefore && s.deliveries === 1, `+$${s.money - moneyBefore}`);
check("bulle « Merci ! » affichée au-dessus du client", s.bubbles >= 1);
check("client réagit puis repart (animation)", s.couriers >= 1);
await waitGame(0.6);
await shot("t_thanks");
await waitGame(2.2);
s = await state();
check("écran de choix après livraison, sans compte à rebours", s.phase === "delivered" && s.timeLeft === 0, `phase=${s.phase}`);
await shot("t_choice");
await page.getByText("Continuer les livraisons").click();
await waitGame(0.3);
s = await state();
check("nouvelle mission acceptée (chrono relancé)", s.phase === "playing" && !s.freeRoam && s.timeLeft > 0 && !s.hasPackage, `timeLeft=${s.timeLeft}`);
await waitGame(3.0);
s = await state();
check("la bulle « Merci ! » a disparu en fondu", s.bubbles === 0);

check("aucune erreur JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} tests réussis`);
await browser.close();
server.close();
process.exit(fails ? 1 : 0);
