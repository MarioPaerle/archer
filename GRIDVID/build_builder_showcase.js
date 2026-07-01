#!/usr/bin/env node
/* build_builder_showcase.js — render the GOD BUILDER: the family taxonomy (roles, bands, admits-graph)
 * and a sweep of difficulty-budgeted menus, each with its budget breakdown and the BASE template rendered
 * as real grids (one seeded instance) so the menu is SEEN, not described.
 *   node build_builder_showcase.js -o out/builder_showcase.html
 */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), B = require("./builder.js");

const PAL = ["#000000", "#1E93FF", "#F93C31", "#4FCC30", "#FFDC00", "#999999", "#E53AA3", "#FF851B", "#87D8F1", "#921231"];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const grid = g => `<table class=grid>${g.map(r => `<tr>${r.map(v => `<td style="background:${PAL[v] || "#000"}"></td>`).join("")}</tr>`).join("")}</table>`;

function buildRegistry(dir) {
  return fs.readdirSync(dir).filter(x => x.endsWith(".txt")).map(file => {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    let concepts = [], difficulty = null;
    try { const w = E.runScene(E.withSeedText(text, 1), { noSim: true }); concepts = w.meta.concepts || []; difficulty = w.meta.difficulty; } catch (e) { }
    let dynamic = false;
    try { const p = E.buildTask(text, { examples: 1, seed0: 1 }); dynamic = [p.in, p.out, ...p.examples.flatMap(e => [e.in, e.out])].some(v => v.length > 1); } catch (e) { }
    return { name: file.replace(/\.txt$/, ""), file, category: concepts[0] || file.replace(/\.txt$/, ""), concepts, difficulty, rule: (text.match(/^\s*rule\s+(.+)$/m) || [, null])[1], safeAug: ((text.match(/^\s*vary\s+(.+)$/m) || [, ""])[1]).trim().split(/\s+/).filter(Boolean), wholeGrid: /\b(grid_rotate|grid_flip|grid_map|sort_rows|solve|grid_complete|unfold|crop)\b/.test(text), verbs: [], dynamic };
  });
}

function famSection(enriched) {
  const byFam = {}; for (const f of enriched) (byFam[f.family] || (byFam[f.family] = [])).push(f);
  const roleChip = r => `<span class="chip ${r}">${r}</span>`;
  return Object.entries(B.FAMILY_DB).map(([fam, db]) => {
    const fns = (byFam[fam] || []).slice().sort((a, b) => a.difficulty - b.difficulty);
    const bandPct = [db.band[0] * 100, db.band[1] * 100];
    return `<div class=fam>
      <div class=famtop><b>${esc(fam)}</b>${db.dynamic ? '<span class="chip dyn">video</span>' : ""}${db.roles.map(roleChip).join("")}</div>
      <div class=blurb>${esc(db.blurb)}</div>
      <div class=band><div class=bandfill style="left:${bandPct[0]}%;width:${bandPct[1] - bandPct[0]}%"></div><span class=bandlbl>band ${db.band[0]}–${db.band[1]}</span></div>
      <div class=admits>admits → ${db.admits.length ? db.admits.map(a => `<code>${esc(a)}</code>`).join(" ") : "<i>nothing (terminal)</i>"}</div>
      <div class=fns>${fns.map(f => `<span class=fn title="${esc(f.rule || "")}">${esc(f.name)} <em>d${f.difficulty}</em></span>`).join("")}</div>
    </div>`;
  }).join("\n");
}

function menuCard(m, registry, dir, tag) {
  const bar = m.budget.map(p => {
    const w = Math.round(100 * (p.adds != null ? p.adds : p.d) / Math.max(0.3, m.difficulty));
    return `<div class="seg ${p.role}" style="width:${Math.max(6, w)}%" title="${esc(p.name)} ${p.adds != null ? "+" + p.adds : "d" + p.d}"></div>`;
  }).join("");
  const rows = m.functions.map(f => `<tr><td><span class="chip ${f.role}">${f.role}</span></td><td><b>${esc(f.name)}</b></td><td><code>${esc(f.family)}</code></td><td>d${f.difficulty}</td><td class=rl>${esc(f.rule || "")}</td></tr>`).join("");
  // render ONE seeded instance of the BASE template — the mechanic must be SEEN
  let grids = "";
  try {
    const base = registry.find(r => r.name === m.functions[0].name);
    const t = E.buildTask(fs.readFileSync(path.join(dir, base.file), "utf8"), { examples: 2, exSeeds: [3, 4], testSeed: 5 });
    const last = v => v[v.length - 1];
    grids = t.examples.map((e, i) => `<div class=pair><div class=cell><div class=lbl>ex${i + 1} in</div>${grid(last(e.in))}</div><div class=arrow>→</div><div class=cell><div class=lbl>ex${i + 1} out</div>${grid(last(e.out))}</div></div>`).join("");
  } catch (e) { grids = `<div class=noimg>base render failed: ${esc(String(e.message).slice(0, 80))}</div>`; }
  return `<section class=card>
    <div class=top><h2>${esc(tag)} · target ${m.target} → composed <b>d${m.difficulty}</b></h2><span>base-family ${esc(m.baseFamily)} · k=${m.k}</span></div>
    <div class=bar>${bar}</div>
    <table class=mtab>${rows}</table>
    <p class=hint>${esc(m.composeHint)}</p>
    <div class=row>${grids}<div class=gridnote>← the BASE mechanic, one seeded instance (refinements are composed by the model in-prompt)</div></div>
  </section>`;
}

function build(outFile) {
  const dir = path.join(__dirname, "scenes", "library");
  const registry = buildRegistry(dir);
  const enriched = B.enrichRegistry(registry);
  const sweeps = [];
  let tag = 1;
  for (const [target, k, seed] of [[0.45, 1, 5], [0.5, 2, 21], [0.6, 2, 7], [0.65, 3, 31], [0.75, 3, 11], [0.85, 3, 41]])
    sweeps.push(menuCard(B.buildMenu(E.makeRng(seed), registry, { k, static: true, target }), registry, dir, "menu " + (tag++)));
  for (const [target, k, seed] of [[0.6, 2, 9], [0.7, 2, 17]])
    sweeps.push(menuCard(B.buildMenu(E.makeRng(seed), registry, { k, target }), registry, dir, "menu " + (tag++) + " (video tier)"));
  const html = `<!doctype html><meta charset=utf-8><title>GRIDVID god builder</title><style>
  body{margin:0;background:#0b0b0f;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
  h1{margin:0 0 4px;color:#67e8f9;font-size:22px}.lead{color:#aab;max-width:1040px;line-height:1.55;margin:0 0 18px}
  h2.sec{color:#f0abfc;font-size:16px;margin:26px 0 10px}
  .famgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
  .fam{background:#15151b;border:1px solid #2a2a34;border-radius:9px;padding:11px}
  .famtop{display:flex;gap:6px;align-items:center;margin-bottom:5px}.famtop b{color:#a7f3d0}
  .blurb{color:#9aa;font-size:11.5px;line-height:1.45;margin-bottom:7px}
  .chip{font-size:9.5px;padding:1px 7px;border-radius:99px;text-transform:uppercase;letter-spacing:.4px}
  .chip.base{background:#134e4a;color:#5eead4}.chip.modifier{background:#3b2f63;color:#c4b5fd}.chip.finisher{background:#57330f;color:#fdba74}.chip.dyn{background:#4a1030;color:#f9a8d4}
  .band{position:relative;height:9px;background:#20202a;border-radius:99px;margin:4px 0 6px}
  .bandfill{position:absolute;top:0;height:100%;background:#0e7490;border-radius:99px}
  .bandlbl{position:absolute;right:6px;top:-3px;color:#7dd3fc;font-size:9.5px}
  .admits{color:#889;font-size:11px;margin-bottom:6px}.admits code{color:#fbbf24;background:#1d1d26;padding:0 4px;border-radius:4px}
  .fns .fn{display:inline-block;background:#1b1b23;border:1px solid #2c2c38;border-radius:5px;padding:2px 7px;margin:2px;color:#dde}.fns em{color:#67e8f9;font-style:normal}
  .card{border:1px solid #2a2a34;background:#15151b;border-radius:9px;padding:14px;margin:12px 0}
  .top{display:flex;justify-content:space-between;align-items:center}.top h2{margin:0;font-size:14px;color:#a7f3d0}.top b{color:#fde047}.top span{color:#888;font-size:11px}
  .bar{display:flex;height:12px;border-radius:99px;overflow:hidden;background:#20202a;margin:9px 0}
  .seg.base{background:#14b8a6}.seg.modifier{background:#8b5cf6}.seg.finisher{background:#f59e0b}
  .mtab{border-collapse:collapse;margin:4px 0 8px}.mtab td{padding:3px 10px 3px 0;font-size:12px;vertical-align:top}.mtab code{color:#fbbf24}.mtab .rl{color:#9aa;max-width:520px}
  .hint{color:#7dd3fc;margin:4px 0 10px}
  .row{display:flex;flex-wrap:wrap;gap:16px;align-items:center}
  .pair{display:flex;gap:8px;align-items:center}.arrow{color:#67e8f9;font-size:15px}
  .cell .lbl{color:#889;font-size:10px;margin-bottom:3px}.gridnote{color:#667;font-size:10.5px;max-width:220px}
  table.grid{border-collapse:collapse;background:#111}table.grid td{width:11px;height:11px;padding:0;border:1px solid #3c3c46}
  .noimg{color:#f87171;font-size:11px}</style>
  <h1>▦ GOD BUILDER — hierarchical families · admits-graph · difficulty budget</h1>
  <p class=lead>Every library function now carries a <b>paired difficulty</b> (its template's own, else its family band midpoint) and belongs to a <b>family</b> with roles: <span class="chip base">base</span> = the ONE core mechanic, <span class="chip modifier">modifier</span> = keys/conditions the base, <span class="chip finisher">finisher</span> = one whole-grid op applied LAST. A family <b>admits</b> only some other families — a menu can NEVER contain a combination outside the graph (and static never mixes with video). Composition is budgeted against a difficulty target; the bar shows each function's contribution.</p>
  <h2 class=sec>1 · The family taxonomy (${enriched.length} functions in ${Object.keys(B.FAMILY_DB).length} families)</h2>
  <div class=famgrid>${famSection(enriched)}</div>
  <h2 class=sec>2 · Budgeted menus across the difficulty sweep (what the model actually receives)</h2>
  ${sweeps.join("\n")}`;
  fs.writeFileSync(outFile, html);
  console.log("wrote " + outFile);
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (kk, d) => { const i = args.indexOf(kk); return i >= 0 ? args[i + 1] : d; };
  build(flag("-o", "out/builder_showcase.html"));
}
module.exports = { build };
