#!/usr/bin/env node
"use strict";

/* Build deterministic JSON + HTML output for the first super suggester showcase. */

const fs = require("fs");
const path = require("path");
const S = require("./super_suggester.js");

const OUT = path.join(__dirname, "out");
const JSON_OUT = path.join(OUT, "super_suggester_showcase.json");
const HTML_OUT = path.join(OUT, "super_suggester_showcase.html");

function main() {
  const payload = S.suggestTasks({
    seed: 424242,
    count: 10,
    mode: "all",
    difficulty: [3, 7],
  });
  payload.compatibility_db = S.getCompatibilityDb();

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2) + "\n");
  fs.writeFileSync(HTML_OUT, S.renderHtml(payload));

  console.log("wrote " + path.relative(process.cwd(), JSON_OUT));
  console.log("wrote " + path.relative(process.cwd(), HTML_OUT));
}

if (require.main === module) main();

module.exports = { main, JSON_OUT, HTML_OUT };
