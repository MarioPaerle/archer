/* maze.js — program-first maze generation (multiple algorithms) + BFS solver, with a clean colour scheme.
 * Multiple generators so a model abstracts PATHFINDING rather than overfitting one maze texture.
 * Colours: wall=grey(5) · open=bg(0) · START=green(3) · GOAL=red(2) · path=blue(1). */
const E = require("./engine.js");
const ALGOS = ["backtracker", "prim", "binary"];

function genMaze(rng, H, W, algo) {
  if (H % 2 === 0) H--; if (W % 2 === 0) W--;           // odd dims: cells on odd coords, walls between
  const WALL = 1, grid = Array.from({ length: H }, () => new Array(W).fill(WALL)), open = (r, c) => { grid[r][c] = 0; };
  const cells = []; for (let r = 1; r < H; r += 2) for (let c = 1; c < W; c += 2) cells.push([r, c]);
  if (algo === "binary") {                              // binary-tree: each cell carves North or West (distinctive diagonal bias)
    for (const [r, c] of cells) { open(r, c); const opts = []; if (r > 1) opts.push([-2, 0]); if (c > 1) opts.push([0, -2]); if (opts.length) { const [dr, dc] = opts[rng.int(0, opts.length - 1)]; open(r + dr / 2, c + dc / 2); } }
  } else if (algo === "prim") {                         // randomized Prim's: grows from a seed via random frontier walls
    const inM = new Set(), s = cells[rng.int(0, cells.length - 1)], front = [];
    const addF = (r, c) => { for (const [dr, dc] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const nr = r + dr, nc = c + dc; if (nr > 0 && nr < H - 1 && nc > 0 && nc < W - 1 && !inM.has(nr + "," + nc)) front.push([nr, nc, r, c]); } };
    open(s[0], s[1]); inM.add(s.join(",")); addF(s[0], s[1]);
    while (front.length) { const [r, c, pr, pc] = front.splice(rng.int(0, front.length - 1), 1)[0]; if (inM.has(r + "," + c)) continue; open(r, c); open((r + pr) / 2, (c + pc) / 2); inM.add(r + "," + c); addF(r, c); }
  } else {                                              // recursive backtracker (DFS) — long winding corridors
    const carve = (r, c) => { open(r, c); const d = [[0, 2], [0, -2], [2, 0], [-2, 0]]; for (let i = d.length - 1; i > 0; i--) { const j = rng.int(0, i);[d[i], d[j]] = [d[j], d[i]]; }
      for (const [dr, dc] of d) { const nr = r + dr, nc = c + dc; if (nr > 0 && nr < H - 1 && nc > 0 && nc < W - 1 && grid[nr][nc] === WALL) { open(r + dr / 2, c + dc / 2); carve(nr, nc); } } };
    carve(1, 1);
  }
  const start = [1, 1], end = [H - 2, W - 2]; open(start[0], start[1]); open(end[0], end[1]);
  const key = (r, c) => r + "," + c, q = [start], prev = { [key(1, 1)]: null };   // BFS shortest path
  while (q.length) { const [r, c] = q.shift(); if (r === end[0] && c === end[1]) break; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < H && nc >= 0 && nc < W && grid[nr][nc] === 0 && !(key(nr, nc) in prev)) { prev[key(nr, nc)] = [r, c]; q.push([nr, nc]); } } }
  let path = [], cur = end; while (cur) { path.push(cur); cur = prev[key(cur[0], cur[1])]; } path.reverse();
  return { grid, H, W, start, end, path, algo, WALL };
}

// render the maze to an int-grid. pathLen = how many path cells to draw (for animation); Infinity = full solution.
function renderMaze(m, pathLen) {
  const g = m.grid.map(row => row.map(x => x === m.WALL ? 5 : 0));
  const n = Math.min(pathLen == null ? 0 : pathLen, m.path.length);
  for (let i = 0; i < n; i++) { const [r, c] = m.path[i]; g[r][c] = 1; }   // path = blue
  g[m.start[0]][m.start[1]] = 3; g[m.end[0]][m.end[1]] = 2;                 // START green, GOAL red (clear start vs finish)
  return g;
}

module.exports = { genMaze, renderMaze, ALGOS };
