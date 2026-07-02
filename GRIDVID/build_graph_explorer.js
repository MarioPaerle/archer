#!/usr/bin/env node
/* build_graph_explorer.js — PAN-197: the family/admits graph, INSPECTABLE (Mario, explicit).
 * Interactive HTML: nodes = families (functions inside), edges = admits; click a family → its functions with
 * paired difficulties/band/roles/blurb; click an edge → why the composition is admitted; "sample a menu" per
 * difficulty target (from a precomputed pool — same buildMenu, honest determinism, no browser port of the rng).
 * Single source of truth: builder.js FAMILY_DB + enrichRegistry over scenes/library/. Regenerate on every
 * taxonomy change (HTML rule):   node showcase.js graph   →  out/graph_explorer.html
 */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), B = require("./builder.js");

function buildRegistry(dir) {
  return fs.readdirSync(dir).filter(x => x.endsWith(".txt")).map(file => {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    let concepts = [], difficulty = null;
    try { const w = E.runScene(E.withSeedText(text, 1), { noSim: true }); concepts = w.meta.concepts || []; difficulty = w.meta.difficulty; } catch (e) { }
    let dynamic = false;
    try { const p = E.buildTask(text, { examples: 1, seed0: 1 }); dynamic = [p.in, p.out, ...p.examples.flatMap(e => [e.in, e.out])].some(v => v.length > 1); } catch (e) { }
    return { name: file.replace(/\.txt$/, ""), file, category: concepts[0] || file.replace(/\.txt$/, ""), concepts, difficulty, rule: (text.match(/^\s*rule\s+(.+)$/m) || [, null])[1], safeAug: ((text.match(/^\s*vary\s+(.+)$/m) || [, ""])[1]).trim().split(/\s+/).filter(Boolean), wholeGrid: /\b(grid_rotate|grid_flip|grid_map|sort_rows|solve|grid_complete|unfold|crop)\b/.test(text), verbs: [], dynamic };
  });
}

// fixed layout: static domains in a 4-column grid, dynamic strip at the bottom (visually separated)
const POS = {
  "object/select": [150, 110], "object/dispatch": [150, 250], "object/copy": [150, 390],
  "number/count": [430, 110], "topology/enclosure": [430, 250], "relation/analogy": [430, 390],
  "figure/boolean": [710, 110], "figure/symmetry": [710, 250], "figure/completion": [710, 390],
  "grid/lattice": [980, 110], "grid/global": [980, 250], "program/trace": [980, 390],
  "dynamic/path": [430, 560], "dynamic/physics": [710, 560],
};

function build(outFile) {
  const dir = path.join(__dirname, "scenes", "library");
  const registry = buildRegistry(dir);
  const enriched = B.enrichRegistry(registry);
  const byFam = {}; for (const f of enriched) (byFam[f.family] || (byFam[f.family] = [])).push(f);
  // data payload — single source of truth serialised once
  const families = Object.fromEntries(Object.entries(B.FAMILY_DB).map(([fam, db]) => [fam, {
    ...db, pos: POS[fam],
    functions: (byFam[fam] || []).sort((a, b) => a.difficulty - b.difficulty).map(f => ({ name: f.name, difficulty: f.difficulty, rule: f.rule, wholeGrid: f.wholeGrid, dynamic: f.dynamic, ownDifficulty: registry.find(r => r.name === f.name).difficulty != null })),
  }]));
  const edges = [];
  for (const [from, db] of Object.entries(B.FAMILY_DB)) for (const to of db.admits) {
    const tdb = B.FAMILY_DB[to], role = tdb.roles.includes("finisher") ? "finisher" : "modifier";
    edges.push({
      from, to, role,
      why: `As the BASE, «${from}» may offer «${to}» as ${role.toUpperCase()}` +
        (role === "finisher" ? " — one whole-grid op, always applied LAST (≤1 whole-grid per menu)." :
          ` — it ${to === from ? "self-composes (the only allowed family repeat)" : "keys/conditions the core mechanic (WHICH objects, WHAT drives it), never a second rule"}.`) +
        ` ${to}: ${tdb.blurb}.`,
    });
  }
  // precomputed menu pool (honest: same buildMenu + engine rng, no browser port)
  const menus = [];
  for (const target of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
    for (let seed = 1; seed <= 8; seed++)
      for (const k of [1, 2, 3]) {
        const m = B.buildMenu(E.makeRng(seed * 1013 + k * 71 + Math.round(target * 100)), registry, { k, static: true, target });
        menus.push({ target, k, seed, difficulty: m.difficulty, baseFamily: m.baseFamily, budget: m.budget, functions: m.functions.map(f => ({ name: f.name, family: f.family, role: f.role, difficulty: f.difficulty })), hint: m.composeHint });
      }
  for (const target of [0.5, 0.6, 0.7]) for (let seed = 1; seed <= 4; seed++) for (const k of [1, 2]) {
    const m = B.buildMenu(E.makeRng(seed * 2017 + k * 13 + Math.round(target * 100)), registry, { k, target });
    if (B.FAMILY_DB[m.baseFamily].dynamic) menus.push({ target, k, seed, dynamic: true, difficulty: m.difficulty, baseFamily: m.baseFamily, budget: m.budget, functions: m.functions.map(f => ({ name: f.name, family: f.family, role: f.role, difficulty: f.difficulty })), hint: m.composeHint });
  }
  const DATA = JSON.stringify({ families, edges, menus });

  const html = `<!doctype html><meta charset=utf-8><title>GRIDVID family/admits graph — explorer</title><style>
  body{margin:0;background:#0b0b0f;color:#ececf1;font:13px ui-monospace,Menlo,monospace}
  .wrap{display:flex;height:100vh}
  .left{flex:1;min-width:0;display:flex;flex-direction:column}
  header{padding:14px 20px 6px}h1{margin:0;color:#67e8f9;font-size:17px}.sub{color:#889;font-size:11px;margin-top:3px}
  svg{flex:1;width:100%}
  .panel{width:400px;border-left:1px solid #23232d;padding:16px;overflow-y:auto;background:#101016}
  .node{cursor:pointer}.node rect{fill:#16161d;stroke:#34343f;stroke-width:1.4;rx:9}
  .node.sel rect{stroke:#67e8f9;stroke-width:2.2}.node.dim{opacity:.25}
  .node text.t{fill:#a7f3d0;font-weight:700;font-size:12.5px}.node text.d{fill:#778;font-size:10px}
  .edge{fill:none;stroke-width:1.6;cursor:pointer;opacity:.55}.edge.modifier{stroke:#8b5cf6}.edge.finisher{stroke:#f59e0b}
  .edge.hl{opacity:1;stroke-width:2.6}.edge.dim{opacity:.08}
  .chip{font-size:9px;padding:1px 6px;border-radius:99px;text-transform:uppercase;margin-right:4px}
  .chip.base{background:#134e4a;color:#5eead4}.chip.modifier{background:#3b2f63;color:#c4b5fd}.chip.finisher{background:#57330f;color:#fdba74}.chip.dyn{background:#4a1030;color:#f9a8d4}
  .panel h2{color:#f0abfc;font-size:14px;margin:2px 0 8px}.panel .blurb{color:#aab;line-height:1.5;margin-bottom:10px}
  .band{position:relative;height:9px;background:#1d1d26;border-radius:99px;margin:6px 0 12px}.bandfill{position:absolute;height:100%;background:#0e7490;border-radius:99px}
  .fn{background:#17171f;border:1px solid #2a2a34;border-radius:7px;padding:7px 9px;margin:6px 0}
  .fn b{color:#dde}.fn .dd{color:#67e8f9;float:right}.fn .rl{color:#99a;font-size:11px;margin-top:3px;line-height:1.4}
  .fn .inh{color:#f59e0b;font-size:9.5px}
  .why{background:#151b15;border:1px solid #234023;border-radius:7px;padding:9px;color:#bfe3bf;line-height:1.5;margin:8px 0}
  .ctrl{margin:10px 0}.ctrl label{color:#889;font-size:11px}
  input[type=range]{width:100%}
  button{background:#134e4a;color:#5eead4;border:1px solid #1f6f68;border-radius:7px;padding:6px 14px;font:inherit;cursor:pointer}
  button:hover{background:#1a6b65}
  .menu{background:#17171f;border:1px solid #2a2a34;border-radius:8px;padding:10px;margin:8px 0}
  .menu .hd{display:flex;justify-content:space-between;color:#fde047;font-size:12px;margin-bottom:6px}
  .bar{display:flex;height:10px;border-radius:99px;overflow:hidden;background:#20202a;margin:6px 0}
  .seg.base{background:#14b8a6}.seg.modifier{background:#8b5cf6}.seg.finisher{background:#f59e0b}
  .mrow{padding:2px 0;color:#ccd}.mrow code{color:#fbbf24}
  .hint{color:#7dd3fc;font-size:11px;margin-top:5px;line-height:1.45}
  .divider text{fill:#556;font-size:10.5px;letter-spacing:1.5px}
  .legend{color:#889;font-size:10.5px;padding:0 20px 10px}.legend .sw{display:inline-block;width:18px;height:3px;vertical-align:middle;margin:0 4px 0 12px}
  </style>
  <div class=wrap>
    <div class=left>
      <header><h1>▦ family / admits graph — click a node or an edge</h1>
      <div class=sub>nodes = families (functions inside) · edge A→B = "base A admits B" · static ↑ / video ↓ never mix</div></header>
      <svg id=svg viewBox="0 0 1160 650"></svg>
      <div class=legend>edges: <span class=sw style="background:#8b5cf6"></span>admits as MODIFIER <span class=sw style="background:#f59e0b"></span>admits as FINISHER</div>
    </div>
    <div class=panel id=panel></div>
  </div>
  <script>
  const DATA=${DATA};
  const svg=document.getElementById("svg"), panel=document.getElementById("panel");
  const NS="http://www.w3.org/2000/svg";
  const el=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e};
  // edges under nodes
  const edgeEls=[];
  DATA.edges.forEach((ed,i)=>{
    const [x1,y1]=DATA.families[ed.from].pos,[x2,y2]=DATA.families[ed.to].pos;
    let d;
    if(ed.from===ed.to){ d=\`M \${x1+55} \${y1-20} C \${x1+130} \${y1-70}, \${x1+130} \${y1+30}, \${x1+55} \${y1+10}\`; }
    else { const mx=(x1+x2)/2,my=(y1+y2)/2, dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy),ox=-dy/len*28,oy=dx/len*28;
      d=\`M \${x1} \${y1} Q \${mx+ox} \${my+oy} \${x2} \${y2}\`; }
    const p=el("path",{d,class:"edge "+ed.role,"marker-end":"url(#arr_"+ed.role+")"});
    p.addEventListener("click",e=>{e.stopPropagation();showEdge(i)});
    svg.appendChild(p);edgeEls.push(p);
  });
  // arrow markers
  const defs=el("defs",{});
  for(const [id,col] of [["arr_modifier","#8b5cf6"],["arr_finisher","#f59e0b"]]){
    const m=el("marker",{id,markerWidth:8,markerHeight:8,refX:7,refY:3,orient:"auto"});
    m.appendChild(el("path",{d:"M0 0 L7 3 L0 6 z",fill:col}));defs.appendChild(m);
  }
  svg.appendChild(defs);
  // static/dynamic divider
  const dv=el("g",{class:"divider"});
  dv.appendChild(el("line",{x1:40,y1:480,x2:1120,y2:480,stroke:"#2a2a34","stroke-dasharray":"6 5"}));
  const dt=el("text",{x:46,y:472});dt.textContent="STATIC (grid→grid) ↑    ·    VIDEO / DYNAMIC ↓ (never mixed in one menu)";dv.appendChild(dt);
  svg.appendChild(dv);
  // nodes
  const nodeEls={};
  for(const [fam,f] of Object.entries(DATA.families)){
    const [x,y]=f.pos, g=el("g",{class:"node",transform:\`translate(\${x-72},\${y-30})\`});
    g.appendChild(el("rect",{width:144,height:60,rx:9}));
    const t=el("text",{x:72,y:24,"text-anchor":"middle",class:"t"});t.textContent=fam;g.appendChild(t);
    const d=el("text",{x:72,y:44,"text-anchor":"middle",class:"d"});
    d.textContent=f.functions.length+" fn · band "+f.band[0]+"–"+f.band[1]+(f.dynamic?" · video":"");g.appendChild(d);
    g.addEventListener("click",()=>showFam(fam));
    svg.appendChild(g);nodeEls[fam]=g;
  }
  function clearHl(){for(const g of Object.values(nodeEls))g.classList.remove("sel","dim");edgeEls.forEach(p=>p.classList.remove("hl","dim"));}
  function showFam(fam){
    clearHl();const f=DATA.families[fam];
    nodeEls[fam].classList.add("sel");
    const linked=new Set([fam]);
    DATA.edges.forEach((ed,i)=>{ if(ed.from===fam){edgeEls[i].classList.add("hl");linked.add(ed.to);} else if(ed.to===fam){linked.add(ed.from);} else edgeEls[i].classList.add("dim"); });
    for(const [k,g] of Object.entries(nodeEls)) if(!linked.has(k)) g.classList.add("dim");
    panel.innerHTML=\`<h2>\${fam}</h2>
      <div>\${f.roles.map(r=>'<span class="chip '+r+'">'+r+'</span>').join("")}\${f.dynamic?'<span class="chip dyn">video</span>':""}</div>
      <p class=blurb>\${f.blurb}</p>
      <div class=band><div class=bandfill style="left:\${f.band[0]*100}%;width:\${(f.band[1]-f.band[0])*100}%"></div></div>
      <div style="color:#889;font-size:11px">admits → \${f.admits.length?f.admits.join(" · "):"<i>nothing (terminal)</i>"}</div>
      <h2 style="margin-top:14px">functions (\${f.functions.length})</h2>
      \${f.functions.map(fn=>\`<div class=fn><span class=dd>d\${fn.difficulty}\${fn.ownDifficulty?"":" <span class=inh>(inherited)</span>"}</span><b>\${fn.name}</b>\${fn.wholeGrid?' <span class="chip finisher">whole-grid</span>':""}<div class=rl>\${fn.rule||""}</div></div>\`).join("")}\`;
  }
  function showEdge(i){
    clearHl();const ed=DATA.edges[i];
    edgeEls[i].classList.add("hl");nodeEls[ed.from].classList.add("sel");nodeEls[ed.to].classList.add("sel");
    for(const [k,g] of Object.entries(nodeEls)) if(k!==ed.from&&k!==ed.to) g.classList.add("dim");
    edgeEls.forEach((p,j)=>{if(j!==i)p.classList.add("dim")});
    panel.innerHTML=\`<h2>\${ed.from} → \${ed.to}</h2>
      <div><span class="chip \${ed.role}">\${ed.role}</span></div>
      <div class=why>\${ed.why}</div>
      <div style="color:#889;font-size:11px">Composition is BY CONSTRUCTION: only edges drawn in this graph can ever appear together in one menu.</div>\`;
  }
  // sampler
  function sampler(){
    panel.innerHTML=\`<h2>sample a menu</h2>
      <div class=ctrl><label>difficulty target: <b id=tv>0.7</b></label><input type=range id=tgt min=0.4 max=0.9 step=0.1 value=0.7></div>
      <div class=ctrl><label>k (functions): </label><select id=kk><option>1</option><option>2</option><option selected>3</option></select>
      <label style="margin-left:14px"><input type=checkbox id=dyn> video tier</label></div>
      <button id=go>sample</button><div id=out></div>\`;
    document.getElementById("tgt").oninput=e=>document.getElementById("tv").textContent=e.target.value;
    let cursor={};
    document.getElementById("go").onclick=()=>{
      const t=+document.getElementById("tgt").value,k=+document.getElementById("kk").value,dyn=document.getElementById("dyn").checked;
      const pool=DATA.menus.filter(m=>Math.abs(m.target-t)<0.001&&(dyn?m.dynamic:!m.dynamic)&&(dyn||m.k===k));
      if(!pool.length){document.getElementById("out").innerHTML="<p style='color:#f87171'>no precomputed menu for this combo — regenerate the explorer with more targets</p>";return}
      const key=t+"_"+k+"_"+dyn;cursor[key]=((cursor[key]??-1)+1)%pool.length;
      const m=pool[cursor[key]];
      document.getElementById("out").innerHTML=\`<div class=menu>
        <div class=hd><span>target \${m.target} → composed <b>d\${m.difficulty}</b></span><span>base \${m.baseFamily}</span></div>
        <div class=bar>\${m.budget.map(p=>{const w=Math.round(100*(p.adds!=null?p.adds:p.d)/Math.max(0.3,m.difficulty));return '<div class="seg '+p.role+'" style="width:'+Math.max(6,w)+'%" title="'+p.name+'"></div>'}).join("")}</div>
        \${m.functions.map(f=>'<div class=mrow><span class="chip '+f.role+'">'+f.role+'</span><b>'+f.name+'</b> <code>'+f.family+'</code> d'+f.difficulty+'</div>').join("")}
        <div class=hint>\${m.hint}</div></div>
        <div style="color:#667;font-size:10px">seed \${m.seed} — precomputed by the REAL buildMenu (click sample again to cycle)</div>\`;
      showFamGraphOnly(m.baseFamily,m.functions.map(f=>f.family));
    };
  }
  function showFamGraphOnly(base,fams){
    clearHl();nodeEls[base].classList.add("sel");
    const set=new Set(fams);
    for(const [kk,g] of Object.entries(nodeEls)) if(!set.has(kk)) g.classList.add("dim");
    DATA.edges.forEach((ed,i)=>{ if(ed.from===base&&set.has(ed.to)) edgeEls[i].classList.add("hl"); else edgeEls[i].classList.add("dim"); });
  }
  // sampler button in header
  const hb=document.createElement("button");hb.textContent="⚄ sample a menu";hb.style.cssText="position:fixed;top:12px;right:416px";
  hb.onclick=sampler;document.body.appendChild(hb);
  showFam("object/select");
  </script>`;
  fs.writeFileSync(outFile, html);
  console.log("wrote " + outFile + "  (" + Object.keys(families).length + " families, " + edges.length + " admits edges, " + menus.length + " precomputed menus)");
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  build(flag("-o", "out/graph_explorer.html"));
}
module.exports = { build };
