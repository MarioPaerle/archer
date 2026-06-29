#!/usr/bin/env node
/* redteam.js — the BUILD-GATE harness (Phase-0 anti-reflexivity; CORPUS_ARCHITECTURE.md §5 item 4).
 *
 * The corpus must only contain tasks that live in the GAP:
 *     well-posed-by-arc_search  ∧  NOT-cheaply-cracked-by-arc_attack
 *
 * This module wires the certifier (arc_search.js) to the independent stronger attacker (arc_attack.js) and
 * applies the keep/reject decision per task and per generator FAMILY. A family that any threshold flags is
 * declared DOA (ARC-1-grade) and excluded until it passes.
 *
 *   gateTask(task)                          → { hard, reasons }
 *   gateFamily(generatorModule, n, thresh)  → per-family dashboard (crack/leak percentages + hardPct + DOA)
 *
 *   node redteam.js --self-test             # runs gateFamily on the three generators and prints the dashboards
 */
const ATK = require("./arc_attack.js");
const SEARCH = require("./arc_search.js");

const H = g => g.length, W = g => (g[0] ? g[0].length : 0);
const eqG = (a, b) => !!a && !!b && a.length === b.length && a[0].length === b[0].length && a.every((r, i) => r.every((x, j) => x === b[i][j]));

/* gateTask — a task is HARD iff:
 *   (A) arc_search certifies it WELL-POSED: solvable, a unique determined test answer, and not too-easy
 *       (minimal solving depth ≥ the certifier's minDepth);  AND
 *   (B) arc_attack does NOT crack it cheaply:
 *        - not one-pair crackable,
 *        - not two-pair crackable,
 *        - not statistically shortcuttable (sizeLeak alone is allowed — same-dims is normal for ARC; but a
 *          colorPrior or posTemplate shortcut that PREDICTS the test is a real leak),
 *        - not cracked by the depth-4 superset search with a program no LONGER than the certifier's minimal one
 *          (a shorter/equal independent program ⇒ the certifier over-stated the difficulty).
 * Returns every failed reason so the dashboard can attribute rejections. */
function gateTask(task, opts = {}) {
  const reasons = [];
  let certDepth = Infinity;
  try {
    // (A) well-posed by the certifier
    const d = SEARCH.difficulty(task, { maxDepth: opts.certMaxDepth ?? 4, minDepth: opts.minDepth ?? 3 });
    certDepth = d.depth;
    if (!d.solvable) reasons.push("not-solvable");
    if (!d.unique) reasons.push("not-unique");
    if (d.tooEasy) reasons.push("too-easy(depth<" + (opts.minDepth ?? 3) + ")");
  } catch (e) { reasons.push("certifier-error"); }

  try {
    // (B) not cheaply cracked by the independent stronger attacker
    if (ATK.onePairCrack(task, opts.kp ?? { maxDepth: 3, maxStates: 12000 })) reasons.push("onePair-crackable");
    if (ATK.twoPairCrack(task, opts.kp ?? { maxDepth: 3, maxStates: 12000 })) reasons.push("twoPair-crackable");
    const s = ATK.statShortcut(task);
    if (s.colorPrior) reasons.push("colorPrior-shortcut");
    if (s.posTemplate) reasons.push("posTemplate-shortcut");
    const a = ATK.attack(task, opts.atk ?? { maxDepth: 4, maxStates: 60000 });
    // a depth-4 superset program that reproduces the test with a program no longer than the certifier's minimal
    // depth ⇒ the attacker found an equally-short or shorter independent solution ⇒ the task is not genuinely hard.
    if (a.cracked && a.depth <= certDepth) reasons.push("brute-cracked(d=" + a.depth + "≤cert " + certDepth + ")");
  } catch (e) { reasons.push("attacker-error"); }

  return { hard: reasons.length === 0, reasons, certDepth };
}

/* gateFamily — sample n tasks from a generator module and report the per-family dashboard. A family is DOA if
 * any threshold is exceeded:
 *   onePairPct > thresholds.onePair   (default 0.05)
 *   brutePct   > thresholds.brute     (default 0.10)   — fraction cracked by depth-4 superset search
 *   max(colorPriorPct, posTemplatePct) > thresholds.stat (default 0.15)
 * sizeLeak is reported but NOT a DOA trigger (same-dims is normal for in-place ARC rules). */
function gateFamily(generatorModule, n = 24, thresholds = {}) {
  const th = { onePair: 0.05, brute: 0.10, stat: 0.15, ...thresholds };
  const seed = thresholds.seed ?? 7;
  let tasks = [];
  try { tasks = (generatorModule.generate(n, { seed, depth: 3 }) || {}).tasks || []; } catch (e) { tasks = []; }
  const N = tasks.length;
  let onePair = 0, twoPair = 0, brute = 0, sizeLeak = 0, colorPrior = 0, posTemplate = 0, hard = 0;
  const reasonTally = {};
  const atk = thresholds.atk ?? { maxDepth: 4, maxStates: 40000 };
  const kp = thresholds.kp ?? { maxDepth: 3, maxStates: 10000 };
  const minDepth = thresholds.minDepth ?? 3;
  for (const t of tasks) {
    try {
      // compute every signal ONCE, then derive the gate decision (avoids re-running search inside gateTask)
      const op = ATK.onePairCrack(t, kp); if (op) onePair++;
      const tp = ATK.twoPairCrack(t, kp); if (tp) twoPair++;
      const a = ATK.attack(t, atk); if (a.cracked) brute++;
      const s = ATK.statShortcut(t); if (s.sizeLeak) sizeLeak++; if (s.colorPrior) colorPrior++; if (s.posTemplate) posTemplate++;
      const d = SEARCH.difficulty(t, { maxDepth: atk.maxDepth, minDepth });
      const reasons = [];
      if (!d.solvable) reasons.push("not-solvable");
      if (d.solvable && !d.unique) reasons.push("not-unique");
      if (d.tooEasy) reasons.push("too-easy");
      if (op) reasons.push("onePair-crackable");
      if (tp) reasons.push("twoPair-crackable");
      if (s.colorPrior) reasons.push("colorPrior-shortcut");
      if (s.posTemplate) reasons.push("posTemplate-shortcut");
      if (a.cracked && a.depth <= d.depth) reasons.push("brute-cracked");
      if (reasons.length === 0) hard++; else for (const r of reasons) reasonTally[r] = (reasonTally[r] || 0) + 1;
    } catch { reasonTally["gate-error"] = (reasonTally["gate-error"] || 0) + 1; }
  }
  const pct = x => N ? x / N : 0;
  const dash = {
    family: generatorModule.__name || "(module)", n: N,
    onePairPct: pct(onePair), twoPairPct: pct(twoPair), brutePct: pct(brute),
    sizeLeakPct: pct(sizeLeak), colorPriorPct: pct(colorPrior), posTemplatePct: pct(posTemplate),
    hardPct: pct(hard), reasonTally,
  };
  dash.doa = N === 0 || dash.onePairPct > th.onePair || dash.brutePct > th.brute
    || Math.max(dash.colorPriorPct, dash.posTemplatePct) > th.stat;
  dash.doaReasons = [];
  if (N === 0) dash.doaReasons.push("no-tasks-generated");
  if (dash.onePairPct > th.onePair) dash.doaReasons.push(`onePair ${(100 * dash.onePairPct).toFixed(0)}%>${100 * th.onePair}%`);
  if (dash.brutePct > th.brute) dash.doaReasons.push(`brute ${(100 * dash.brutePct).toFixed(0)}%>${100 * th.brute}%`);
  if (Math.max(dash.colorPriorPct, dash.posTemplatePct) > th.stat) dash.doaReasons.push(`stat-shortcut>${100 * th.stat}%`);
  dash.thresholds = th;
  return dash;
}

module.exports = { gateTask, gateFamily };

// ============================================================ self-test ===================================
function fmt(p) { return (100 * p).toFixed(0) + "%"; }
function printDash(d) {
  console.log(`  [${d.family}]  n=${d.n}  ${d.doa ? "❌ DOA" : "✅ pass"}`);
  console.log(`      onePair=${fmt(d.onePairPct)}  twoPair=${fmt(d.twoPairPct)}  brute=${fmt(d.brutePct)}  ` +
    `sizeLeak=${fmt(d.sizeLeakPct)}  colorPrior=${fmt(d.colorPriorPct)}  posTemplate=${fmt(d.posTemplatePct)}  hard=${fmt(d.hardPct)}`);
  if (d.doaReasons.length) console.log(`      DOA reasons: ${d.doaReasons.join(", ")}`);
  if (Object.keys(d.reasonTally).length) console.log(`      reject tally: ${JSON.stringify(d.reasonTally)}`);
}

function selfTest() {
  const t0 = Date.now();
  console.log("redteam self-test — build-gate dashboards (empirical validation of Flaw A)\n");
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ✓ " + name + (extra ? "  " + extra : "")); } else { fail++; console.log("  ✗ " + name + "  " + extra); } };

  const GS = require("./gen_search.js"); GS.__name = "gen_search";
  const GU = require("./gen_underdetermined.js"); GU.__name = "gen_underdetermined";
  const GC = require("./gen_compositional.js"); GC.__name = "gen_compositional";

  const N = 12;                                   // keep the depth-4 sweep under a minute
  console.log("  Per-family build-gate dashboards:");
  const dS = gateFamily(GS, N, { seed: 7 });
  const dU = gateFamily(GU, N, { seed: 11 });
  const dC = gateFamily(GC, N, { seed: 17 });
  printDash(dS); printDash(dU); printDash(dC);
  console.log("");

  // EXPECTED + HONEST: gen_search and gen_compositional fail the brute gate (high crack rate) ⇒ DOA.
  ok("gen_search is flagged DOA by the build gate (fails brute/onePair)", dS.doa, `brute=${fmt(dS.brutePct)}`);
  ok("gen_compositional is flagged DOA by the build gate", dC.doa, `brute=${fmt(dC.brutePct)}`);
  // gen_underdetermined is the best of the three on the HARD-pct axis (most tasks survive the gate) —
  // it is the only family with genuine cross-pair under-determination, even though the superset attacker
  // still cracks fixed programs (so it too is DOA under the strict §5 gate; Phase-1 program-valued rules fix that).
  ok("gen_underdetermined has the highest hardPct of the three (best family today)",
    dU.hardPct >= dS.hardPct && dU.hardPct >= dC.hardPct, `hard: U=${fmt(dU.hardPct)} S=${fmt(dS.hardPct)} C=${fmt(dC.hardPct)}`);

  // gateTask is internally consistent: a hard task has zero reasons; a non-hard task names ≥1 reason.
  let consistent = true;
  for (const t of (GS.generate(4, { seed: 99, depth: 3 }) || {}).tasks || []) {
    const g = gateTask(t); if (g.hard !== (g.reasons.length === 0)) consistent = false;
  }
  ok("gateTask: hard ⟺ zero reasons", consistent);

  console.log(`\n  KEY NUMBERS (paste to orchestrator):`);
  console.log(`    gen_search        brute=${fmt(dS.brutePct)} onePair=${fmt(dS.onePairPct)} hard=${fmt(dS.hardPct)}  → ${dS.doa ? "DOA" : "PASS"}`);
  console.log(`    gen_compositional brute=${fmt(dC.brutePct)} onePair=${fmt(dC.onePairPct)} hard=${fmt(dC.hardPct)}  → ${dC.doa ? "DOA" : "PASS"}`);
  console.log(`    gen_underdetermined brute=${fmt(dU.brutePct)} onePair=${fmt(dU.onePairPct)} hard=${fmt(dU.hardPct)}  → ${dU.doa ? "DOA" : "PASS"}`);
  console.log(`\n${pass} passed, ${fail} failed   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (fail) process.exit(1);
}
if (require.main === module && process.argv.includes("--self-test")) selfTest();
