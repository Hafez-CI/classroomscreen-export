// Classroomscreen export: saves the current screen as a PNG, or collects
// several screens into one PDF. Runs as a bookmarklet on classroomscreen.com.
(async () => {
  const VERSION = '1.2';
  const SITE = 'https://hafez-ci.github.io/classroomscreen-export/';
  if (window.__csExport) { window.__csExport.show(); return; }

  const deckEl = () => document.querySelector('.screen-deck');
  if (!deckEl()) {
    alert('No Classroomscreen board found on this page.\n\nIf you are on a board, Classroomscreen has probably changed its site and the export needs an update.');
    return;
  }

  const load = (src) => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = fail;
    document.head.appendChild(s);
  });
  // Try each copy of a library in turn, so one CDN being down doesn't break the export.
  const loadAny = async (urls) => {
    for (const u of urls) { try { await load(u); return; } catch {} }
    throw new Error('Could not load the export tools. Check your internet connection.');
  };

  const box = document.createElement('div');
  box.id = 'cs-export';
  box.innerHTML = `
    <style>
      #cs-export { position: fixed; top: 64px; left: 12px; z-index: 2147483647; width: 196px;
        background: #fff; color: #111827; border: 1px solid #E5E7EB; border-radius: 10px;
        box-shadow: 0 6px 20px rgba(17, 24, 39, .14); padding: 6px 10px 10px;
        font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; }
      #cs-export[hidden] { display: none; }
      #cs-export * { box-sizing: border-box; font: inherit; }
      #cs-export .cse-head { display: flex; align-items: center; gap: 6px; margin: 0 -4px 2px; padding: 4px;
        border-radius: 6px; cursor: grab; touch-action: none; user-select: none; }
      #cs-export .cse-head:hover { background: #F3F4F6; }
      #cs-export.dragging .cse-head { cursor: grabbing; background: #F3F4F6; }
      #cs-export .cse-grip { display: flex; color: #9CA3AF; }
      #cs-export .cse-title { flex: 1; font-weight: 600; }
      #cs-export .cse-ver { color: #9CA3AF; font-size: 11px; }
      #cs-export .cse-x { border: 0; background: none; color: #6B7280; cursor: pointer; font-size: 16px; line-height: 1; padding: 0 2px; }
      #cs-export .cse-btn { display: block; width: 100%; margin-top: 6px; padding: 6px 9px; border-radius: 7px;
        border: 1px solid #D1D5DB; background: #fff; color: #111827; cursor: pointer; text-align: left; }
      #cs-export .cse-btn:hover { background: #F9FAFB; }
      #cs-export .cse-btn.primary { background: #111827; border-color: #111827; color: #fff; }
      #cs-export .cse-btn.primary:hover { background: #1F2937; }
      #cs-export .cse-btn:disabled { opacity: .45; cursor: default; }
      #cs-export .cse-status { margin-top: 8px; color: #4B5563; font-size: 12px; min-height: 16px; }
      #cs-export .cse-reset { margin-top: 4px; border: 0; background: none; color: #6B7280; cursor: pointer;
        font-size: 11px; text-decoration: underline; padding: 0; }
      #cs-export .cse-update { display: block; margin-top: 8px; padding: 6px 8px; border-radius: 7px; background: #EEF2FF;
        color: #3730A3; font-size: 12px; text-decoration: none; }
      #cs-export .cse-update[hidden] { display: none; }
      #cs-export .cse-update:hover { background: #E0E7FF; }
    </style>
    <div class="cse-head" title="Drag to move">
      <span class="cse-grip"><svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="7" r="1.5"/><circle cx="8" cy="7" r="1.5"/><circle cx="2" cy="12" r="1.5"/><circle cx="8" cy="12" r="1.5"/></svg></span>
      <span class="cse-title">Export board</span><span class="cse-ver">v${VERSION}</span><button class="cse-x" title="Hide">×</button>
    </div>
    <button class="cse-btn" data-act="png">Save as image</button>
    <button class="cse-btn" data-act="add">Add screen to PDF</button>
    <button class="cse-btn primary" data-act="pdf" disabled>Download PDF</button>
    <div class="cse-status">Loading…</div>
    <button class="cse-reset" data-act="reset" hidden>Start a new PDF</button>
    <a class="cse-update" href="${SITE}" target="_blank" rel="noopener" hidden></a>
  `;
  // Keep pointer events on the panel from reaching the board (no stray drawing or deselecting).
  ['pointerdown', 'pointermove', 'pointerup'].forEach((t) => box.addEventListener(t, (e) => e.stopPropagation()));
  document.body.appendChild(box);

  // Drag the panel by its title bar. It starts at the top right, under
  // Classroomscreen's own buttons, or wherever it was last dropped.
  const POS_KEY = 'cs-export-pos';
  const place = (x, y) => {
    box.style.left = Math.min(Math.max(0, x), innerWidth - box.offsetWidth) + 'px';
    box.style.top = Math.min(Math.max(0, y), innerHeight - box.offsetHeight) + 'px';
  };
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(POS_KEY)); } catch {}
  if (saved) place(saved.x, saved.y); else place(innerWidth - box.offsetWidth - 12, 64);
  addEventListener('resize', () => place(box.offsetLeft, box.offsetTop));

  const head = box.querySelector('.cse-head');
  let grab = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    grab = { dx: e.clientX - box.offsetLeft, dy: e.clientY - box.offsetTop };
    head.setPointerCapture(e.pointerId);
    box.classList.add('dragging');
  });
  head.addEventListener('pointermove', (e) => { if (grab) place(e.clientX - grab.dx, e.clientY - grab.dy); });
  const drop = () => {
    if (!grab) return;
    grab = null;
    box.classList.remove('dragging');
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: box.offsetLeft, y: box.offsetTop })); } catch {}
  };
  head.addEventListener('pointerup', drop);
  head.addEventListener('pointercancel', drop);

  const $ = (sel) => box.querySelector(sel);
  const say = (msg) => { $('.cse-status').textContent = msg; };
  const busy = (on) => box.querySelectorAll('[data-act]').forEach((b) => { b.disabled = on || (b.dataset.act === 'pdf' && !pages.length); });

  const pages = []; // { key, url, w, h } in the order they were added
  window.__csExport = { version: VERSION, show: () => { box.hidden = false; } };
  $('.cse-x').onclick = () => { box.hidden = true; };

  // Say so when a newer version has been published. Only a version number is
  // fetched, never code: the code stays inside the bookmark.
  const newer = (a, b) => {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d > 0;
    }
    return false;
  };
  fetch(SITE + 'version.json?t=' + Date.now(), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((latest) => {
      if (!latest || !newer(latest.version, VERSION)) return;
      $('.cse-update').textContent = `Version ${latest.version} is out. Click here to update your bookmark.`;
      $('.cse-update').hidden = false;
    })
    .catch(() => {}); // offline: just skip the notice

  try {
    await Promise.all([
      window.modernScreenshot || loadAny([
        'https://cdn.jsdelivr.net/npm/modern-screenshot@4.4.39/dist/index.js',
        'https://unpkg.com/modern-screenshot@4.4.39/dist/index.js',
      ]),
      window.jspdf || loadAny([
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      ]),
    ]);
  } catch (e) { say(e.message); return; }
  say('Ready. Click an empty spot on the board first.');

  const deckName = () => (document.title.split(' - ')[0] || '').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Classroomscreen';
  const screenNo = () => document.querySelector('[data-tooltip-text="Screens"]')?.innerText.trim() || '';

  // Leave out the toolbars and the file drop zone; keep background, widgets and drawings.
  // The toolbar layer is the one holding the "Screens" buttons.
  const isToolbar = (el) => !!el.querySelector('[data-tooltip-text="Screens"]');
  const keep = (el) => {
    if (!(el instanceof Element) || el.parentElement !== deckEl()) return true;
    return !isToolbar(el) && !/Drop your files/.test(el.textContent);
  };
  // Shown after a save when the page no longer looks the way the export expects.
  const warning = () => ([...deckEl().children].some(isToolbar) ? '' : ' The toolbars may show in it: the export needs an update.');
  const shoot = (kind) => {
    if (!deckEl()) throw new Error('the board is gone from the page. Classroomscreen may have changed its site.');
    // The background photo sits on a layer behind the board (negative z-index);
    // "isolate" keeps it in front of the white fill instead of hidden under it.
    const opts = { scale: 2, filter: keep, backgroundColor: '#ffffff', style: { isolation: 'isolate' } };
    return kind === 'jpeg'
      ? modernScreenshot.domToJpeg(deckEl(), { ...opts, quality: 0.92 })
      : modernScreenshot.domToBlob(deckEl(), { ...opts, type: 'image/png' });
  };
  const save = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };
  const run = async (label, job) => {
    busy(true); say(label);
    try { await job(); } catch (e) { say('Something went wrong: ' + e.message); }
    busy(false);
  };

  const actions = {
    png: () => run('Making the image…', async () => {
      const n = screenNo();
      save(await shoot('png'), `${deckName()}${n ? ' - screen ' + n : ''}.png`);
      say('Image saved to your downloads.' + warning());
    }),
    add: () => run('Adding this screen…', async () => {
      const url = await shoot('jpeg');
      const img = new Image();
      img.src = url;
      await img.decode();
      const page = { key: location.pathname, url, w: img.naturalWidth / 2, h: img.naturalHeight / 2 };
      const i = pages.findIndex((p) => p.key === page.key);
      if (i >= 0) pages[i] = page; else pages.push(page);
      $('[data-act="pdf"]').textContent = `Download PDF (${pages.length})`;
      $('[data-act="reset"]').hidden = false;
      say(i >= 0 ? 'Screen updated in the PDF.' : `${pages.length} in PDF. Go to the next screen.`);
    }),
    pdf: () => run('Building the PDF…', async () => {
      const { jsPDF } = window.jspdf;
      let doc;
      for (const p of pages) {
        const o = p.w >= p.h ? 'landscape' : 'portrait';
        if (!doc) doc = new jsPDF({ orientation: o, unit: 'px', format: [p.w, p.h], hotfixes: ['px_scaling'] });
        else doc.addPage([p.w, p.h], o);
        doc.addImage(p.url, 'JPEG', 0, 0, p.w, p.h);
      }
      save(doc.output('blob'), `${deckName()}.pdf`);
      say('PDF saved to your downloads.' + warning());
    }),
    reset: () => {
      pages.length = 0;
      $('[data-act="pdf"]').textContent = 'Download PDF';
      $('[data-act="reset"]').hidden = true;
      busy(false);
      say('Cleared. Add screens for a new PDF.');
    },
  };
  box.querySelectorAll('[data-act]').forEach((b) => { b.onclick = actions[b.dataset.act]; });
  busy(false);
})();
