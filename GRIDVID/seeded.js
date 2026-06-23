/* seeded.js — the NVARC/BARC shape adapted to our stack (Mario, 2026-06-24).
 * The decisive thing NVARC does that we didn't: the LLM is SEEDED FROM REAL ARC TASKS + HUMAN DESCRIPTIONS,
 * and it writes a GENERATOR (a parameterised scene → a whole family via reseeding), not one task.
 * We already have the seed: DATASET/descriptions/training/*.md = rich human explanations of the REAL ARC-AGI-2 tasks
 * (Rule · Perception · Step decomposition · priors · expressible_in_dsl). This module feeds them to the generator.
 */
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");   // archer/ (DATASET lives beside GRIDVID)
const DESC_DIR = path.join(ROOT, "DATASET", "descriptions", "training");
const DATA_DIR = path.join(ROOT, "DATASET", "ARC-AGI-2", "data", "training");

const gridToText = g => g.map(r => r.join("")).join("\n");
function section(md, name) { const re = new RegExp("##\\s*" + name + "[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)", "i"); const m = md.match(re); return m ? m[1].trim() : ""; }
function frontmatter(md) { const m = md.match(/^---\n([\s\S]*?)\n---/); const fm = {}; if (m) for (const line of m[1].split(/\n/)) { const mm = line.match(/^([a-z_]+):\s*(.+)$/i); if (mm) fm[mm[1]] = mm[2].trim(); } return fm; }

// load seed descriptions (only those our DSL can plausibly express) + their real task grids.
function loadSeeds(opts = {}) {
  const files = fs.existsSync(DESC_DIR) ? fs.readdirSync(DESC_DIR).filter(f => f.endsWith(".md") && !f.startsWith("_")) : [];
  const seeds = [];
  for (const f of files) {
    const md = fs.readFileSync(path.join(DESC_DIR, f), "utf8"), fm = frontmatter(md), id = fm.task_id || f.replace(/\.md$/, "");
    const expr = (fm.expressible_in_dsl || "").toLowerCase();
    if (opts.exprOnly && expr === "no") continue;                       // skip rules our DSL can't express
    const rule = section(md, "Rule"), perception = section(md, "Perception");
    if (!rule) continue;
    let task = null; try { task = JSON.parse(fs.readFileSync(path.join(DATA_DIR, id + ".json"), "utf8")); } catch (e) { continue; }
    seeds.push({ id, expr, difficulty: fm.difficulty || "", priors: fm.priors || "", rule, perception, task });
  }
  return seeds;
}

// the prompt: show the REAL puzzle + the human rule, then ask for a GENERATOR (a reseed-varying scene), with the full grammar.
function buildSeededPrompt(seed, grammar) {
  const pairs = (seed.task.train || []).slice(0, 3).map((p, i) => `Pair ${i + 1}:\nINPUT\n${gridToText(p.input)}\nOUTPUT\n${gridToText(p.output)}`).join("\n\n");
  return [
    "You write GRIDVID scene-DSL. Below is a REAL ARC-AGI-2 puzzle and a human explanation of its rule.",
    "Your job: write ONE DSL scene that GENERATES A FAMILY of NEW puzzles teaching the SAME underlying rule —",
    "NOT a copy of these exact grids. Use 'random' / 'color rand' / 'rand' sizes so that reseeding the scene yields",
    "VARIED instances (different positions, colours, sizes, counts), while the hidden RULE stays identical on every example.",
    "",
    "REAL PUZZLE (digit grids; 0 = black background, 1-9 = colours):",
    pairs,
    "",
    "HUMAN RULE: " + seed.rule.replace(/\s+/g, " ").trim(),
    seed.perception ? "WHAT TO SEE FIRST: " + seed.perception.replace(/\s+/g, " ").trim().slice(0, 400) : "",
    "",
    "HARD RULES — make it SIMPLE and CLEAR:",
    "• Capture exactly this ONE rule (a clean instructive grid transformation). No extra mechanics.",
    "• STATIC: build the input, 'hold 1' (IN), 'cut', apply the transform, 'snap 1' (OUT). No 'run'/physics/'vary'.",
    "• Objects spread out with 'random' over a large box — never overlap or touch, never fixed 'at' for many objects.",
    "• Every colour in the OUTPUT must already appear in the INPUT (no invented colours).",
    "• Vary the non-rule features across examples (position, and colour/size unless they ARE the rule).",
    "",
    "GRAMMAR (use ONLY these forms):",
    grammar,
    "",
    "Output ONLY the scene text, no prose.",
  ].filter(Boolean).join("\n");
}

module.exports = { loadSeeds, buildSeededPrompt, gridToText, DESC_DIR };
