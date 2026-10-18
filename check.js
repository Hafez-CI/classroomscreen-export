// Health check for the Classroomscreen export.
// Opens a fresh guest board on classroomscreen.com in Edge, runs the bookmark code
// (export.js, shrunk exactly like build.js does) and checks the image and the PDF it produces.
//
//   node check.js           exit code 0 = all good, 1 = something broke
//   node check.js --headed  watch it run
//   node check.js --dump    also print how the board page is built (for fixing it)
//
// Every run writes last-check.json next to this file.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { bundle, versionOf } = require('./build');

const args = process.argv.slice(2);
const HEADED = args.includes('--headed');
const DUMP = args.includes('--dump');
const W = 1024, H = 768;
// EXPORT_FILE lets you test a candidate fix before replacing export.js.
const source = fs.readFileSync(process.env.EXPORT_FILE || path.join(__dirname, 'export.js'), 'utf8');
const SITE = (source.match(/SITE = '([^']+)'/) || [])[1];

const results = [];
const pass = (name, detail = '') => results.push({ name, ok: true, detail });
const fail = (name, detail = '') => results.push({ name, ok: false, detail });
const warn = (name, detail = '') => results.push({ name, ok: true, warn: true, detail });

// Summary of how the board page is built, so a fix can be made without guessing.
const describePage = () => {
  const deck = document.querySelector('.screen-deck');
  const cls = (el) => String(el.className?.baseVal ?? el.className ?? '').slice(0, 70);
  return {
    url: location.href,
    title: document.title,
    deckFound: !!deck,
    deckChildren: deck ? [...deck.children].map((c, i) => ({
      i, tag: c.tagName, cls: cls(c),
      buttons: c.querySelectorAll('button').length,
      screensButtons: c.querySelectorAll('[data-tooltip-text="Screens"]').length,
      dropZone: /Drop your files/.test(c.textContent),
      bgImages: [...c.querySelectorAll('*')].filter((e) => getComputedStyle(e).backgroundImage.startsWith('url(')).length,
    })) : [],
    tooltips: [...new Set([...document.querySelectorAll('[data-tooltip-text]')].map((e) => e.getAttribute('data-tooltip-text')))],
    appRootChildren: [...(document.querySelector('#app')?.children || [])].map((c) => c.tagName + '.' + cls(c)),
  };
};

// Mean color difference (0-255) between two images over a region, after scaling both to W x H.
const compareImages = async ({ a64, b64, W, H, regions }) => {
  const load = async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); return img; };
  const pixels = (img) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H);
    return g.getImageData(0, 0, W, H).data;
  };
  const [A, B] = (await Promise.all([load(a64), load(b64)])).map(pixels);
  const out = {};
  for (const [name, [x0, y0, x1, y1]] of Object.entries(regions)) {
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 4;
      sum += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); n += 3;
    }
    out[name] = Math.round((sum / n) * 10) / 10;
  }
  return out;
};

(async () => {
  const started = new Date();
  const code = await bundle(source);
  let browser;
  let dump = null;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: !HEADED });
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, acceptDownloads: true });
    const page = await context.newPage();

    // 1. A fresh guest board.
    await page.goto('https://classroomscreen.com/app', { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForSelector('.screen-deck', { timeout: 45000 });
      pass('Board opens', page.url());
    } catch {
      fail('Board opens', 'No ".screen-deck" element on classroomscreen.com/app. The page structure changed.');
      throw new Error('stop');
    }
    await page.waitForTimeout(3000); // background photo, fonts and the welcome pop-up

    // A fresh browser gets a welcome pop-up ("Create something new") over the board. Close it.
    // The dialog element itself has no size, so look for large content inside it.
    const popupOpen = () => page.evaluate(() => [...document.querySelectorAll('[role=dialog]')]
      .some((d) => [...d.querySelectorAll('*')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 200 && r.height > 200; })));
    for (let i = 0; i < 12; i++) { // it can take a few seconds to show up
      if (await popupOpen()) { await page.keyboard.press('Escape'); await page.waitForTimeout(800); }
      else if (i >= 6) break;
      else await page.waitForTimeout(500);
    }
    if (await popupOpen()) warn('Welcome pop-up closed', 'A pop-up is still over the board; the image comparison below may fail because of it.');

    // 2. The page still looks the way export.js expects.
    dump = await page.evaluate(describePage);
    const toolbarLayers = dump.deckChildren.filter((c) => c.screensButtons > 0);
    if (toolbarLayers.length === 1) pass('Toolbar layer found', `deck child #${toolbarLayers[0].i}`);
    else fail('Toolbar layer found', `${toolbarLayers.length} deck children hold a "Screens" button (expected 1), so toolbars would end up in exports.`);
    if (dump.deckChildren.some((c) => c.bgImages > 0 && c.screensButtons === 0)) pass('Background layer found');
    else warn('Background layer found', 'No background image outside the toolbar layer (the guest board may just have a plain background).');

    // 3. Put something on the board: a text box.
    try {
      await page.click('[data-tooltip-text="text"]', { timeout: 5000 });
      await page.waitForTimeout(800);
      const field = page.locator('.screen-deck [contenteditable="true"], .screen-deck textarea').first();
      await field.click({ timeout: 5000 });
      await page.keyboard.type('Health check 123');
      await page.mouse.click(W - 120, H / 2); // click empty space so nothing stays selected
      await page.waitForTimeout(800);
      pass('Text box added to the test board');
    } catch (e) {
      warn('Text box added to the test board', 'Could not add one (the test itself may need updating): ' + e.message.split('\n')[0]);
    }

    // 4. Run the bookmark code. Pretend a newer version is published, to see the update notice.
    await page.route('**/version.json*', (route) => route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ version: '99.0' }),
    }));
    await page.addScriptTag({ content: code });
    try {
      await page.waitForFunction(() => /^Ready/.test(document.querySelector('#cs-export .cse-status')?.textContent || ''), null, { timeout: 30000 });
      pass('Export panel loads', 'version ' + (await page.evaluate(() => window.__csExport?.version)));
    } catch {
      const status = await page.evaluate(() => document.querySelector('#cs-export .cse-status')?.textContent || '(no panel)');
      fail('Export panel loads', 'Panel says: ' + status);
      throw new Error('stop');
    }
    try {
      await page.locator('#cs-export .cse-update').waitFor({ state: 'visible', timeout: 10000 });
      pass('Update notice shows when a newer version is out', await page.locator('#cs-export .cse-update').textContent());
    } catch {
      fail('Update notice shows when a newer version is out', 'The panel did not show the "Version … is out" message.');
    }

    // 5. Panel starts at the top right and can be dragged.
    const box0 = await page.locator('#cs-export').boundingBox();
    if (Math.abs(box0.x + box0.width + 12 - W) <= 2 && Math.abs(box0.y - 64) <= 2) pass('Panel starts top right');
    else fail('Panel starts top right', `panel at x=${Math.round(box0.x)}, y=${Math.round(box0.y)}`);
    await page.mouse.move(box0.x + 60, box0.y + 14);
    await page.mouse.down();
    await page.mouse.move(box0.x - 300, box0.y + 200, { steps: 8 });
    await page.mouse.up();
    const box1 = await page.locator('#cs-export').boundingBox();
    const saved = await page.evaluate(() => localStorage.getItem('cs-export-pos'));
    if (Math.abs(box1.x - (box0.x - 360)) <= 2 && saved) pass('Panel can be dragged and remembers its spot');
    else fail('Panel can be dragged and remembers its spot', `moved to x=${Math.round(box1.x)}, saved=${saved}`);

    // 6. PNG: right size, and it looks like the board (minus the toolbars).
    await page.evaluate(() => { document.getElementById('cs-export').style.visibility = 'hidden'; });
    const live = await page.screenshot({ type: 'png' });
    await page.evaluate(() => { document.getElementById('cs-export').style.visibility = ''; });
    const [pngDl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#cs-export [data-act=png]')]);
    const png = fs.readFileSync(await pngDl.path());
    const pw = png.readUInt32BE(16), ph = png.readUInt32BE(20);
    if (pw === W * 2 && ph === H * 2) pass('Image has the right size', `${pw}x${ph}, ${Math.round(png.length / 1024)} KB`);
    else fail('Image has the right size', `${pw}x${ph} (expected ${W * 2}x${H * 2})`);
    const diff = await page.evaluate(compareImages, {
      a64: png.toString('base64'), b64: live.toString('base64'), W, H,
      regions: { board: [0, 60, W, 660], toolbar: [150, 680, 870, 760] },
    });
    if (diff.board <= 12) pass('Image matches the board', `difference ${diff.board}/255`);
    else {
      // Keep both pictures so whoever fixes it can see what differs.
      fs.mkdirSync(path.join(__dirname, 'debug'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, 'debug', 'live-screen.png'), live);
      fs.writeFileSync(path.join(__dirname, 'debug', 'exported.png'), png);
      fail('Image matches the board', `difference ${diff.board}/255: background, text or drawings are missing or misplaced. See debug/live-screen.png vs debug/exported.png`);
    }
    if (diff.toolbar >= 15) pass('Toolbars left out of the image', `difference ${diff.toolbar}/255`);
    else warn('Toolbars left out of the image', `difference only ${diff.toolbar}/255; the toolbars may be in the image (or the background is white there)`);
    const pngStatus = await page.evaluate(() => document.querySelector('#cs-export .cse-status').textContent);
    if (/update/.test(pngStatus)) fail('No warning after saving', pngStatus);
    else pass('No warning after saving');

    // 7. PDF with two screens.
    const addScreen = async () => {
      await page.click('#cs-export [data-act=add]');
      await page.waitForFunction(() => !document.querySelector('#cs-export [data-act=add]').disabled, null, { timeout: 60000 });
    };
    await addScreen();
    const firstUrl = page.url();
    await page.evaluate(() => document.querySelector('[data-tooltip-text="Screens"]').nextElementSibling.click()); // "+" = new screen
    await page.waitForFunction((u) => location.href !== u, firstUrl, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (page.url() !== firstUrl) pass('Second screen created');
    else fail('Second screen created', 'The "+" next to the screen number did not open a new screen.');
    await addScreen();
    const [pdfDl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#cs-export [data-act=pdf]')]);
    const pdf = fs.readFileSync(await pdfDl.path());
    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (pdf.slice(0, 5).toString() === '%PDF-' && pageCount === 2) pass('PDF has both screens', `${pageCount} pages, ${Math.round(pdf.length / 1024)} KB`);
    else fail('PDF has both screens', `${pageCount} pages (expected 2)`);
  } catch (e) {
    if (e.message !== 'stop') fail('Check ran to the end', e.message.split('\n')[0]);
  } finally {
    if (browser) await browser.close();
  }

  // Is the published site up to date with this version?
  try {
    const live = await (await fetch(SITE + 'version.json?t=' + Date.now())).json();
    if (live.version === versionOf(source)) pass('Published site is up to date', SITE + ' has version ' + live.version);
    else warn('Published site is up to date', `site has ${live.version}, this code is ${versionOf(source)}: publish it (git push)`);
  } catch (e) {
    warn('Published site is up to date', 'Could not read ' + SITE + 'version.json: ' + e.message);
  }

  const ok = results.every((r) => r.ok);
  const report = { ok, checkedAt: started.toISOString(), exportVersion: versionOf(source), results, page: dump };
  fs.writeFileSync(path.join(__dirname, 'last-check.json'), JSON.stringify(report, null, 2));

  for (const r of results) console.log(`${r.ok ? (r.warn ? '!' : '✓') : '✗'} ${r.name}${r.detail ? ' (' + r.detail + ')' : ''}`);
  console.log(ok ? '\nAll good: the export works with the current Classroomscreen site.' : '\nBROKEN: the export needs a fix. Details in last-check.json.');
  if (DUMP && dump) console.log('\nPage structure:\n' + JSON.stringify(dump, null, 2));
  process.exitCode = ok ? 0 : 1; // not process.exit(): exiting while fetch sockets close crashes Node on Windows
})();
