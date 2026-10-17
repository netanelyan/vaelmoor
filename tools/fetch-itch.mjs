// Downloads a free / name-your-price itch.io asset pack (used for Quaternius's
// CC0 packs) by driving a real browser through itch's normal flow:
// "Download Now" -> "No thanks, just take me to the downloads" -> Download.
//   node tools/fetch-itch.mjs <creator> <game-slug> <out-dir>
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const [creator, game, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
// the purchase page of a pay-what-you-want pack offers a free path
await page.goto(`https://${creator}.itch.io/${game}/purchase`, { waitUntil: 'domcontentloaded' });
await Promise.all([page.waitForURL(/\/download\//, { timeout: 30000 }), page.locator('a.direct_download_btn').first().click({ timeout: 20000 })]);
await page.waitForSelector('.upload a.download_btn', { timeout: 30000 });
const buttons = page.locator('.upload a.download_btn');
const n = await buttons.count();
for (let i = 0; i < n; i++) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), buttons.nth(i).click()]);
  const file = path.join(outDir, dl.suggestedFilename());
  await dl.saveAs(file);
  console.log(`  ${dl.suggestedFilename()}  ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
}
await browser.close();
