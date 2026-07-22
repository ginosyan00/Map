import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/vegetation/i.test(t)) logs.push(t);
});
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(8000);
await page.evaluate(() => {
  window.__omtMap?.jumpTo({
    center: [44.51816529, 40.20876292],
    zoom: 18.6,
    pitch: 58,
    bearing: -25,
  });
});
await page.waitForTimeout(3500);
console.log(logs.filter((l) => /grove|trees|instance|onAdd/i.test(l)).join("\n"));
await page.screenshot({ path: "docs/screenshots/park-instanced-trees-desktop.png" });
await browser.close();
