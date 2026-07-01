#!/usr/bin/env node
/* builder.js — the GOD BUILDER: hierarchical, typed, difficulty-budgeted menu composition.
 *
 * Upgrades the flat PAN-132 proposeMenu into a videogame-style encounter builder (Mario 2026-07-02):
 *   • every function carries a PAIRED difficulty (its template's own, else its family band midpoint);
 *   • functions are organised in hierarchical FAMILIES (domain/family) with ROLES:
 *       base     — the core mechanic of the task (exactly ONE per menu);
 *       modifier — conditions/keys/refines the base (who it applies to, what drives it);
 *       finisher — ONE whole-grid op, always applied LAST;
 *   • a family ADMITS only some other families BY CONSTRUCTION (typed composition graph —
 *     unified from the PAN-176 super_suggester compatibleWith/avoidWith prototype, which was
 *     a parallel system never wired into the live loop);
 *   • composition is budgeted against a DIFFICULTY TARGET: composed difficulty is additive with
 *     a reported breakdown, not max();
 *   • static and dynamic domains NEVER mix (a physics video-rule glued to a static rule = salad).
 *
 * Consumed by cli.js proposeMenu (the LIVE generate-llm loop) — same menu shape as before
 * ({functions, augmentations, composeHint, difficulty}) plus {target, budget, role/family per fn},
 * so buildPrompt and everything downstream keep working unchanged.
 */

// ============================================================ the family taxonomy (the "class tree")
// band = canonical difficulty band [lo,hi]; admits = families this family may be COMPOSED with when it
// is the BASE (by construction — nothing outside this list is ever offered together with it).
const FAMILY_DB = {
  "object/select":      { domain: "object",   roles: ["base", "modifier"], band: [0.40, 0.65], admits: ["number/count", "object/copy", "grid/global"], blurb: "pick WHICH objects the rule acts on (extremes, odd-one-out, predicate selection, extraction)" },
  "object/dispatch":    { domain: "object",   roles: ["base"],             band: [0.55, 0.78], admits: ["topology/enclosure", "number/count", "object/select"], blurb: "per-object routing: a property of each object chooses its operation (the contextual-rule axis)" },
  "object/copy":        { domain: "object",   roles: ["base", "modifier"], band: [0.35, 0.70], admits: ["object/select", "grid/global"], blurb: "copy / translate / tile / scale objects" },
  "number/count":       { domain: "number",   roles: ["base", "modifier"], band: [0.50, 0.72], admits: ["object/select", "topology/enclosure"], blurb: "count / rank / compare — a derived NUMBER drives the output" },
  "topology/enclosure": { domain: "topology", roles: ["base", "modifier"], band: [0.30, 0.62], admits: ["object/select", "number/count"], blurb: "inside vs outside — a containment relation read off the grid" },
  "relation/analogy":   { domain: "relation", roles: ["base"],             band: [0.65, 0.90], admits: ["object/select", "object/copy"], blurb: "infer the A→B transform, apply it to C" },
  "figure/boolean":     { domain: "figure",   roles: ["base"],             band: [0.55, 0.80], admits: ["object/select", "grid/global"], blurb: "align two figures and boolean-combine their cells (xor/and/overlay)" },
  "figure/symmetry":    { domain: "figure",   roles: ["base"],             band: [0.60, 0.80], admits: ["object/select"], blurb: "complete / unfold a symmetry (mirror, rotation, paper-fold)" },
  "figure/completion":  { domain: "figure",   roles: ["base"],             band: [0.50, 0.75], admits: ["object/select", "grid/global"], blurb: "continue / repair / denoise a visible pattern" },
  "grid/lattice":       { domain: "grid",     roles: ["base"],             band: [0.50, 0.66], admits: ["grid/global"], blurb: "cell-lattice fill / completion on a partitioned grid" },
  "grid/global":        { domain: "grid",     roles: ["finisher"],         band: [0.45, 0.65], admits: [], blurb: "ONE whole-grid op (flip / rotate / transpose / palette-map), always applied LAST" },
  "program/trace":      { domain: "program",  roles: ["base"],             band: [0.60, 0.80], admits: ["object/select"], blurb: "execute a visible instruction sequence (turtle / program-on-the-grid)" },
  "dynamic/path":       { domain: "dynamic",  roles: ["base"],             band: [0.55, 0.75], dynamic: true, admits: ["dynamic/physics"], blurb: "an agent walks a path (video tier)" },
  "dynamic/physics":    { domain: "dynamic",  roles: ["base", "modifier"], band: [0.40, 0.75], dynamic: true, admits: ["dynamic/path", "dynamic/physics"], blurb: "gravity / fluid / magnet / explosion — predict the settled future (video tier)" },
};

// registry category (template's first concept) → family. The "grid" category is split in enrich():
// wholeGrid grid-templates (flip/rotate/transpose/palette) are FINISHERS → grid/global; the rest → grid/lattice.
const CATEGORY_FAMILY = {
  selection: "object/select", "odd-one-out": "object/select",
  dispatch: "object/dispatch",
  copy: "object/copy", replication: "object/copy", composition: "object/copy", scaling: "object/copy",
  counting: "number/count", ordering: "number/count",
  inside: "topology/enclosure",
  analogy: "relation/analogy",
  boolean: "figure/boolean",
  symmetry: "figure/symmetry", "paper-folding": "figure/symmetry",
  pattern: "figure/completion", reconstruction: "figure/completion", denoising: "figure/completion",
  grid: "grid/lattice",
  program: "program/trace",
  path: "dynamic/path",
  gravity: "dynamic/physics", fluid: "dynamic/physics", magnet: "dynamic/physics", orbit: "dynamic/physics",
  bounce: "dynamic/physics", breaking: "dynamic/physics", explosion: "dynamic/physics", radial: "dynamic/physics", rotation: "dynamic/physics",
};
// templates whose category is not in the map (e.g. a missing `concept` line → category = filename)
const NAME_HINTS = [
  [/classif|dispatch/, "object/dispatch"],
  [/count|rank|compare|bar/, "number/count"],
  [/copy|tile|double|shrink|compose/, "object/copy"],
  [/mirror|symmet|unfold/, "figure/symmetry"],
  [/inside|enclos|frame/, "topology/enclosure"],
  [/path|walk/, "dynamic/path"],
];

function familyOf(fnDef) {
  let fam = CATEGORY_FAMILY[fnDef.category];
  if (fam === "grid/lattice" && fnDef.wholeGrid) fam = "grid/global";   // the whole-grid grid ops are finishers
  if (!fam) { for (const [re, f] of NAME_HINTS) if (re.test(fnDef.name)) { fam = f; break; } }
  return fam || "object/select";
}
const mid = band => +((band[0] + band[1]) / 2).toFixed(2);

// ============================================================ registry enrichment (paired difficulty everywhere)
// every function gets: family, roles (inherited), paired difficulty (its own, else the family midpoint).
function enrichRegistry(registry) {
  return registry.map(f => {
    const family = familyOf(f), db = FAMILY_DB[family];
    return { ...f, family, roles: db.roles, familyBand: db.band, difficulty: f.difficulty != null ? f.difficulty : mid(db.band) };
  });
}

// ============================================================ the god builder
// Composition is STRUCTURAL: 1 base + (k-1) refinements drawn ONLY from admits(baseFamily); a finisher slot
// (grid/global) is always LAST and the ≤1-whole-grid rule holds across the whole menu; static never mixes with
// dynamic; the same family repeats only if it admits itself (e.g. physics+physics). Deterministic per rng seed.
function composedDifficulty(base, mods, finisher) {
  let d = base.difficulty;
  const parts = [{ role: "base", name: base.name, d: base.difficulty }];
  for (const m of mods) { const inc = +(0.5 * Math.max(0, m.difficulty - 0.2)).toFixed(2); d += inc; parts.push({ role: "modifier", name: m.name, d: m.difficulty, adds: inc }); }
  if (finisher) { d += 0.08; parts.push({ role: "finisher", name: finisher.name, d: finisher.difficulty, adds: 0.08 }); }
  return { difficulty: +Math.min(0.98, d).toFixed(2), parts };
}

function buildMenu(rng, registry, opts = {}) {
  const k = opts.k || 1;
  let pool = enrichRegistry(registry);
  if (opts.static) pool = pool.filter(f => !f.dynamic);
  const target = opts.target != null ? +opts.target : +(0.45 + 0.5 * rng()).toFixed(2);
  const byFam = {}; for (const f of pool) (byFam[f.family] || (byFam[f.family] = [])).push(f);
  const present = fam => (byFam[fam] || []).length > 0;
  const baseFams = Object.keys(byFam).filter(fam => FAMILY_DB[fam].roles.includes("base"));
  const pickIn = (fams) => fams[rng.int(0, fams.length - 1)];
  const pickFn = (fam, want, taken) => {   // the fn in the family with paired difficulty closest to `want` (rng tie-break)
    const cand = (byFam[fam] || []).filter(f => !taken.has(f.name));
    if (!cand.length) return null;
    const best = Math.min(...cand.map(f => Math.abs(f.difficulty - want)));
    const top = cand.filter(f => Math.abs(f.difficulty - want) <= best + 0.06);
    return top[rng.int(0, top.length - 1)];
  };

  let chosen = null;
  for (let attempt = 0; attempt < 60 && !chosen; attempt++) {
    // 1. base family near the difficulty target (band overlap), else any base family
    const near = baseFams.filter(fam => { const [lo, hi] = FAMILY_DB[fam].band; return hi >= target - 0.18 && lo <= target + 0.18; });
    const fam = pickIn(near.length ? near : baseFams);
    const taken = new Set();
    const base = pickFn(fam, target, taken);
    if (!base) continue;
    taken.add(base.name);
    let wholeUsed = base.wholeGrid ? 1 : 0;
    // 2. spend the remaining budget on refinements, ONLY from admits(baseFamily) — by construction
    const admitted = FAMILY_DB[fam].admits.filter(present);
    const mods = [], usedFams = new Set([fam]); let finisher = null;
    let budget = Math.max(0, target - base.difficulty);
    const order = admitted.slice(); for (let z = order.length - 1; z > 0; z--) { const j = rng.int(0, z); [order[z], order[j]] = [order[j], order[z]]; }
    for (const af of order) {
      if (1 + mods.length + (finisher ? 1 : 0) >= k) break;
      const db = FAMILY_DB[af];
      if (usedFams.has(af) && !(af === fam && FAMILY_DB[fam].admits.includes(fam))) continue;   // a family repeats only if it admits ITSELF (e.g. physics+physics)
      if (db.roles.includes("finisher")) {
        if (finisher || wholeUsed >= 1) continue;
        const fn = pickFn(af, mid(db.band), taken); if (!fn) continue;
        finisher = fn; taken.add(fn.name); usedFams.add(af); if (fn.wholeGrid) wholeUsed++;
      } else if (db.roles.includes("modifier")) {
        const want = mods.length ? 0.35 : Math.max(0.3, Math.min(0.7, budget + 0.25));   // first mod chases the budget, later ones stay light
        const fn = pickFn(af, want, taken); if (!fn) continue;
        if (fn.wholeGrid && wholeUsed >= 1) continue;
        mods.push(fn); taken.add(fn.name); usedFams.add(af); if (fn.wholeGrid) wholeUsed++;
        budget = Math.max(0, budget - 0.5 * Math.max(0, fn.difficulty - 0.2));
      }
    }
    if (1 + mods.length + (finisher ? 1 : 0) === k) chosen = { base, mods, finisher, fam };
    else if (k === 1) chosen = { base, mods: [], finisher: null, fam };
  }
  if (!chosen) {   // graph could not fill k slots (tiny registry) — honest fallback: base-only
    const fam = pickIn(baseFams); const base = pickFn(fam, target, new Set());
    chosen = { base, mods: [], finisher: null, fam };
  }

  const { base, mods, finisher, fam } = chosen;
  const fns = [base, ...mods, ...(finisher ? [finisher] : [])];   // structural order: base → modifiers → finisher LAST
  const axisSets = fns.map(c => new Set(c.safeAug));
  const augmentations = [...new Set(fns.flatMap(c => c.safeAug))].filter(a => axisSets.every(s => s.has(a)));
  const comp = composedDifficulty(base, mods, finisher);
  const hintBits = ["ONE core mechanic: " + base.name.replace(/_/g, " ")];
  if (mods.length) hintBits.push("refine it with " + mods.map(m => m.name.replace(/_/g, " ")).join(" + ") + " (the refinement keys/conditions the core rule — it is not a second rule)");
  if (finisher) hintBits.push("then apply " + finisher.name.replace(/_/g, " ") + " ONCE to the whole grid, LAST");
  if (!mods.length && !finisher) hintBits.push("vary the non-rule features HARD across examples");
  const role = f => f === base ? "base" : (finisher && f === finisher ? "finisher" : "modifier");
  return {
    functions: fns.map(f => ({ name: f.name, category: f.category, rule: f.rule, wholeGrid: f.wholeGrid, family: f.family, role: role(f), difficulty: f.difficulty })),
    augmentations, composeHint: hintBits.join("; "),
    difficulty: comp.difficulty, target, budget: comp.parts, baseFamily: fam, k: fns.length,
  };
}

// ============================================================ self-test
function selfTest() {
  // taxonomy integrity: every admits edge lands on a real family; roles are valid
  for (const [fam, db] of Object.entries(FAMILY_DB)) {
    for (const a of db.admits) if (!FAMILY_DB[a]) throw new Error("builder: " + fam + " admits unknown family " + a);
    for (const r of db.roles) if (!["base", "modifier", "finisher"].includes(r)) throw new Error("builder: bad role " + r);
    if (db.band[0] > db.band[1]) throw new Error("builder: inverted band on " + fam);
  }
  for (const fam of Object.values(CATEGORY_FAMILY)) if (!FAMILY_DB[fam]) throw new Error("builder: category maps to unknown family " + fam);
  // enrichment + composition against the REAL registry (cli.js re-checks in its own self-test too)
  const path = require("path"), fs = require("fs"), E = require("./engine.js");
  const dir = path.join(__dirname, "scenes", "library");
  const files = fs.readdirSync(dir).filter(x => x.endsWith(".txt"));
  const registry = files.map(file => {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    let concepts = [], difficulty = null;
    try { const w = E.runScene(E.withSeedText(text, 1), { noSim: true }); concepts = w.meta.concepts || []; difficulty = w.meta.difficulty; } catch (e) { }
    const vary = (text.match(/^\s*vary\s+(.+)$/m) || [, ""])[1].trim().split(/\s+/).filter(Boolean);
    let dynamic = false;
    try { const p = E.buildTask(text, { examples: 1, seed0: 1 }); dynamic = [p.in, p.out, ...p.examples.flatMap(e => [e.in, e.out])].some(v => v.length > 1); } catch (e) { }
    return { name: file.replace(/\.txt$/, ""), file, category: concepts[0] || file.replace(/\.txt$/, ""), concepts, difficulty, rule: (text.match(/^\s*rule\s+(.+)$/m) || [, null])[1], safeAug: vary, wholeGrid: /\b(grid_rotate|grid_flip|grid_map|sort_rows|solve|grid_complete|unfold|crop)\b/.test(text), verbs: [], dynamic };
  });
  const enriched = enrichRegistry(registry);
  if (!enriched.every(f => FAMILY_DB[f.family])) throw new Error("builder: a function landed in an unknown family");
  if (!enriched.every(f => typeof f.difficulty === "number" && f.difficulty > 0 && f.difficulty <= 1)) throw new Error("builder: a function has no paired difficulty");
  const gridGlobals = enriched.filter(f => f.family === "grid/global");
  if (!gridGlobals.length || !gridGlobals.every(f => f.wholeGrid)) throw new Error("builder: grid/global must hold exactly the whole-grid grid ops");
  // menu structure across many seeds: 1 base, mods ∈ admits(base), ≤1 whole-grid, finisher last, no static/dynamic mix
  for (let s = 1; s <= 120; s++) {
    const rng = E.makeRng(s * 7919 + 3);
    const k = 1 + (s % 3);
    const m = buildMenu(rng, registry, { k, static: s % 2 === 0 });
    if (m.functions.filter(f => f.role === "base").length !== 1) throw new Error("builder: menu must have exactly one base");
    if (m.functions[0].role !== "base") throw new Error("builder: base must come first");
    const db = FAMILY_DB[m.baseFamily];
    for (const f of m.functions.slice(1)) if (!db.admits.includes(f.family)) throw new Error("builder: " + f.family + " not admitted by " + m.baseFamily);
    if (m.functions.filter(f => f.wholeGrid).length > 1) throw new Error("builder: >1 whole-grid op");
    const fin = m.functions.findIndex(f => f.role === "finisher");
    if (fin >= 0 && fin !== m.functions.length - 1) throw new Error("builder: finisher must be LAST");
    const doms = new Set(m.functions.map(f => FAMILY_DB[f.family].dynamic ? "dynamic" : "static"));
    if (doms.size > 1) throw new Error("builder: static and dynamic mixed in one menu");
    if (!(m.difficulty > 0 && m.difficulty <= 0.98)) throw new Error("builder: bad composed difficulty");
    if (!Array.isArray(m.budget) || m.budget.length !== m.functions.length) throw new Error("builder: budget breakdown must cover every function");
  }
  // determinism
  const a = JSON.stringify(buildMenu(E.makeRng(11), registry, { k: 3 }));
  const b = JSON.stringify(buildMenu(E.makeRng(11), registry, { k: 3 }));
  if (a !== b) throw new Error("builder: non-deterministic menu");
  // k is honoured when the graph allows it
  const m3 = buildMenu(E.makeRng(123), registry, { k: 3 });
  if (m3.functions.length !== 3) throw new Error("builder: k=3 not honoured (got " + m3.functions.length + ")");
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) { selfTest(); console.log("builder.js: self-test PASS"); }
  else if (args.includes("--families")) {
    for (const [fam, db] of Object.entries(FAMILY_DB))
      console.log(fam.padEnd(20), (db.dynamic ? "DYN " : "sta ") + ("[" + db.roles.join(",") + "]").padEnd(18), "band " + db.band.join("–"), " admits: " + (db.admits.join(", ") || "—"));
  }
}

module.exports = { FAMILY_DB, CATEGORY_FAMILY, familyOf, enrichRegistry, buildMenu, composedDifficulty, selfTest };
