#!/usr/bin/env node
/* showcase.js — THE single showcase entry point (PAN-195 cleanup).
 * One parameterized dispatcher over the surviving renderers — every visual check goes through here.
 *
 *   node showcase.js corpus  <corpus.jsonl> [-o out/x.html] [--title "..."]   IN→OUT gallery of a jsonl corpus
 *   node showcase.js trace   <corpus.jsonl> [-o out/x.html]                   step-by-step thinking-grids (white selection)
 *   node showcase.js builder [-o out/x.html]                                  god-builder families + budgeted menus
 *   node showcase.js construct [args…]                                        Part-algebra creative gallery
 *
 * (cli.js `gallery <dir>` remains for GIF folders.) One-off galleries were deleted 2026-07-02 —
 * recover any from git history at tag/commit a49852e if a TODO item needs its code as a starting point.
 */
const MODES = {
  corpus: "./build_corpus_showcase.js",
  trace: "./build_trace_showcase.js",
  builder: "./build_builder_showcase.js",
  construct: "./build_construct_gallery.js",
  graph: "./build_graph_explorer.js",   // PAN-197: interactive family/admits explorer
};
const mode = process.argv[2];
if (!MODES[mode]) {
  console.log("usage: node showcase.js <corpus|trace|builder|construct> [args…]\n" +
    "  corpus <f.jsonl> [-o x.html] [--title t]  IN→OUT gallery\n" +
    "  trace  <f.jsonl> [-o x.html]              execution-trace thinking-grids\n" +
    "  builder [-o x.html]                       god-builder taxonomy + budgeted menus\n" +
    "  construct [args…]                         Part-algebra creative gallery");
  process.exit(mode ? 1 : 0);
}
// run the delegate as its own entry (their CLI blocks are `require.main === module`-guarded)
const path = require("path");
const r = require("child_process").spawnSync(process.execPath, [path.join(__dirname, MODES[mode]), ...process.argv.slice(3)], { stdio: "inherit" });
process.exit(r.status || 0);
