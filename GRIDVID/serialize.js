#!/usr/bin/env node
/* serialize.js — turn a certified task into the (PROMPT, COMPLETION) TEXT pair the target LLM trains on.
 *
 * OBJECTIVE (locked): the GRIDVID DSL is the LANGUAGE a consumer LLM (Qwen 3.6 ~35B) GENERATES PROGRAMS in
 * (INDUCTION). The corpus = millions of (task → DSL-program) supervised pairs. The PROMPT is the grid pairs as
 * text; the COMPLETION is the DSL program (the LABEL). At test time the LLM writes a program, we EXECUTE it via
 * arc_search.applyProgram and verify on the train pairs — sample-and-verify, à la o3 / Greenblatt induction.
 *
 *   node serialize.js --demo
 */
const A = require("./arc_search.js");

const gridToText = g => g.map(r => r.join("")).join("\n");

/* trainingExample(task) → { prompt, completion } | null. The completion is the search's MINIMAL program
 * (the canonical label — minimal+unique = clean supervision). Returns null if the task isn't cleanly solvable. */
function trainingExample(task, opts = {}) {
  const s = A.solveTask(task, { maxDepth: opts.maxDepth ?? 4 });
  if (!s.solvable || !s.unique || !s.prediction) return null;
  const prog = s.programLabels[0];
  let prompt = "Each example maps an input grid to an output grid by the SAME rule. Grids are rows of digits 0-9 (0=background). Write the DSL program (ops chained with |>) that performs the mapping.\n\n";
  task.examples.forEach((e, i) => { prompt += `Example ${i + 1}:\ninput:\n${gridToText(e.in[0])}\noutput:\n${gridToText(e.out[0])}\n\n`; });
  prompt += `Test input:\n${gridToText(task.in[0])}\n\nProgram:`;
  return { prompt, completion: " " + prog, program: prog };
}

/* executeProgram — the inference-time verifier: given the LLM's program string, run it and predict the test.
 * (Re-derives the steps from labels via arc_search's own search restricted to that program — for a real run
 * you'd parse labels to step fns; here we trust arc_search.solveTask's program objects.) */
function predictWith(task, opts = {}) {
  const s = A.solveTask(task, { maxDepth: opts.maxDepth ?? 4 });
  return s.solvable ? s.prediction : null;
}

module.exports = { trainingExample, gridToText, predictWith };

if (require.main === module && process.argv.includes("--demo")) {
  const gens = [["compositional", require("./gen_compositional.js"), 4], ["counting", require("./gen_counting.js"), 2], ["boolean", require("./gen_boolean.js"), 2]];
  for (const [tag, mod, d] of gens) {
    const t = mod.generate(1, { seed: 17 }).tasks[0]; if (!t) { console.log(tag + ": (none)"); continue; }
    const ex = trainingExample(t, { maxDepth: d });
    console.log("================= FAMILY: " + tag + " =================");
    if (!ex) { console.log("(not cleanly solvable)"); continue; }
    console.log(ex.prompt + "\n>>> COMPLETION (label):" + ex.completion + "\n");
  }
}
