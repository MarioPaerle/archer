#!/usr/bin/env node
/* =============================================================================
 * build.js — inline engine.js + gif.js into index.html.
 *
 * Why: the editor must work when you DOUBLE-CLICK index.html (file://). Some
 * browsers refuse to load separate <script src="engine.js"> files over file://,
 * which leaves the page dead. Inlining the code removes every external fetch, so
 * double-click works everywhere. engine.js / gif.js stay the single source of
 * truth (Node still uses them); re-run `node build.js` after editing them.
 *
 *   node build.js          # refresh index.html in place
 * ========================================================================== */
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const htmlPath = path.join(DIR, "index.html");
let html = fs.readFileSync(htmlPath, "utf8");

// replace everything between the inline markers for each script file.
function inline(html, file) {
  const code = fs.readFileSync(path.join(DIR, file), "utf8");
  const re = new RegExp("(<!-- gridvid:inline " + file.replace(".", "\\.") + " -->)[\\s\\S]*?(<!-- /gridvid:inline -->)");
  if (!re.test(html)) throw new Error("inline markers for " + file + " not found in index.html");
  return html.replace(re, "$1<script>\n" + code + "\n</" + "script>$2");
}

html = inline(html, "engine.js");
html = inline(html, "gif.js");
fs.writeFileSync(htmlPath, html);
// also mirror into dist/ so the Tauri desktop app (frontendDist=../dist) stays current.
fs.mkdirSync(path.join(DIR, "dist"), { recursive: true });
fs.writeFileSync(path.join(DIR, "dist", "index.html"), html);
console.log("inlined engine.js + gif.js -> index.html + dist/index.html (double-click & app ready)");
