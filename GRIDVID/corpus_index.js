/* corpus_index.js — a hierarchical DB over the program-first families (Mario: a DB/hierarchy so we can hand the agent
 * the RIGHT, RELATED examples when a rule is drawn at random). Tree = prior → concept → [family keys]. Plus helpers to
 * pull exemplars that SHARE something (prior/concept) with a target, so the LLM sees coherent neighbours, not random ones. */
const E = require("./engine.js");
const GH = require("./gen_hard.js");

// prior → concept → [famKeys]  (each family is filed under its prior and every concept tag)
function buildIndex() {
  const tree = {}, byPrior = {}, byConcept = {};
  for (const [k, f] of Object.entries(GH.FAMILIES)) {
    const prior = f.prior || "other";
    (byPrior[prior] = byPrior[prior] || []).push(k);
    (tree[prior] = tree[prior] || {});
    for (const c of (f.concept || [])) { (tree[prior][c] = tree[prior][c] || []).push(k); (byConcept[c] = byConcept[c] || []).push(k); }
  }
  return { tree, byPrior, byConcept, families: Object.keys(GH.FAMILIES) };
}

// families sharing ANY of the given prior keywords or concept tags with the target (excluding `exclude`).
function relatedFamilies(idx, { priors = [], concepts = [], exclude = null }) {
  const score = {}, add = (k, w) => { if (k !== exclude) score[k] = (score[k] || 0) + w; };
  const pset = priors.flatMap(p => String(p).toLowerCase().split(/[\/,\s]+/)).filter(Boolean);
  for (const [k, f] of Object.entries(GH.FAMILIES)) {
    const fp = String(f.prior || "").toLowerCase();
    for (const p of pset) if (fp.includes(p)) add(k, 2);                       // shared prior keyword
    for (const c of (f.concept || [])) if (concepts.includes(c)) add(k, 1);    // shared concept tag
  }
  return Object.entries(score).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

// k RELATED exemplar tasks (built program-first = correct) sharing a prior/concept with the target. Falls back to random.
function relatedExemplars(idx, opts, k, rng) {
  let pool = relatedFamilies(idx, opts);
  if (pool.length < k) pool = pool.concat(idx.families.filter(f => !pool.includes(f)));   // top up with the rest
  const out = [];
  for (const fam of pool) { if (out.length >= k) break; try { out.push({ family: fam, task: GH.buildFamilyTask(fam, E.makeRng(rng.int(1, 1e9)), 3) }); } catch (e) { } }
  return out;
}

module.exports = { buildIndex, relatedFamilies, relatedExemplars };
