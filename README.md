# Classroomscreen Export

Save [Classroomscreen](https://classroomscreen.com) boards as a PNG image or a multi-page PDF, with the background, text and drawings. It runs as a bookmark in your own browser, so your boards never leave your device.

**Install:** https://hafez-ci.github.io/classroomscreen-export/ (laptop and Android tablet instructions)

## How it works

- `export.js` is the tool. It renders the board (`.screen-deck`) to an image with [modern-screenshot](https://github.com/qq15725/modern-screenshot), leaves out the toolbars, and builds PDFs with [jsPDF](https://github.com/parallax/jsPDF).
- `node build.js` shrinks `export.js` into the bookmark code and writes `index.html` (the install page) and `version.json`.
- The bookmark contains all of its code. Online it only reads `version.json`, to tell you when a newer version is out.
- `node check.js` tests the bookmark code against the live Classroomscreen site in Microsoft Edge (via playwright-core). It runs every day.
