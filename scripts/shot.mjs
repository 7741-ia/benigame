// Capture d'écran du jeu (WebGL logiciel) pour vérifier le rendu de la ville.
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";

const dist = join(process.cwd(), "dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const server = createServer((req, res) => {
  let p = join(dist, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!existsSync(p)) p = join(dist, "index.html");
  res.writeHead(200, { "Content-Type": types[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(300000);
// rendu logiciel : qualité réduite pour accélérer (la géométrie des bâtiments reste identique)
const quality = process.env.QUALITY || "low";
await page.addInitScript((q) => localStorage.setItem("beni_quality", q), quality);
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console:", m.text()); });
const t0 = Date.now();
await page.goto("http://localhost:4173/", { waitUntil: "load" });
console.log("loaded in", Date.now() - t0, "ms");
await page.waitForTimeout(6000);
const shot = async (name) => {
  const s = Date.now();
  await page.screenshot({ path: `shots/${name}.png`, timeout: 120000 });
  console.log(name, "screenshot", Date.now() - s, "ms");
};
await shot("menu");

// démarre une partie puis capture plusieurs vues
await page.getByText("JOUER").first().click();
await page.waitForTimeout(3000);
await shot("play");
// avance un peu et regarde autour
await page.keyboard.down("w");
await page.waitForTimeout(2500);
await page.keyboard.up("w");
await page.waitForTimeout(1500);
await shot("drive");
// vue rapprochée
await page.keyboard.press("c");
await page.waitForTimeout(1500);
await shot("close");
// descendre et marcher vers un bâtiment
await page.keyboard.press("f");
await page.waitForTimeout(800);
await page.keyboard.down("a");
await page.waitForTimeout(700);
await page.keyboard.up("a");
await page.keyboard.down("w");
await page.waitForTimeout(3000);
await page.keyboard.up("w");
await page.waitForTimeout(1500);
await shot("walk");
// mesure grossière du temps de frame (rendu logiciel, à titre indicatif)
const fps = await page.evaluate(() => new Promise((resolve) => {
  let n = 0; const start = performance.now();
  const tick = () => { n++; if (performance.now() - start > 3000) resolve((n / ((performance.now() - start) / 1000)).toFixed(1)); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));
console.log("software fps:", fps);
await browser.close();
server.close();
console.log("done");
