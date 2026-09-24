// Captures ciblées « personnages » : foule au marché, remise de colis, conduite en camionnette.
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
await new Promise((r) => server.listen(4176, r));
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(300000);
await page.addInitScript(() => {
  localStorage.setItem("beni_quality", "medium");
  localStorage.setItem("beni_delivery_owned", JSON.stringify(["moto", "van"]));
});
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const gameTime = () => page.evaluate(() => window.__beniGame.gameTime);
const waitGame = async (s) => { const t0 = await gameTime(); while ((await gameTime()) - t0 < s) await page.waitForTimeout(120); };
const shot = async (n) => { const t = Date.now(); await page.screenshot({ path: `shots/${n}.png`, timeout: 300000 }); console.log(n, Date.now() - t, "ms"); };

await page.goto("http://localhost:4176/?debug", { waitUntil: "load" });
await page.waitForTimeout(4000);
await page.getByText("JOUER").first().click();
await waitGame(0.5);

// 1) à pied au marché central, face aux étals et aux passants
await page.evaluate(() => window.__beniGame.debugTeleportWalk(22, -14, 0));
await waitGame(0.6);
await shot("c_market_walk");
// 2) vue rapprochée du personnage joueur
await page.keyboard.press("c");
await waitGame(0.5);
await shot("c_close");
await page.keyboard.press("c");
await page.keyboard.press("c");
// 3) remise du colis : aller chercher le colis puis jusqu'à la porte
let st = await page.evaluate(() => window.__beniGame.debugState());
await page.evaluate(([x, z]) => window.__beniGame.debugTeleport(x, z, 0), st.pickup);
await waitGame(0.8);
st = await page.evaluate(() => window.__beniGame.debugState());
await page.evaluate(() => { const g = window.__beniGame; const s = g.debugState(); g.debugTeleport(s.door[0], s.door[1], 0); });
await waitGame(0.5);
await page.keyboard.press("f");
await waitGame(1.2);
await page.evaluate(() => { const g = window.__beniGame; const s = g.debugState(); g.debugTeleportWalk(s.door[0] + 1.3, s.door[1] + 1.3, Math.PI); });
await waitGame(0.5);
await shot("c_handover_ready");
await page.keyboard.press("e");
await waitGame(0.45);
await shot("c_handover_anim");
await waitGame(1.0);
await shot("c_thanks");
// 4) camionnette : conducteur assis dans l'habitacle
await page.evaluate(() => { const g = window.__beniGame; g.setVehicle("van"); g.debugTeleport(24, -100, 0); });
await waitGame(0.3);
await page.keyboard.press("c"); // rapprochée
await waitGame(0.6);
await shot("c_van_driver");
await browser.close();
server.close();
console.log("done");
