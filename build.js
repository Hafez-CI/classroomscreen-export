// Turns export.js into the bookmark code and writes the files GitHub Pages serves:
//   index.html    the install page (laptop + Android tablet instructions)
//   version.json  the latest version number, which the panel checks to show "new version"
// Run after changing export.js:  node build.js
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

// Shrinks export.js so the bookmark is short enough to paste comfortably on a tablet.
async function bundle(source) {
  // Collapse the whitespace in the panel's HTML/CSS template; the minifier leaves strings alone.
  const compact = source.replace(/(box\.innerHTML = `)([\s\S]*?)(`;)/, (m, a, b, c) => a + b.replace(/\s+/g, ' ').trim() + c);
  const out = await minify(compact, { ecma: 2020, compress: true, mangle: true, format: { comments: false } });
  return out.code;
}

const versionOf = (source) => (source.match(/VERSION = '([^']+)'/) || [])[1] || '?';

function page(href, version) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Classroomscreen Export</title>
<style>
  :root { --ink: #111827; --muted: #4B5563; --line: #E5E7EB; --soft: #F9FAFB; --bg: #fff; --accent: #3730A3; }
  @media (prefers-color-scheme: dark) {
    :root { --ink: #F3F4F6; --muted: #9CA3AF; --line: #374151; --soft: #1F2937; --bg: #111827; --accent: #A5B4FC; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 40px 16px 64px; display: flex; flex-direction: column; }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .ver { color: var(--muted); font-size: 13px; margin: 0 0 12px; }
  .lead { color: var(--muted); margin: 0 0 8px; }
  section { border-top: 1px solid var(--line); padding-top: 22px; margin-top: 22px; }
  h2 { font-size: 18px; margin: 0 0 10px; }
  ol { padding-left: 22px; margin: 0; }
  li { margin-bottom: 12px; }
  p, ul { color: var(--muted); }
  ul { padding-left: 20px; margin: 0; }
  .bm { display: inline-block; margin-top: 8px; padding: 10px 16px; border-radius: 10px; background: var(--ink); color: var(--bg);
        text-decoration: none; font-weight: 600; cursor: grab; }
  kbd { font: 13px ui-monospace, Consolas, monospace; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; padding: 1px 6px; background: var(--soft); }
  button { font: inherit; padding: 9px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--soft); color: var(--ink); cursor: pointer; }
  .ok { margin-left: 10px; color: var(--accent); font-size: 14px; }
  .note { background: var(--soft); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; color: var(--muted); font-size: 15px; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Classroomscreen Export</h1>
    <p class="ver">Version ${version}</p>
    <p class="lead">Save your Classroomscreen boards as an image or a PDF, with the background, text and drawings. Your boards never leave your device: everything happens in your own browser.</p>
  </header>

  <section id="laptop">
    <h2>On a laptop</h2>
    <ol>
      <li>Show your bookmarks bar if it's hidden: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>.</li>
      <li>Drag this button onto the bookmarks bar:<br>
        <a class="bm" href="${href}" onclick="event.preventDefault(); alert('Drag this button onto your bookmarks bar. On a tablet, use Copy bookmark code instead.');">Export board</a></li>
      <li>Open your board on classroomscreen.com, click an empty spot, then click <b>Export board</b> in the bookmarks bar.</li>
    </ol>
  </section>

  <section id="tablet">
    <h2>On an Android tablet (Chrome or Brave)</h2>
    <ol>
      <li><button id="copy">Copy bookmark code</button><span class="ok" id="ok"></span></li>
      <li>Bookmark this page: tap <b>⋮</b> at the top right, then the <b>☆</b> star.</li>
      <li>Open <b>⋮ → Bookmarks</b>, tap <b>⋮</b> next to the new bookmark, then <b>Edit</b>.
        Change the name to <b>Export board</b>. In the address field, delete everything and paste the code. Save.</li>
      <li>Open your board on classroomscreen.com, tap the address bar, type <b>Export board</b>, and tap the suggestion with the star.</li>
    </ol>
  </section>

  <section>
    <h2>Using it</h2>
    <p>A small panel appears at the top right of your board. Drag it by its title bar to put it anywhere; it remembers the spot.</p>
    <ul>
      <li><b>Save as image</b>: one PNG of the screen you're on.</li>
      <li><b>Add screen to PDF</b>: do it on each screen, one after the other, then <b>Download PDF</b>.</li>
    </ul>
  </section>

  <section>
    <h2>Updates</h2>
    <p class="note">When Classroomscreen changes its site, the export is fixed and a new version is published here.
      Your panel then says <b>"Version … is out"</b>. Click that message, and replace your bookmark the same way you added it.
      On the laptop, delete the old bookmark and drag the new one in. On the tablet, edit the bookmark and paste the new code.</p>
  </section>

  <section>
    <h2>Good to know</h2>
    <ul>
      <li>Videos and embedded websites on a screen can't be captured and come out blank.</li>
      <li>The export is checked against the real Classroomscreen site every day.</li>
    </ul>
  </section>
</main>
<script>
  // Show the tablet steps first on Android.
  if (/Android/i.test(navigator.userAgent)) {
    const main = document.querySelector('main');
    main.insertBefore(document.getElementById('tablet'), document.getElementById('laptop'));
  }
  document.getElementById('copy').onclick = async () => {
    const text = document.querySelector('.bm').getAttribute('href');
    try { await navigator.clipboard.writeText(text); document.getElementById('ok').textContent = 'Copied.'; }
    catch { prompt('Copy this code:', text); }
  };
</script>
</body>
</html>
`;
}

module.exports = { bundle, versionOf };

if (require.main === module) {
  (async () => {
    const source = fs.readFileSync(path.join(__dirname, 'export.js'), 'utf8');
    const version = versionOf(source);
    const code = await bundle(source);
    const href = 'javascript:' + encodeURIComponent(code + ';void 0');
    fs.writeFileSync(path.join(__dirname, 'index.html'), page(href, version));
    fs.writeFileSync(path.join(__dirname, 'version.json'), JSON.stringify({ version }) + '\n');
    console.log(`index.html + version.json written (version ${version}, bookmark code: ${href.length} characters)`);
  })();
}
