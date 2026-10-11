// node tools/pwa-check.mjs [base]  — installability, service worker and offline reload of a deep link.
import puppeteer from 'puppeteer-core';
const base = process.argv[2] ?? 'http://localhost:4173/';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.goto(base, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 2500));
const client = await page.createCDPSession();
const inst = await client.send('Page.getInstallabilityErrors');
const man = await client.send('Page.getAppManifest');
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? { active: !!r.active, state: r.active?.state } : null; });
console.log('manifest errors:', man.errors?.length ?? 0, '| service worker:', JSON.stringify(sw), '| installability errors:', JSON.stringify(inst.installabilityErrors));
await page.goto(base + '?as=cashier&site=mats&go=/s/mats/cash', { waitUntil: 'networkidle0' });
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));
console.log('offline reload ->', await page.evaluate(() => location.pathname + ' | ' + document.title));
await browser.close();
