#!/usr/bin/env node
/* build_haiku_hard.js — difficulty-ladder test: Claude Haiku authored one task at each difficulty
 * coefficient 0.00→1.00. Shows how a small model scales (and degrades).  -> out/tasks_gallery/haiku_hard.html */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js");

const LADDER = [
  ["d000_recolor", 0.00, "trivial — and it fumbled it: recolours a dot that is ALREADY that colour → no change → no teaching."],
  ["d025_extract", 0.25, "clean: random placement + a real extract → valid and varied. The model's comfort zone."],
  ["d050_mirror_count", 0.50, "fixed positions → every demonstration is identical (memorizable); the mirror+count idea is also muddled."],
  ["d075_zone", 0.75, "it parses, teaches and varies — BUT the described red-zone CONDITIONAL isn't encoded; it fell back to a plain extract. Its description outran the DSL it could write."],
  ["d100_symmetry", 1.00, "its hardest attempt actually works: composition (def/use/repeat) + mirror + break/repair, and it varies (the random damage differs per seed)."],
];
const OUT = "out/tasks_gallery";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cards = LADDER.map(([name, diff, note]) => {
  const dsl = fs.readFileSync(path.join("scenes/haiku_hard", name + ".txt"), "utf8");
  let gif = null, verdict;
  try {
    const t = E.buildTask(dsl, { examples: 3, augment: false });
    const v = t.meta.teaching;
    const m = E.taskToMontage(t, { fps: 2 });
    gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 11, delayMs: 600 })).toString("base64");
    const badge = !v.ok ? '<b style="color:#ff5f5f">no teaching</b>' : (v.examplesVary ? '<b style="color:#9fe89f">valid + varied</b>' : '<b style="color:#ffb14e">valid but identical examples</b>');
    verdict = `parses ✓ · teaching ${v.ok ? "✓" : "✗"} · variation ${v.distinctExamples}/3 → ${badge}`;
  } catch (e) { verdict = '<b style="color:#ff5f5f">PARSE ERROR: ' + esc(e.message.split("\n")[1] ? e.message.split("\n")[1].trim() : e.message.split("\n")[0]) + "</b>"; }
  return { name, diff, note, dsl, gif, verdict };
});

const body = cards.map(c => {
  const pct = Math.round(c.diff * 100);
  return `
  <section class="card">
    <div class="head">
      <span class="diff">${c.diff.toFixed(2)}</span>
      <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
      <span class="name">${esc(c.name.replace(/^d\d+_/, ""))}</span>
    </div>
    <div class="cols">
      ${c.gif ? `<img src="${c.gif}" alt="${esc(c.name)}">` : '<div class="err">— no render —</div>'}
      <pre class="dsl">${esc(c.dsl)}</pre>
    </div>
    <div class="verdict">${c.verdict}</div>
    <div class="note">${esc(c.note)}</div>
  </section>`;
}).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Haiku — difficulty ladder</title><style>
:root{--bg:#0c0c0e;--card:#16161a;--ink:#ececec;--dim:#8a8a92;--pink:#ff5fae;--line:#2a2a30}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px ui-monospace,Menlo,monospace;padding:28px}
h1{font-size:18px;color:var(--pink);margin:0 0 4px}.lead{color:var(--dim);max-width:920px;line-height:1.55;margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px}
.head{display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--line);padding-bottom:11px;margin-bottom:13px}
.diff{font-size:17px;color:var(--pink);font-weight:700;min-width:48px}
.bar{flex:1;height:7px;background:#0a0a0c;border:1px solid var(--line);border-radius:4px;overflow:hidden;max-width:280px}
.fill{height:100%;background:linear-gradient(90deg,#9fe89f,#ffb14e,#ff5f5f)}
.name{color:#cfcfd6}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}.err{color:#ff8f8f;padding:30px;text-align:center}
img{image-rendering:pixelated;max-width:100%;border:1px solid var(--line);border-radius:6px;background:#000}
pre.dsl{margin:0;background:#0a0a0c;border:1px solid var(--line);border-radius:8px;padding:13px;color:#cfe;font-size:12px;line-height:1.45;white-space:pre;overflow:auto;max-height:300px}
.verdict{margin-top:12px;color:var(--dim);font-size:13px;border-top:1px dashed var(--line);padding-top:9px}
.note{margin-top:7px;color:#b9b9c2;font-size:12.5px;line-height:1.5}
</style></head><body>
<h1>scaling difficulty 0 → 1 with a small model (Claude Haiku)</h1>
<p class="lead">A <b>difficulty coefficient 0.00–1.00</b> was exposed in the prompt (0 = a trivial copy, 1 = ARC-AGI-2 level) and
written into each scene as <code>difficulty D</code>. Haiku authored one task per rung. The result is a clean portrait of a
small model's limits: it is fine in the easy middle, <b>fumbles the trivial case into a no-op</b>, <b>can't encode the
context-sensitive conditional</b> at 0.75 (its description outruns the DSL it writes), yet its 1.00 attempt — full
composition + break/repair — actually runs. The DSL is expressive enough; the bottleneck is the author.</p>
${body}
</body></html>`;
fs.writeFileSync(path.join(OUT, "haiku_hard.html"), html);
console.log("wrote " + path.join(OUT, "haiku_hard.html"));
