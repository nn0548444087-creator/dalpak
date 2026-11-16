// Games for the leisure tab: backgammon (rules + a computer player) and Snake.
// Nothing here touches the app or the server; the screens in app.js draw and save.

/* ---------- backgammon ----------
   The board is 24 points, index 0..23. A positive count is white's checkers, a negative count black's.
   White moves from 23 down to 0 and bears off below 0; its home is 0..5.
   Black moves from 0 up to 23 and bears off above 23; its home is 18..23. */
export const BG_START = () => {
  const pts = Array(24).fill(0);
  pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;
  pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
  return { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } };
};
const sgn = c => c === 'w' ? 1 : -1;
export const other = c => c === 'w' ? 'b' : 'w';
const mine = (n, c) => c === 'w' ? n > 0 : n < 0;
const cnt = (n, c) => mine(n, c) ? Math.abs(n) : 0;
const cloneB = b => ({ pts: b.pts.slice(), bar: { ...b.bar }, off: { ...b.off } });
export const bgKey = b => b.pts.join(',') + '|' + b.bar.w + ',' + b.bar.b + '|' + b.off.w + ',' + b.off.b;
// Where a checker lands, counted in the mover's direction (below 0 or above 23 = borne off).
const dest = (from, c, d) => from === 'bar' ? (c === 'w' ? 24 - d : d - 1) : from - sgn(c) * d;
const allHome = (b, c) => {
  if (b.bar[c]) return false;
  for (let i = 0; i < 24; i++) if (mine(b.pts[i], c) && (c === 'w' ? i > 5 : i < 18)) return false;
  return true;
};
// The legal moves of one checker with one die.
export function singleMoves(b, c, d) {
  const out = [];
  const open = i => !(b.pts[i] && !mine(b.pts[i], c) && Math.abs(b.pts[i]) >= 2);
  if (b.bar[c]) {
    const t = dest('bar', c, d);
    if (open(t)) out.push({ from: 'bar', to: t, die: d, hit: !!b.pts[t] && !mine(b.pts[t], c) });
    return out;
  }
  const home = allHome(b, c);
  for (let i = 0; i < 24; i++) {
    if (!mine(b.pts[i], c)) continue;
    const t = dest(i, c, d);
    if (t >= 0 && t <= 23) { if (open(t)) out.push({ from: i, to: t, die: d, hit: !!b.pts[t] && !mine(b.pts[t], c) }); continue; }
    if (!home) continue;
    // Bearing off: exact, or with a bigger die from the furthest point.
    const exact = c === 'w' ? t === -1 : t === 24;
    let furthest = true;
    if (!exact) for (let j = 0; j < 24; j++) if (mine(b.pts[j], c) && (c === 'w' ? j > i : j < i)) { furthest = false; break; }
    if (exact || furthest) out.push({ from: i, to: 'off', die: d, hit: false });
  }
  return out;
}
export function applyMove(b, c, m) {
  const n = cloneB(b), s = sgn(c);
  if (m.from === 'bar') n.bar[c]--; else n.pts[m.from] -= s;
  if (m.to === 'off') n.off[c]++;
  else {
    if (n.pts[m.to] && !mine(n.pts[m.to], c)) { n.pts[m.to] = 0; n.bar[other(c)]++; }
    n.pts[m.to] += s;
  }
  return n;
}
export const diceList = d => d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]];
const removeOne = (arr, v) => { const i = arr.indexOf(v); const r = arr.slice(); r.splice(i, 1); return r; };
// How many dice can still be played from here (the rules make you play as many as you can).
function maxDepth(b, c, dice, memo) {
  if (!dice.length) return 0;
  const k = bgKey(b) + '#' + dice.join('');
  if (memo.has(k)) return memo.get(k);
  let best = 0;
  for (const d of new Set(dice)) {
    for (const m of singleMoves(b, c, d)) {
      best = Math.max(best, 1 + maxDepth(applyMove(b, c, m), c, removeOne(dice, d), memo));
      if (best === dice.length) break;
    }
    if (best === dice.length) break;
  }
  memo.set(k, best); return best;
}
// A turn in progress: what may be played next, given what was played already.
// turn = { start: board at the start, dice: [a, b], played: [moves], board: board now }
export function turnInfo(t, c) {
  const memo = new Map(), all = diceList(t.dice);
  const total = maxDepth(t.start, c, all, memo);
  const left = t.played.reduce((r, m) => removeOne(r, m.die), all);
  const need = total - t.played.length;
  if (need <= 0) return { total, left, moves: [], done: true };
  let moves = [];
  for (const d of new Set(left)) for (const m of singleMoves(t.board, c, d)) if (1 + maxDepth(applyMove(t.board, c, m), c, removeOne(left, d), memo) === need) moves.push(m);
  // Only one die can be played: it must be the bigger one when that is possible.
  if (total === 1 && all.length === 2 && all[0] !== all[1]) { const hi = Math.max(...all), big = moves.filter(m => m.die === hi); if (big.length) moves = big; }
  return { total, left, moves, done: false };
}
// Every different position a whole turn can end in (for the computer player).
export function turnEnds(b, c, dice) {
  const all = diceList(dice), memo = new Map(), total = maxDepth(b, c, all, memo), out = new Map();
  const walk = (bd, left, moves) => {
    if (moves.length === total) { const k = bgKey(bd); if (!out.has(k)) out.set(k, { board: bd, moves }); return; }
    for (const d of new Set(left)) for (const m of singleMoves(bd, c, d)) {
      const nb = applyMove(bd, c, m), nl = removeOne(left, d);
      if (moves.length + 1 + maxDepth(nb, c, nl, memo) === total) walk(nb, nl, [...moves, m]);
    }
  };
  walk(b, all, []);
  let ends = [...out.values()];
  if (total === 1 && all[0] !== all[1]) { const hi = Math.max(...all), big = ends.filter(e => e.moves[0].die === hi); if (big.length) ends = big; }
  return ends.length ? ends : [{ board: b, moves: [] }];
}
export const pips = (b, c) => { let p = b.bar[c] * 25; for (let i = 0; i < 24; i++) if (mine(b.pts[i], c)) p += Math.abs(b.pts[i]) * (c === 'w' ? i + 1 : 24 - i); return p; };
// Who won and how big: 1 normal, 2 gammon (the loser bore off nothing), 3 backgammon (and still has a checker in the winner's home or on the bar).
export function bgWinner(b) {
  for (const c of ['w', 'b']) if (b.off[c] === 15) {
    const o = other(c); let mult = 1;
    if (!b.off[o]) { mult = 2; let back = b.bar[o] > 0; for (let i = 0; i < 24; i++) if (mine(b.pts[i], o) && (c === 'w' ? i <= 5 : i >= 18)) back = true; if (back) mult = 3; }
    return { winner: c, mult };
  }
  return null;
}
// Seen from white's side: black's position is turned around so one scoring function serves both.
const flip = b => ({ pts: b.pts.map((_, i) => -b.pts[23 - i]), bar: { w: b.bar.b, b: b.bar.w }, off: { w: b.off.b, b: b.off.w } });
// Chance (out of 36) that a checker this many points away gets hit with one roll.
const SHOTS = [0, 11, 12, 14, 15, 15, 17, 6, 6, 5, 3, 2, 3, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1];
function evalWhite(b) {
  const P = b.pts;
  let s = (pips(b, 'b') - pips(b, 'w')) * 1.0 + b.off.w * 2;
  // Still in contact while white's last checker hasn't passed black's last checker.
  let lastW = -1, firstB = 24;
  for (let i = 0; i < 24; i++) { if (P[i] > 0) lastW = i; if (P[i] < 0 && firstB === 24) firstB = i; }
  const contact = b.bar.b > 0 || b.bar.w > 0 || lastW > firstB;
  if (!contact) return s * 1.4 + b.off.w * 3;
  let run = 0, homeMade = 0;
  for (let i = 0; i < 24; i++) {
    if (P[i] >= 2) {
      s += i <= 5 ? 1.6 : i <= 8 ? 1.1 : 0.5; if (i <= 5) homeMade++;
      run++; if (run >= 3) s += run * 0.6;
    } else run = 0;
    if (P[i] >= 2 && i >= 18) s += 0.8; // an anchor in black's home
    if (P[i] === 1) {
      // A lone white checker: black checkers behind it (lower index) and on the bar can hit it.
      let hit = 0;
      for (let j = 0; j < i; j++) if (P[j] < 0) hit += SHOTS[i - j] || 0;
      if (b.bar.b) hit += SHOTS[i + 1] || 0;
      if (hit) s -= Math.min(36, hit) / 36 * (24 - i + 4) * 0.9;
    }
    if (P[i] > 3) s -= (P[i] - 3) * 0.25; // too many on one point
  }
  s += b.bar.b * (2 + homeMade * 1.2);
  s -= b.bar.w * 3;
  return s;
}
export const bgEval = (b, c) => c === 'w' ? evalWhite(b) : evalWhite(flip(b));
// The computer's turn: the ending position that scores best for it.
export function bgBest(b, c, dice) {
  let best = null, bs = -Infinity;
  for (const e of turnEnds(b, c, dice)) {
    const w = bgWinner(e.board), v = w && w.winner === c ? 1e6 : bgEval(e.board, c);
    if (v > bs) { bs = v; best = e; }
  }
  return best;
}
export const roll = () => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];

/* ---------- Snake ----------
   A grid the snake moves on; it grows with every fruit and speeds up. Swipes, arrows or the keyboard turn it. */
export function createSnake(canvas, { colors, onScore, onOver, size = 18 }) {
  const ctx = canvas.getContext('2d');
  let snake, dir, nextDirs, food, score, step, timer = null, over = false, paused = false, lastT = 0, acc = 0, raf = 0;
  const N = size;
  const reset = () => {
    const m = Math.floor(N / 2); snake = [[m, m], [m + 1, m], [m + 2, m]]; dir = [-1, 0]; nextDirs = []; score = 0; step = 150; over = false; paused = false; placeFood(); draw();
  };
  const placeFood = () => {
    const free = []; for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if (!snake.some(s => s[0] === x && s[1] === y)) free.push([x, y]);
    food = free[Math.floor(Math.random() * free.length)];
  };
  const turn = d => {
    const last = nextDirs.length ? nextDirs[nextDirs.length - 1] : dir;
    if (d[0] === -last[0] && d[1] === -last[1]) return; if (d[0] === last[0] && d[1] === last[1]) return;
    if (nextDirs.length < 3) nextDirs.push(d);
  };
  const tick = () => {
    if (nextDirs.length) dir = nextDirs.shift();
    const h = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
    const eats = h[0] === food[0] && h[1] === food[1];
    const body = eats ? snake : snake.slice(0, -1);
    if (h[0] < 0 || h[1] < 0 || h[0] >= N || h[1] >= N || body.some(s => s[0] === h[0] && s[1] === h[1])) { over = true; stop(); draw(); onOver && onOver(score); return; }
    snake.unshift(h); if (eats) { score++; step = Math.max(60, 150 - score * 3); onScore && onScore(score); placeFood(); } else snake.pop();
    draw();
  };
  const loop = t => {
    if (!timer) return;
    if (!lastT) lastT = t; acc += t - lastT; lastT = t;
    if (acc > 600) acc = step; // the phone was busy: don't jump ahead
    while (acc >= step && timer && !over) { acc -= step; tick(); }
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (over) reset(); if (timer) return; timer = 1; paused = false; lastT = 0; acc = 0; raf = requestAnimationFrame(loop); };
  const stop = () => { timer = null; cancelAnimationFrame(raf); };
  const pause = () => { if (!timer) return; stop(); paused = true; draw(); };
  function draw() {
    const W = canvas.width, c = W / N, r = c * 0.28;
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = colors.grid;
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if ((x + y) % 2) ctx.fillRect(x * c, y * c, c, c);
    const rr = (x, y, w, h, rad) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h); ctx.fill(); };
    ctx.fillStyle = colors.food; ctx.beginPath(); ctx.arc(food[0] * c + c / 2, food[1] * c + c / 2, c * 0.36, 0, Math.PI * 2); ctx.fill();
    snake.forEach((s, i) => { ctx.fillStyle = i ? colors.body : colors.head; rr(s[0] * c + 1, s[1] * c + 1, c - 2, c - 2, r); });
    // Eyes on the head, looking where it goes.
    const [hx, hy] = snake[0], ex = dir[1] ? [0.3, 0.7] : [0.5 + dir[0] * 0.2, 0.5 + dir[0] * 0.2], ey = dir[0] ? [0.3, 0.7] : [0.5 + dir[1] * 0.2, 0.5 + dir[1] * 0.2];
    ctx.fillStyle = colors.eye; for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.arc((hx + ex[k]) * c, (hy + ey[k]) * c, c * 0.09, 0, Math.PI * 2); ctx.fill(); }
    if (over || paused || !timer) {
      ctx.fillStyle = colors.veil; ctx.fillRect(0, 0, W, W);
      ctx.fillStyle = colors.text; ctx.textAlign = 'center'; ctx.font = `700 ${Math.round(W / 14)}px ${colors.font}`;
      ctx.fillText(over ? 'המשחק נגמר' : paused ? 'הפסקה' : 'מוכנים?', W / 2, W / 2 - W / 30);
      ctx.font = `500 ${Math.round(W / 24)}px ${colors.font}`;
      ctx.fillText(over ? `ניקוד: ${score} · לחצו לשחק שוב` : 'לחצו כדי להתחיל', W / 2, W / 2 + W / 18);
    }
  }
  reset();
  return {
    start, pause, turn, draw, reset,
    toggle: () => (timer ? pause() : start()),
    running: () => !!timer, isOver: () => over, score: () => score,
    destroy: () => stop()
  };
}
