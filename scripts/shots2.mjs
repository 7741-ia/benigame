// Captures ciblées via le hook de debug : quartiers, lieux, nuit, pluie.
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";

const dist = join(process.cwd(), "dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const server = createServer((req, res) => {
  let p = join(dist, req.url === "/" || req.url.startsWith("/?") ? "index.html" : req.url.split("?")[0]);
  if (!existsSync(p)) p = join(dist, "index.html");
  res.writeHead(200, { "Content-Type": types[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4174, r));

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(300000);
const quality = process.env.QUALITY || "low";
await page.addInitScript((q) => localStorage.setItem("beni_quality", q), quality);
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
await page.goto("http://localhost:4174/?debug", { waitUntil: "load" });
await page.waitForTimeout(4000);
await page.getByText("JOUER").first().click();
await page.waitForTimeout(2500);

const shot = async (name) => {
  const s = Date.now();
  await page.screenshot({ path: `shots/${name}.png`, timeout: 300000 });
  console.log(name, Date.now() - s, "ms");
};
const tp = async (x, z, heading, hour, weather) => {
  await page.evaluate(([x, z, h, hour, w]) => {
    const g = window.__beniGame;
    g.debugTeleport(x, z, h);
    if (hour !== null) g.debugSetHour(hour);
    if (w) g.debugSetWeather(w);
  }, [x, z, heading, hour, weather || null]);
  await page.waitForTimeout(2500);
};

const scenes = [
  ["residential", -120, -6, -Math.PI / 2, 10, "sunny"],
  ["shops", 24, -60, 0, 11, "sunny"],
  ["church", 24, 72, -1.18, 15, "sunny"],
  ["night", 24, -10, 0, 20.5, "sunny"],
  ["rain", 24, 40, 0, 14, "rain"],
];
for (const [name, x, z, h, hour, w] of scenes) {
  await tp(x, z, h, hour, w);
  await shot(name);
}
// vue piéton devant une maison : descendre et avancer
await tp(-120, -6, -Math.PI / 2, 10, "sunny");
await page.keyboard.press("f");
await page.waitForTimeout(600);
await page.keyboard.down("w");
await page.waitForTimeout(5000);
await page.keyboard.up("w");
await page.waitForTimeout(1500);
await shot("walk_house");
const info = await page.evaluate(() => {
  const r = window.__beniGame.renderer.info;
  return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures };
});
console.log("render info:", JSON.stringify(info));
await browser.close();
server.close();
console.log("done");
