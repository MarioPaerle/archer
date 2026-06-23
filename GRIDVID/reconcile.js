/* reconcile.js — the RECONCILIATION layer (Mario's architecture): the program-first generator owns CORRECTNESS;
 * the LLM owns HUMANITY, extracted as a small VERIFIABLE choice, never free authoring (which overlaps / invents colours).
 *
 * mode-1 (RANK / taste): gen_hard makes K CORRECT variants of one task family; the LLM picks the most human/legible one.
 *   Because every variant is correct-by-construction, the output can never be incoherent, overlapping, or magic-coloured —
 *   the LLM only expresses taste. This is the strong variety+taste lever.
 *
 * (mode-2 FILL is already done in gen_count.js. mode-3 PROPOSE-combinations needs the program-first compose layer (PAN-120).)
 */
const E = require("./engine.js");

const gridToText = g => g.map(r => r.join("")).join("\n");
// show up to `nEx` example pairs of a task as digit grids (ARC text form the model can read).
function serializeTask(t, nEx = 2) {
  const last = v => v[v.length - 1];
  return t.examples.slice(0, nEx).map((e, i) => `Example ${i + 1}:\nIN\n${gridToText(last(e.in))}\nOUT\n${gridToText(last(e.out))}`).join("\n");
}
// the RANK prompt: K correct variants of the SAME rule → pick the most human/legible.
function buildRankPrompt(rule, variants) {
  const blocks = variants.map((t, i) => `VARIANT ${i + 1}:\n${serializeTask(t)}`).join("\n\n");
  return [
    "You judge the HUMAN QUALITY of candidate ARC-style puzzles. All variants below teach the SAME rule and are all correct.",
    "Grids are digits 0-9 (0 = black background, other digits = colours).",
    "", "RULE: " + rule,
    "",
    "Pick the ONE variant a human would find clearest and most natural: objects well separated (not touching, not cramped), sizes and colours legible, the rule obvious from the examples, nothing ambiguous or cluttered.",
    "", blocks,
    "", "Reply with ONLY the number (1-" + variants.length + ") of the best variant. No other text.",
  ].join("\n");
}
const parseChoice = (reply, k) => { const m = String(reply).match(/\d+/); if (!m) return 0; const n = +m[0]; return (n >= 1 && n <= k) ? n - 1 : 0; };

module.exports = { gridToText, serializeTask, buildRankPrompt, parseChoice };
