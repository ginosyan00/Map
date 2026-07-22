import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(8000);

const result = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  return {
    hasCanvas: Boolean(canvas),
    canvasSize: canvas ? [canvas.width, canvas.height] : null,
    title: document.title,
  };
});

await page.screenshot({ path: "docs/screenshots/park-debug-runtime.png" });
const vegLogs = logs.filter((l) => /vegetation|omt-glb|Error|error|WebGL/i.test(l));
console.log(JSON.stringify({ result, vegLogs, logCount: logs.length }, null, 2));
console.log("--- first logs ---");
console.log(logs.slice(0, 50).join("\n"));
await browser.close();
