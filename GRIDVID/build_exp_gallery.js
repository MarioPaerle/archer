#!/usr/bin/env node
/* build_exp_gallery.js <tasks.jsonl> <out.html> "<title>" "<subtitle>"
 * Gallery of tasks with a stable ID, rule, source template, and the baseline verdict (too-simple or survives). */
const fs = require("fs"), crypto = require("crypto");
const E = require("./engine.js"), GIF = require("./gif.js"), B = require("./baseline.js");
const [inFile, outFile, title, subtitle] = [process.argv[2], process.argv[3] || "out/exp_gallery.html", process.argv[4] || "Experiment", process.argv[5] || ""];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tasks = fs.readFileSync(inFile, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));

function card(t) {
  const id = t.meta.id || ("T-" + crypto.createHash("sha1").update(JSON.stringify([t.examples, t.in, t.out])).digest("hex").slice(0, 8));
  let gif = ""; try { const m = E.taskToMontage(t, { fps: 2 }); gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 10, delayMs: 500 })).toString("base64"); } catch (e) { }
  let verdict; try { const tv = B.trivialSolve(t); verdict = tv ? `<span class=triv>too simple · ${esc(tv)}</span>` : `<span class=hard>survives baseline</span>`; } catch (e) { verdict = ""; }
  const tmpl = (t.meta.template || t.meta.source || "").replace(/^llm:/, "");
  return `<figure class=card>${gif ? `<img src="${gif}">` : "<div class=noimg>render failed</div>"}
    <figcaption>
      <div class=id>${esc(id)}${tmpl ? ` · <span class=tpl>${esc(tmpl)}</span>` : ""}</div>
      <div class=rl>${esc(t.meta.rule)}</div>
      <div class=meta>${verdict} · d${t.meta.difficulty != null ? t.meta.difficulty : "?"}${t.meta.prior ? ` · <span class=prior>${esc(t.meta.prior)}</span>` : ""} · ${t.width}×${t.height} · ${t.examples.length}ex</div>
      ${t.meta.dsl ? `<details><summary>DSL</summary><pre>${esc(t.meta.dsl.trim())}</pre></details>` : ""}
      ${t.meta.prompt ? `<details><summary>DSL suggestion (the prompt the model received)</summary><pre>${esc(t.meta.prompt.trim())}</pre></details>` : ""}
    </figcaption></figure>`;
}
const html = `<!doctype html><meta charset=utf-8><title>${esc(title)}</title><style>
body{margin:0;background:#0b0b0d;color:#ededed;font:13px ui-monospace,Menlo,monospace;padding:24px}
h1{color:#ff5fae;font-size:19px;margin:0 0 4px}.lead{color:#8a8a93;max-width:980px;line-height:1.6;margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.card{background:#15151a;border:1px solid #2a2a31;border-radius:10px;padding:12px}
img{image-rendering:pixelated;width:100%;border:1px solid #2a2a31;border-radius:6px;background:#000}.noimg{padding:40px;text-align:center;color:#ff5f5f}
figcaption{display:flex;flex-direction:column;gap:5px;margin-top:8px}
.id{color:#7fd4ff;font-weight:700;font-size:11px}.tpl{color:#9fe89f;font-weight:400}
.rl{color:#e9e9ef;font-size:12px;line-height:1.35}.meta{color:#8a8a93;font-size:10.5px}
.triv{color:#ff8f5f}.hard{color:#9fe89f}.prior{color:#c9a0ff}
summary{color:#ffb14e;cursor:pointer;font-size:11px}pre{white-space:pre-wrap;color:#cfcfd6;background:#0d0d11;border:1px solid #2a2a31;border-radius:6px;padding:8px;font-size:10px}
</style><h1>${esc(title)}</h1><p class=lead>${esc(subtitle)}</p><div class=grid>${tasks.map(card).join("\n")}</div>`;
fs.writeFileSync(outFile, html);
console.log("wrote " + outFile + "  (" + tasks.length + " tasks)");
