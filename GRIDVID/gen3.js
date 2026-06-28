#!/usr/bin/env node
/* gen3.js — SKINNED + COMPLEX, solver2-verified tasks (Mario: "non vedo le skin, non vedo regole complesse").
 * Objects carry an internal SKIN pattern (core/border/cross/stripe/checker/diag/split/quadrants) that the
 * solver reads back from pixels, so rules can dispatch/select on the skin. Plus genuinely complex relational
 * rules (recolour everything to the largest/majority object's colour). Mixed with the best gen2 families.
 *   node gen3.js --n 40 --report   ·   node gen3.js --n 500 -o out/gen3.jsonl   ·   node gen3.js --self-test
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const SK = require("./skins2.js");
const SOL = require("./solver.js");
const V2 = require("./solver2.js");
const G2 = require("./gen2.js");

const pick = (rng, xs) => xs[rng.int(0, xs.length - 1)];
const sampleK = (rng, xs, k) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
const PALETTE = [1, 2, 3, 4, 6, 7, 8, 9];
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));

// ---------- loc-based skinned objects ----------
function makeSkinned(rng, opt) {                          // → { loc, fp, body, skin } | null
  const kind = opt.kind || pick(rng, SK.SKINS && ["square", "diamond", "disc"]), size = opt.size || rng.int(4, 6);
  const body = opt.body, accent = opt.accent != null ? opt.accent : pick(rng, PALETTE.filter(c => c !== body)), skin = opt.skin;
  const loc = SK.renderObjLoc({ kind, size, body, accent, skin });
  if (skin !== "plain" && SK.classifySkin(loc) !== skin) return null;   // must round-trip (generator↔solver agree)
  const fp = SK.footprint(loc);
  return { loc, fp, body, skin, h: loc.length, w: loc[0].length };
}
function placeLoc(rng, H, W, specs, gap = 2) {
  const occ = blank(H, W), out = [];
  const free = (fp, r, c) => fp.every(([dr, dc]) => { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) return false; for (let a = -gap; a <= gap; a++) for (let b = -gap; b <= gap; b++) { const nr = rr + a, nc = cc + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false; } return true; });
  for (const sp of specs) { let ok = false; for (let t = 0; t < 240 && !ok; t++) { const r = rng.int(0, H - sp.h), c = rng.int(0, W - sp.w); if (free(sp.fp, r, c)) { for (const [dr, dc] of sp.fp) occ[r + dr][c + dc] = 1; out.push({ ...sp, r, c }); ok = true; } } if (!ok) return null; }
  return out;
}
const renderLoc = (H, W, objs) => { const g = blank(H, W); for (const o of objs) for (let i = 0; i < o.loc.length; i++) for (let j = 0; j < o.loc[0].length; j++) if (o.loc[i][j]) { const r = o.r + i, c = o.c + j; if (r >= 0 && c >= 0 && r < H && c < W) g[r][c] = o.loc[i][j]; } return g; };
const cropLoc = o => o.loc;   // a single object's loc IS its cropped grid

// build K skinned objects (same kind/size/body/accent, only SKIN varies → solver derives by skin)
function skinScene(rng, skins, opt = {}) {
  const H = rng.int(16, 22), W = rng.int(16, 22), kind = opt.kind || pick(rng, ["square", "diamond"]), size = opt.size || rng.int(4, 5);
  const body = pick(rng, PALETTE), accent = pick(rng, PALETTE.filter(c => c !== body));
  const specs = skins.map(skin => makeSkinned(rng, { kind, size, body, accent, skin }));
  if (specs.some(s => !s)) return null;
  const objs = placeLoc(rng, H, W, sampleK(rng, specs, specs.length), 2);
  return objs ? { H, W, objs } : null;
}

// ---------- task assembly ----------
function asm(ex) { if (ex.length < 4) return null; const examples = ex.slice(0, 3), test = ex[3]; const id = "G3-" + crypto.createHash("sha1").update(JSON.stringify([examples, test])).digest("hex").slice(0, 8); return { format: "prodigy-task", version: 1, width: test.in[0][0].length, height: test.in[0].length, palette: "arc10", fps: 1, examples, in: test.in, out: test.out, meta: { id } }; }
function build(rng, sceneFn, outFn) { const ex = []; for (let i = 0; i < 4; i++) { const sc = sceneFn(); if (!sc) return null; const inG = renderLoc(sc.H, sc.W, sc.objs); let outG; try { outG = outFn(sc, inG); } catch (e) { return null; } if (!outG) return null; ex.push({ in: [inG], out: [outG] }); } return asm(ex); }

// apply a per-object descriptor map keyed by skin → OUT grid (reuse solver's applyDescriptor so gen↔solver agree)
function applyBySkin(sc, map) { const out = blank(sc.H, sc.W); for (const o of sc.objs) { const d = map[o.skin] || "identity"; if (d === "remove") continue; const loc = SOL.applyDescriptor(d, o.loc, o.body); for (let i = 0; i < loc.length; i++) for (let j = 0; j < loc[0].length; j++) if (loc[i][j]) out[o.r + i][o.c + j] = loc[i][j]; } return out; }

const GEOM = ["mirror_h", "flip_v", "rotate_180"];
const FAMILIES = {
  skin_dispatch: rng => {                                  // each SKIN pattern triggers a different operation
    const skins = sampleK(rng, SK.SKINS, rng.int(2, 3)), ts = skins.map(() => pick(rng, [...GEOM, "recolor:" + pick(rng, PALETTE)]));
    const map = {}; skins.forEach((s, i) => map[s] = ts[i]);
    return build(rng, () => skinScene(rng, [...skins, ...sampleK(rng, skins, rng.int(1, 2))]), sc => applyBySkin(sc, map));
  },
  odd_skin_recolor: rng => {                               // K-1 same skin + 1 odd skin → recolour the odd
    const [a, b] = sampleK(rng, SK.SKINS, 2), cm = pick(rng, PALETTE);
    const K = rng.int(3, 4);
    return build(rng, () => skinScene(rng, [b, ...Array(K - 1).fill(a)]), sc => applyBySkin(sc, { [b]: "recolor:" + cm, [a]: "identity" }));
  },
  odd_skin_remove: rng => { const [a, b] = sampleK(rng, SK.SKINS, 2), K = rng.int(3, 4); return build(rng, () => skinScene(rng, [b, ...Array(K - 1).fill(a)]), sc => applyBySkin(sc, { [b]: "remove", [a]: "identity" })); },
  keep_skin: rng => {                                      // keep only the object with skin X (others vanish)
    const [a, b] = sampleK(rng, SK.SKINS, 2), K = rng.int(3, 4);
    return build(rng, () => skinScene(rng, [b, ...Array(K - 1).fill(a)]), sc => applyBySkin(sc, { [b]: "identity", [a]: "remove" }));
  },
  skin_geom_by_skin: rng => {                              // 2-skin scene, each skin a different GEOM transform
    const [a, b] = sampleK(rng, SK.SKINS, 2), ta = pick(rng, GEOM), tb = pick(rng, GEOM.filter(t => t !== pick(rng, GEOM)) || GEOM);
    const map = { [a]: ta, [b]: tb };
    return build(rng, () => skinScene(rng, sampleK(rng, [a, a, b, b, a, b], rng.int(3, 5))), sc => applyBySkin(sc, map));
  },
  recolor_to_largest_color: rng => {                       // RELATIONAL: everything → the largest object's colour
    return build(rng, () => {
      const H = rng.int(17, 22), W = rng.int(17, 22), sizes = sampleK(rng, [2, 3, 4, 5], rng.int(3, 4)), cols = sampleK(rng, PALETTE, sizes.length);
      const specs = sizes.map((s, i) => makeSkinned(rng, { kind: "square", size: s, body: cols[i], accent: cols[i], skin: "plain" }));
      const objs = placeLoc(rng, H, W, specs, 2); return objs ? { H, W, objs } : null;
    }, (sc, inG) => V2.recolorToRef(inG, "largest"));
  },
  recolor_to_majority_color: rng => {
    return build(rng, () => {
      const H = rng.int(17, 22), W = rng.int(17, 22), maj = pick(rng, PALETTE), other = pick(rng, PALETTE.filter(c => c !== maj));
      const plan = [maj, maj, maj, other, pick(rng, PALETTE.filter(c => c !== maj))];
      const specs = sampleK(rng, plan, plan.length).map(col => makeSkinned(rng, { kind: pick(rng, ["square", "diamond"]), size: rng.int(2, 4), body: col, accent: col, skin: "plain" }));
      const objs = placeLoc(rng, H, W, specs, 2); return objs ? { H, W, objs } : null;
    }, (sc, inG) => V2.recolorToRef(inG, "majority"));
  },
};
// fold in the best gen2 families for breadth (the non-trivial ones)
for (const k of ["odd_recolor", "odd_extract", "odd_remove", "gravity", "fill_holes", "connect_pairs", "denoise", "remove_extreme", "pipeline"]) FAMILIES[k] = G2.FAMILIES[k];
// weight toward the NEW skin/relational families so skins are prominent
const WEIGHTED = ["skin_dispatch", "skin_dispatch", "odd_skin_recolor", "odd_skin_remove", "keep_skin", "skin_geom_by_skin", "recolor_to_largest_color", "recolor_to_majority_color", ...Object.keys(FAMILIES)];

function generate(opts = {}) {
  const n = opts.n || 40, rng = E.makeRng((opts.seed || 1) * 2654435761 + 97);
  const out = [], seenRule = new Set(), seenId = new Set(); let attempts = 0; const rej = { build: 0, trivial: 0, unsolvable: 0, ambiguous: 0, teaching: 0 };
  const budget = opts.budget || n * 90;
  while (out.length < n && attempts < budget) {
    attempts++;
    const fam = pick(rng, WEIGHTED);
    let task; try { task = FAMILIES[fam](rng); } catch (e) { task = null; }
    if (!task) { rej.build++; continue; }
    if (task.examples.some(e => JSON.stringify(e.in) === JSON.stringify(e.out)) || new Set(task.examples.map(e => JSON.stringify(e.out))).size < 2) { rej.teaching++; continue; }
    if (B.trivialSolve(task)) { rej.trivial++; continue; }
    const sv = V2.solvable(task);
    if (!sv.solvable) { rej.unsolvable++; continue; }
    if (!sv.unique) { rej.ambiguous++; continue; }
    if (/^recolour every object (red|blue|green|yellow|grey|magenta|orange|cyan|maroon)$/.test(sv.rule)) { rej.trivial++; continue; }
    if (opts.dedup !== false && seenRule.has(sv.rule)) continue;
    if (seenId.has(task.meta.id)) continue;
    seenRule.add(sv.rule); seenId.add(task.meta.id);
    task.meta.family = fam; task.meta.rule = sv.rule + "."; task.meta.language_description = task.meta.rule;
    task.meta.solver = { rule: sv.rule, unique: true, n_fits: sv.n_fits };
    out.push(task);
  }
  return { records: out, attempts, emitted: out.length, distinct_rules: seenRule.size, rejected: rej, families: [...new Set(out.map(t => t.meta.family))] };
}

function selfTest() {
  const r = generate({ n: 24, seed: 3 });
  if (r.emitted < 24) throw new Error("gen3: underfilled (" + r.emitted + "/24)");
  for (const t of r.records) { const sv = V2.solvable(t); if (!sv.solvable || !sv.unique) throw new Error("not uniquely solvable: " + t.meta.id + " — " + sv.reason); if (B.trivialSolve(t)) throw new Error("trivial leaked: " + t.meta.id); }
  const fams = new Set(r.records.map(t => t.meta.family));
  if (fams.size < 6) throw new Error("gen3: too few families (" + fams.size + ")");
  if (![...fams].some(f => f.startsWith("skin") || f.startsWith("odd_skin") || f === "keep_skin")) throw new Error("gen3: NO skin-based task emitted");
  if (![...fams].some(f => f.startsWith("recolor_to"))) throw new Error("gen3: no relational rule emitted");
  const a = generate({ n: 10, seed: 9 }).records.map(t => t.meta.id).join(","), b = generate({ n: 10, seed: 9 }).records.map(t => t.meta.id).join(",");
  if (a !== b) throw new Error("gen3: non-deterministic");
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("gen3: self-test PASS"); }
  else {
    const n = +flag("--n", 40), seed = +flag("--seed", 1), o = flag("-o", null), r = generate({ n, seed });
    if (args.includes("--report")) {
      console.error(`\nSKINNED + COMPLEX, solver2-verified — ${r.emitted}/${n}, ${r.distinct_rules} distinct rules`);
      console.error("families:", r.families.join(", "));
      console.error("rejected:", JSON.stringify(r.rejected));
      console.error("\nsample:"); for (const t of r.records.slice(0, 20)) console.error(`  [${t.meta.family}] ${t.meta.rule}`);
      console.error("");
    }
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} → ${o}`); }
    else if (!args.includes("--report")) console.log(r.records.map(t => JSON.stringify(t)).join("\n"));
  }
}

module.exports = { generate, FAMILIES, makeSkinned, skinScene };
