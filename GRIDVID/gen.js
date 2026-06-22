#!/usr/bin/env node
/* gen.js — backward-compatible shim. The full agent CLI is cli.js.
 *   node gen.js scenes/*.txt -o out --gif   ->   cli.js gen ...
 *   node gen.js --self-test                 ->   cli.js self-test
 */
const { main } = require("./cli.js");
const a = process.argv.slice(2);
main(a.includes("--self-test") ? ["self-test"] : ["gen", ...a]);
