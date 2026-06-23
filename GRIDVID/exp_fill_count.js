#!/usr/bin/env node
/* exp_fill_count.js — TEST of "mode 2": can a small LLM FILL the human-convention variables correctly?
 * The generator owns correctness; the LLM only picks a value per variable (low complexity). We sample K times
 * and measure how often it picks the HUMAN convention + render its modal choice vs the human one.
 *   node exp_fill_count.js --endpoint http://host:8000 --model qwen --k 12        (or --stub)
 */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js"), C = require("./gen_count.js");

const f = { k: 12, model: "qwen" };
const A = process.argv.slice(2); for (let i = 0; i < A.length; i++) { const a = A[i]; if (a === "--endpoint") f.endpoint = A[++i]; else if (a === "--model") f.model = A[++i]; else if (a === "--k") f.k = +A[++i]; else if (a === "--stub") f.stub = true; }

const PROMPT = [
  "You decide HOW TO DISPLAY A COUNT in a small ARC-style pixel grid — the way a HUMAN would draw it: simple, legible, conventional.",
  "A scene has several coloured shapes. The output should show the tally/tallies of how many there are.",
  "Pick exactly ONE value for each variable (choose what a person would naturally do):",
  "  count_what : total | per_color | per_kind     (count everything, or one tally per colour, or per shape-kind)",
  "  orient     : h | v                            (tally drawn horizontally or vertically)",
  "  spacing    : flush | spaced                   (pips touching, or separated by a gap)",
  "  place      : corner | center | rows           (in a corner, centred, or each tally on its own row)",
  "  mark       : match | fixed                    (each pip coloured to match what it counts, or one fixed marker colour)",
  "Output ONLY a JSON object with these 5 keys, nothing else.",
].join("\n");

async function callModel(prompt) {
  if (f.stub) return JSON.stringify(C.HUMAN);   // stub: a human would answer this
  const url = f.endpoint.replace(/\/$/, "") + (f.endpoint.includes("/chat/completions") ? "" : "/v1/chat/completions");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: f.model, temperature: 0.8, max_tokens: 200, messages: [{ role: "user", content: prompt }] }) });
  const j = await res.json(); return (j.choices && j.choices[0] && (j.choices[0].message ? j.choices[0].message.content : j.choices[0].text)) || "";
}
function extractJSON(s) { const m = String(s).match(/\{[\s\S]*?\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch (e) { return null; } }

(async () => {
  if (!f.stub && !f.endpoint) { console.error("need --endpoint or --stub"); process.exit(1); }
  const dist = {}; for (const k in C.SCHEMA) dist[k] = {};
  const valid = []; let parsed = 0, bad = 0;
  for (let i = 0; i < f.k; i++) {
    let reply; try { reply = await callModel(PROMPT); } catch (e) { bad++; continue; }
    const a = extractJSON(reply);
    if (!a || !C.validAssignment(a)) { bad++; continue; }
    parsed++; valid.push(a); for (const k in C.SCHEMA) dist[k][a[k]] = (dist[k][a[k]] || 0) + 1;
  }
  // modal choice per variable + humanness
  const modal = {}; for (const k in C.SCHEMA) modal[k] = Object.entries(dist[k]).sort((x, y) => y[1] - x[1])[0]?.[0] || C.SCHEMA[k][0];
  const humanHits = Object.keys(C.SCHEMA).filter(k => modal[k] === C.HUMAN[k]).length;
  console.log(`exp_fill_count: ${parsed}/${f.k} valid JSON (${bad} bad)`);
  console.log("per-variable distribution of the LLM's choices:");
  for (const k in C.SCHEMA) console.log("  " + k.padEnd(11) + JSON.stringify(dist[k]) + "   modal=" + modal[k] + (modal[k] === C.HUMAN[k] ? "  ✓human" : "  (human=" + C.HUMAN[k] + ")"));
  console.log(`LLM modal assignment matches HUMAN on ${humanHits}/5 variables.`);
  // gallery: LLM-modal vs HUMAN vs a couple of sampled LLM answers
  const rng = E.makeRng(7); const cards = [];
  const add = (a, label) => { try { const t = C.buildCountTask(a, rng, 3); t.meta.label = label; cards.push(t); } catch (e) { } };
  add(modal, "LLM modal choice"); add(C.HUMAN, "HUMAN reference");
  valid.slice(0, 3).forEach((a, i) => add(a, "LLM sample " + (i + 1)));
  fs.mkdirSync("out", { recursive: true });
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cardHtml = t => { let gif = ""; try { const m = E.taskToMontage(t, { fps: 2 }); gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 10, delayMs: 500 })).toString("base64"); } catch (e) { }
    return `<figure class=card><img src="${gif}"><figcaption><div class=lb>${esc(t.meta.label)}</div><div class=as>${esc(JSON.stringify(t.meta.assignment))}</div><div class=rl>${esc(t.meta.rule)}</div></figcaption></figure>`; };
  const html = `<!doctype html><meta charset=utf-8><title>mode-2: LLM fills the display convention</title><style>body{margin:0;background:#0b0b0d;color:#ededed;font:13px ui-monospace,Menlo,monospace;padding:24px}h1{color:#ff5fae;font-size:18px}.lead{color:#8a8a93;max-width:920px;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:14px}.card{background:#15151a;border:1px solid #2a2a31;border-radius:10px;padding:12px}img{image-rendering:pixelated;width:100%;border:1px solid #2a2a31;border-radius:6px;background:#000}figcaption{display:flex;flex-direction:column;gap:5px;margin-top:8px}.lb{color:#7fd4ff;font-weight:700}.as{color:#c9a0ff;font-size:10.5px}.rl{color:#cfcfd6;font-size:11px}</style>
<h1>Mode 2 — can the LLM fill the human display convention?</h1><p class=lead>The generator owns correctness; the small LLM only picks 5 variable values (low complexity). Modal LLM choice matches the HUMAN convention on <b>${humanHits}/5</b> variables. Below: the LLM's modal choice, the HUMAN reference, and sampled LLM answers — each rendered correctly by the generator.</p><div class=grid>${cards.map(cardHtml).join("")}</div>`;
  fs.writeFileSync("out/exp_fill_count.html", html);
  console.log("gallery → out/exp_fill_count.html");
})();
