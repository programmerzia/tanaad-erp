// node shot.mjs <outDir> <json-spec-file>
// spec: [{ name, url, w, h, touch?, dark?, keys?: [..], wait?, full? , clicks?: [selector], type?: string, eval?: string }]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [,, outDir, specFile] = process.argv;
const specs = JSON.parse(fs.readFileSync(specFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
const errors = [];
for (const s of specs) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|manifest|screenshots\//.test(m.text())) errors.push(`${s.name}: console ${m.text().slice(0, 200)}`); });
  await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: s.dpr ?? 1, hasTouch: !!s.touch, isMobile: !!s.touch && s.w < 600 });
  await page.evaluateOnNewDocument((d, t) => { try { localStorage.setItem('tanaad-density', d); localStorage.setItem('tanaad-theme', t); } catch {} }, s.touch ? 'touch' : 'compact', s.dark ? 'dark' : 'light');
  await page.goto((process.env.BASE ?? 'http://localhost:4173/') + s.url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, s.wait ?? 500));
  for (const sel of s.clicks ?? []) { try { await page.click(sel); } catch (e) { errors.push(`${s.name}: click ${sel} failed`); } await new Promise((r) => setTimeout(r, 250)); }
  for (const k of s.keys ?? []) {
    if (k.startsWith('type:')) await page.keyboard.type(k.slice(5), { delay: 15 });
    else if (k.includes('+')) { const parts = k.split('+'); for (const p of parts.slice(0, -1)) await page.keyboard.down(p); await page.keyboard.press(parts.at(-1)); for (const p of parts.slice(0, -1).reverse()) await page.keyboard.up(p); }
    else await page.keyboard.press(k);
    await new Promise((r) => setTimeout(r, 180));
  }
  if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) console.log(`${s.name} eval:`, JSON.stringify(r)); }
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: `${outDir}/${s.name}.png`, fullPage: !!s.full });
  await page.close();
}
await browser.close();
if (errors.length) { console.log('ERRORS'); for (const e of [...new Set(errors)].slice(0, 40)) console.log(' -', e); } else console.log('no page errors');
