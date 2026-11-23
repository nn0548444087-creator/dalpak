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
// A suggestion for the next move of a turn in progress: the first step of the best way to play the dice that are left.
export function bgHint(t, c) {
  const info = turnInfo(t, c); if (info.done || !info.moves.length) return null;
  const memo = new Map(), need = info.total - t.played.length;
  let best = null, bs = -Infinity;
  const walk = (bd, left, first, depth) => {
    if (depth === need) { const w = bgWinner(bd), v = w && w.winner === c ? 1e6 : bgEval(bd, c); if (v > bs) { bs = v; best = first; } return; }
    for (const d of new Set(left)) for (const m of singleMoves(bd, c, d)) {
      const nb = applyMove(bd, c, m), nl = removeOne(left, d);
      if (depth + 1 + maxDepth(nb, c, nl, memo) === need) walk(nb, nl, first || m, depth + 1);
    }
  };
  walk(t.board, info.left, null, 0);
  return best && info.moves.find(m => m.from === best.from && m.to === best.to && m.die === best.die) || info.moves[0];
}
export const roll = () => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];

/* ---------- Snake ----------
   A smooth snake on a grid. Every fifth fruit brings a red orb for five seconds: worth 7 in its first second,
   one less every second after. Six ways to play (modes), three speeds and a few colours. */
export const SNAKE_SKINS = {
  green: { name: 'ירוק', a: '#3DBE6E', b: '#1E7A45' },
  blue: { name: 'כחול', a: '#4C9BFF', b: '#1F4FA8' },
  purple: { name: 'סגול', a: '#B07CFF', b: '#5B2CB8' },
  orange: { name: 'כתום', a: '#FFB347', b: '#D9641E' },
  pink: { name: 'ורוד', a: '#FF7EB6', b: '#B83279' },
  rainbow: { name: 'קשת', a: null, b: null }
};
export const SNAKE_SPEEDS = { slow: { name: 'איטי', ms: 200 }, normal: { name: 'רגיל', ms: 145 }, fast: { name: 'מהיר', ms: 100 } };
export const SNAKE_MODES = {
  classic: { name: 'קלאסי', icon: '🐍', desc: 'הקירות פוסלים. כל 5 פירות מגיע עיגול אדום ששווה עד 7' },
  wrap: { name: 'בלי קירות', icon: '🌀', desc: 'יוצאים מצד אחד ונכנסים מהצד השני' },
  maze: { name: 'מבוך', icon: '🧱', desc: 'מכשולים על הלוח. כל 6 פירות עולים שלב ונוסף קיר' },
  time: { name: 'נגד השעון', icon: '⏱', desc: '60 שניות. כמה שיותר נקודות' },
  power: { name: 'פירות מיוחדים', icon: '✨', desc: 'האטה, מעבר דרך קירות, ניקוד כפול וקיצור' },
  daily: { name: 'האתגר היומי', icon: '📅', desc: 'אותו מבוך ואותם פירות לכולם. טבלה חדשה כל יום' }
};
export const BONUS_MS = 5000, BONUS_TOP = 7;
const POWERS = {
  slow: { icon: '🐢', color: '#5AC8FA', ms: 7000, name: 'האטה' },
  ghost: { icon: '👻', color: '#C7B8FF', ms: 6000, name: 'מעבר דרך הכול' },
  double: { icon: '✖2', color: '#FFD60A', ms: 8000, name: 'ניקוד כפול' },
  shrink: { icon: '✂', color: '#FF9F0A', ms: 0, name: 'קיצור' }
};
// A small random generator that gives the same numbers for the same seed (the daily challenge).
export function seeded(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createSnake(canvas, o) {
  const ctx = canvas.getContext('2d'), N = o.size || 17, C = o.colors;
  const mode = SNAKE_MODES[o.mode] ? o.mode : 'classic', daily = mode === 'daily';
  let skin = SNAKE_SKINS[o.skin] ? o.skin : 'green';
  const base = daily ? SNAKE_SPEEDS.normal.ms : (SNAKE_SPEEDS[o.speed] || SNAKE_SPEEDS.normal).ms;
  let rnd, snake, prev, dir, queue, food, bonus, power, effects, walls, score, eaten, level, over, running, paused;
  let raf = 0, lastT = 0, acc = 0, timeLeft = 0, parts = [], pops = [], now = 0, flash = 0;
  const key = (x, y) => x + ',' + y, wallSet = () => new Set(walls.map(w => key(w[0], w[1])));
  const occupied = () => { const s = wallSet(); snake.forEach(p => s.add(key(p[0], p[1]))); if (food) s.add(key(food[0], food[1])); if (bonus) s.add(key(bonus.x, bonus.y)); if (power) s.add(key(power.x, power.y)); return s; };
  function freeCell(avoidHead = 3) {
    const s = occupied(), h = snake[0], free = [];
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if (!s.has(key(x, y)) && Math.abs(x - h[0]) + Math.abs(y - h[1]) >= avoidHead) free.push([x, y]);
    return free.length ? free[Math.floor(rnd() * free.length)] : null;
  }
  // Every free cell must stay reachable, or a new wall is not placed.
  function connected(ws) {
    const block = new Set(ws.map(w => key(w[0], w[1]))), start = snake[0], seen = new Set([key(start[0], start[1])]), q = [start];
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (nx < 0 || ny < 0 || nx >= N || ny >= N || block.has(k) || seen.has(k)) continue; seen.add(k); q.push([nx, ny]); } }
    return seen.size === N * N - block.size;
  }
  function addWall() {
    for (let tries = 0; tries < 60; tries++) {
      const len = 2 + Math.floor(rnd() * 3), hz = rnd() < .5, x0 = 1 + Math.floor(rnd() * (N - 2 - (hz ? len : 0))), y0 = 1 + Math.floor(rnd() * (N - 2 - (hz ? 0 : len)));
      const bar = []; for (let k = 0; k < len; k++) bar.push(hz ? [x0 + k, y0] : [x0, y0 + k]);
      const occ = occupied(), h = snake[0];
      if (bar.some(([x, y]) => occ.has(key(x, y)) || (y === h[1] && Math.abs(x - h[0]) < 5) || Math.abs(x - h[0]) + Math.abs(y - h[1]) < 3)) continue;
      if (!connected([...walls, ...bar])) continue;
      walls.push(...bar); return true;
    }
    return false;
  }
  function reset() {
    rnd = daily ? seeded(o.seed || 1) : Math.random;
    const m = Math.floor(N / 2); snake = [[m, m], [m + 1, m], [m + 2, m]]; prev = snake.map(p => p.slice());
    dir = [-1, 0]; queue = []; food = null; bonus = null; power = null; effects = {}; walls = []; score = 0; eaten = 0; level = 1;
    over = false; running = false; paused = false; parts = []; pops = []; timeLeft = mode === 'time' ? 60000 : 0; acc = 0;
    if (mode === 'maze' || daily) for (let k = 0; k < (daily ? 5 : 3); k++) addWall();
    food = freeCell();
  }
  const fx = (n, cx, cy, col) => { for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, v = .02 + Math.random() * .05; parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, col }); } };
  const pop = (txt, x, y, col) => pops.push({ txt, x, y, life: 1, col });
  const stepMs = () => Math.max(base * .55, base - eaten * 2) * (effects.slow > now ? 1.6 : 1);
  const has = (arr, x, y) => arr.some(p => p[0] === x && p[1] === y);
  function tick() {
    if (queue.length) dir = queue.shift();
    let h = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
    const ghost = effects.ghost > now, wrap = mode === 'wrap' || ghost;
    if (wrap) h = [(h[0] + N) % N, (h[1] + N) % N];
    const out = h[0] < 0 || h[1] < 0 || h[0] >= N || h[1] >= N;
    const eats = food && h[0] === food[0] && h[1] === food[1];
    const body = eats ? snake : snake.slice(0, -1);
    if (out || (!ghost && (has(walls, h[0], h[1]) || has(body, h[0], h[1])))) return end();
    prev = snake.map(p => p.slice());
    snake.unshift(h);
    const mult = effects.double > now ? 2 : 1;
    if (eats) {
      eaten++; const g = 1 * mult; score += g; fx(10, h[0] + .5, h[1] + .5, C.food); pop('+' + g, h[0], h[1], '#fff');
      o.onScore && o.onScore(score, g, 'fruit');
      if (eaten % 5 === 0) { const c = freeCell(4); if (c) bonus = { x: c[0], y: c[1], t0: now }; }
      if (mode === 'power' && eaten % 3 === 0 && !power) { const c = freeCell(4), ks = Object.keys(POWERS); if (c) power = { x: c[0], y: c[1], t0: now, k: ks[Math.floor(rnd() * ks.length)] }; }
      if ((mode === 'maze' || daily) && eaten % 6 === 0) { level++; addWall(); flash = now; pop('שלב ' + level, N / 2 - 1, N / 2 - 1, '#FFD60A'); }
      food = freeCell();
    } else snake.pop();
    if (bonus && h[0] === bonus.x && h[1] === bonus.y) {
      const g = bonusValue() * mult; score += g; fx(22, h[0] + .5, h[1] + .5, '#FF3B30'); pop('+' + g, h[0], h[1], '#FF6B6B'); bonus = null;
      o.onScore && o.onScore(score, g, 'bonus');
    }
    if (power && h[0] === power.x && h[1] === power.y) {
      const P = POWERS[power.k]; fx(16, h[0] + .5, h[1] + .5, P.color); pop(P.name, h[0] - 1, h[1], P.color);
      if (power.k === 'shrink') { const cut = Math.min(3, snake.length - 3); if (cut > 0) snake.splice(-cut); prev = snake.map(p => p.slice()); }
      else effects[power.k] = now + P.ms;
      power = null; o.onScore && o.onScore(score, 0, 'power');
    }
  }
  // Worth 7 in the first second, then one less every second.
  const bonusValue = () => bonus ? Math.max(1, BONUS_TOP - Math.floor((now - bonus.t0) / 1000)) : 0;
  function end() { over = true; running = false; fx(30, snake[0][0] + .5, snake[0][1] + .5, '#FF453A'); o.onOver && o.onOver(score, { mode, level, eaten }); }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = lastT ? Math.min(100, t - lastT) : 16; lastT = t;
    if (running && !paused && !over) {
      now += dt; acc += dt;
      if (bonus && now - bonus.t0 >= BONUS_MS) { fx(8, bonus.x + .5, bonus.y + .5, '#FF3B30'); bonus = null; }
      if (power && now - power.t0 >= 7000) power = null;
      if (mode === 'time') { timeLeft -= dt; if (timeLeft <= 0) { timeLeft = 0; draw(1); return end(); } }
      let st = stepMs();
      while (acc >= st && running && !over) { acc -= st; tick(); st = stepMs(); }
    }
    parts.forEach(p => { p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.life -= dt / 600; }); parts = parts.filter(p => p.life > 0);
    pops.forEach(p => { p.y -= dt / 900; p.life -= dt / 900; }); pops = pops.filter(p => p.life > 0);
    draw(running && !over ? Math.min(1, acc / stepMs()) : 1);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  function skinColor(i, n) {
    const S = SNAKE_SKINS[skin], f = n > 1 ? i / (n - 1) : 0;
    if (!S.a) return `hsl(${(i * 22 + now / 12) % 360} 85% 58%)`;
    const pa = S.a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = S.b.match(/\w\w/g).map(h => parseInt(h, 16));
    return `rgb(${pa.map((v, k) => Math.round(lerp(v, pb[k], f))).join(',')})`;
  }
  function draw(t) {
    const W = canvas.width, c = W / N;
    // The board: soft checks and rounded corners.
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = C.grid; for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if ((x + y) % 2) ctx.fillRect(x * c, y * c, c, c);
    if (flash && now - flash < 600) { ctx.fillStyle = `rgba(255,214,10,${.25 * (1 - (now - flash) / 600)})`; ctx.fillRect(0, 0, W, W); }
    const rr = (x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fill(); };
    // Walls.
    walls.forEach(([x, y]) => { ctx.fillStyle = C.wall; rr(x * c + 1.5, y * c + 1.5, c - 3, c - 3, c * .22); ctx.fillStyle = 'rgba(255,255,255,.12)'; rr(x * c + 3, y * c + 3, c - 6, c * .3, c * .15); });
    const pulse = 1 + Math.sin(now / 180) * .06;
    // The fruit: an apple with a leaf.
    if (food) {
      const fx0 = food[0] * c + c / 2, fy0 = food[1] * c + c / 2, r = c * .36 * pulse;
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(fx0, fy0 + r * .9, r * .8, r * .25, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(fx0 - r * .35, fy0 - r * .35, r * .1, fx0, fy0, r); g.addColorStop(0, '#FFB199'); g.addColorStop(1, C.food);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx0, fy0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3DBE6E'; ctx.beginPath(); ctx.ellipse(fx0 + r * .3, fy0 - r * 1.0, r * .32, r * .16, -.6, 0, Math.PI * 2); ctx.fill();
    }
    // The red orb: glowing, with a ring that empties and its value right now.
    if (bonus) {
      const bx = bonus.x * c + c / 2, by = bonus.y * c + c / 2, left = 1 - (now - bonus.t0) / BONUS_MS, r = c * .44;
      ctx.save(); ctx.shadowColor = '#FF3B30'; ctx.shadowBlur = c * .8 * pulse;
      const g = ctx.createRadialGradient(bx - r * .3, by - r * .3, r * .1, bx, by, r); g.addColorStop(0, '#FF8A80'); g.addColorStop(1, '#D70015');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r * pulse, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = c * .08; ctx.beginPath(); ctx.arc(bx, by, r + c * .12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(c * .5)}px ${C.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(bonusValue(), bx, by + 1);
    }
    if (power) {
      const P = POWERS[power.k], px = power.x * c + c / 2, py = power.y * c + c / 2, blink = now - power.t0 > 5000 && Math.floor(now / 150) % 2;
      if (!blink) { ctx.save(); ctx.shadowColor = P.color; ctx.shadowBlur = c * .7; ctx.fillStyle = P.color; ctx.beginPath(); ctx.arc(px, py, c * .42 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.font = `700 ${Math.round(c * .48)}px ${C.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#222'; ctx.fillText(P.icon, px, py + 1); }
    }
    // The snake: one smooth body, sliding between cells.
    const n = snake.length, pts = [];
    for (let i = 0; i < n; i++) { const a = prev[Math.min(i, prev.length - 1)], b = snake[i]; const jump = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 1; pts.push(jump ? [b[0], b[1]] : [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]); }
    const ghost = effects.ghost > now;
    ctx.save(); if (ghost) ctx.globalAlpha = .55 + Math.sin(now / 90) * .15;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = c * .74;
    ctx.beginPath(); pts.forEach((p, i) => { const X = p[0] * c + c / 2, Y = p[1] * c + c / 2 + c * .08; if (i && Math.abs(p[0] - pts[i - 1][0]) + Math.abs(p[1] - pts[i - 1][1]) > 1.5) ctx.moveTo(X, Y); else i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
    for (let i = n - 1; i > 0; i--) {
      const p = pts[i], q = pts[i - 1]; if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1.5) continue;
      ctx.strokeStyle = skinColor(i, n); ctx.lineWidth = c * (.7 - .22 * i / n);
      ctx.beginPath(); ctx.moveTo(p[0] * c + c / 2, p[1] * c + c / 2); ctx.lineTo(q[0] * c + c / 2, q[1] * c + c / 2); ctx.stroke();
    }
    // A light stripe along the back.
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = c * .14;
    ctx.beginPath(); pts.forEach((p, i) => { const X = p[0] * c + c / 2 - c * .1, Y = p[1] * c + c / 2 - c * .1; if (i && Math.abs(p[0] - pts[i - 1][0]) + Math.abs(p[1] - pts[i - 1][1]) > 1.5) ctx.moveTo(X, Y); else i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
    // The head, with eyes that look where it goes and a tongue now and then.
    const hx = pts[0][0] * c + c / 2, hy = pts[0][1] * c + c / 2;
    ctx.fillStyle = skinColor(0, n); ctx.beginPath(); ctx.arc(hx, hy, c * .44, 0, Math.PI * 2); ctx.fill();
    if (!over && Math.floor(now / 700) % 4 === 0) { ctx.strokeStyle = '#E5484D'; ctx.lineWidth = c * .07; ctx.beginPath(); ctx.moveTo(hx + dir[0] * c * .4, hy + dir[1] * c * .4); ctx.lineTo(hx + dir[0] * c * .7, hy + dir[1] * c * .7); ctx.stroke(); }
    const side = [-dir[1], dir[0]];
    for (const sgn of [-1, 1]) {
      const ex = hx + dir[0] * c * .14 + side[0] * sgn * c * .2, ey = hy + dir[1] * c * .14 + side[1] * sgn * c * .2;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, c * .13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); over ? (ctx.font = `700 ${Math.round(c * .22)}px sans-serif`, ctx.textAlign = 'center', ctx.textBaseline = 'middle', ctx.fillText('×', ex, ey)) : (ctx.arc(ex + dir[0] * c * .05, ey + dir[1] * c * .05, c * .065, 0, Math.PI * 2), ctx.fill());
    }
    ctx.restore();
    // Sparks and the points that float up.
    parts.forEach(p => { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x * c, p.y * c, c * .09, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    pops.forEach(p => { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 3; ctx.font = `800 ${Math.round(c * .6)}px ${C.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(p.txt, (p.x + .5) * c, (p.y + .5) * c); ctx.fillText(p.txt, (p.x + .5) * c, (p.y + .5) * c); });
    ctx.globalAlpha = 1;
    // Time left (against the clock) and the effects running now.
    if (mode === 'time') { const f = timeLeft / 60000; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, W, c * .22); ctx.fillStyle = f < .2 ? '#FF453A' : '#FFD60A'; ctx.fillRect(0, 0, W * f, c * .22); }
    const act = Object.entries(effects).filter(([, until]) => until > now);
    act.forEach(([k, until], i) => { const P = POWERS[k]; ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(6 + i * c * 1.9, W - c * .9, c * 1.75, c * .7, c * .3); ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(c * .36)}px ${C.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${P.icon} ${Math.ceil((until - now) / 1000)}`, 6 + i * c * 1.9 + c * .87, W - c * .55); });
    if (over || paused || !running) {
      ctx.fillStyle = C.veil; ctx.fillRect(0, 0, W, W);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = `800 ${Math.round(W / 13)}px ${C.font}`;
      ctx.fillText(over ? (mode === 'time' && timeLeft <= 0 ? 'נגמר הזמן!' : 'המשחק נגמר') : paused ? 'הפסקה' : SNAKE_MODES[mode].name, W / 2, W / 2 - W / 28);
      ctx.font = `500 ${Math.round(W / 26)}px ${C.font}`;
      ctx.fillText(over ? `ניקוד: ${score} · לחצו לשחק שוב` : paused ? 'לחצו להמשך' : 'לחצו או החליקו כדי להתחיל', W / 2, W / 2 + W / 18);
    }
  }
  const start = () => { if (over) reset(); running = true; paused = false; };
  const pause = () => { if (running && !over) paused = true; };
  const turn = d => {
    if (over) return; if (!running || paused) start();
    const last = queue.length ? queue[queue.length - 1] : dir;
    if ((d[0] === -last[0] && d[1] === -last[1]) || (d[0] === last[0] && d[1] === last[1])) return;
    if (queue.length < 3) queue.push(d);
  };
  reset(); raf = requestAnimationFrame(loop);
  return {
    start, pause, turn, reset: () => { reset(); },
    toggle: () => (running && !paused && !over ? pause() : start()),
    running: () => running && !paused && !over, isOver: () => over, score: () => score, mode: () => mode,
    setSkin: k => { if (SNAKE_SKINS[k]) skin = k; },
    // For tests: a look at the state.
    peek: () => ({ snake: snake.map(p => p.slice()), dir: dir.slice(), food, bonus: bonus && { ...bonus, value: bonusValue() }, power, walls: walls.slice(), level, now, timeLeft, effects: { ...effects } }),
    advance: ms => { const st = ms; now += st; acc += st; },
    destroy: () => cancelAnimationFrame(raf)
  };
}

/* ---------- Sudoku ----------
   Every puzzle has exactly one solution. Fewer given numbers = harder. */
export const SUDOKU_LEVELS = { easy: { name: 'קל', clues: 40 }, medium: { name: 'בינוני', clues: 33 }, hard: { name: 'קשה', clues: 28 }, expert: { name: 'מומחה', clues: 24 } };
export const SUDOKU_COINS = { easy: 5, medium: 10, hard: 18, expert: 30, daily: 15 };
export const SD_PEERS = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9), c = i % 9, br = r - r % 3, bc = c - c % 3, s = new Set();
  for (let k = 0; k < 9; k++) { s.add(r * 9 + k); s.add(k * 9 + c); s.add((br + Math.floor(k / 3)) * 9 + bc + k % 3); }
  s.delete(i); return [...s];
});
// Counts solutions up to limit (2 is enough to know a puzzle is not unique).
function sdSolve(g, limit, rnd) {
  let count = 0; const a = g.slice();
  const rec = () => {
    let best = -1, opts = null;
    for (let i = 0; i < 81; i++) if (!a[i]) {
      const used = new Set(SD_PEERS[i].map(p => a[p])), o = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(v => !used.has(v));
      if (!o.length) return false;
      if (!opts || o.length < opts.length) { best = i; opts = o; if (o.length === 1) break; }
    }
    if (best < 0) { count++; if (count === 1) g.solved = a.slice(); return count >= limit; }
    if (rnd) for (let k = opts.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [opts[k], opts[j]] = [opts[j], opts[k]]; }
    for (const v of opts) { a[best] = v; if (rec()) return true; }
    a[best] = 0; return false;
  };
  rec(); return count;
}
export function makeSudoku(level = 'easy', seed) {
  const rnd = seed ? seeded(seed) : Math.random, clues = (SUDOKU_LEVELS[level] || SUDOKU_LEVELS.easy).clues;
  const empty = Array(81).fill(0); sdSolve(empty, 1, rnd); const solution = empty.solved;
  const puzzle = solution.slice(), order = [...Array(81).keys()];
  for (let k = 80; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
  let left = 81;
  for (const i of order) {
    if (left <= clues) break;
    const keep = puzzle[i]; puzzle[i] = 0;
    if (sdSolve(puzzle, 2) !== 1) puzzle[i] = keep; else left--;
  }
  return { puzzle, solution };
}
export const sudokuReward = (level, hints = 0, errors = 0) => Math.max(0, (SUDOKU_COINS[level] || 0) - 3 * hints - 2 * errors);

/* ---------- Chess ----------
   A position is kept as FEN text. Squares are 0..63: 0 = a8, 7 = h8, 56 = a1, 63 = h1.
   White pieces are upper case (PNBRQK), black lower case. */
export const CHESS_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export function fenParse(fen) {
  const [pl, t, c, ep, h, n] = fen.split(' '), b = [];
  for (const ch of pl.replace(/\//g, '')) { if (/\d/.test(ch)) for (let k = 0; k < +ch; k++) b.push('.'); else b.push(ch); }
  return { b, t, c: c === '-' ? '' : c, ep: ep === '-' ? -1 : sqIdx(ep), h: +h || 0, n: +n || 1 };
}
export function fenOf(s) {
  let out = '';
  for (let r = 0; r < 8; r++) { let e = 0; for (let f = 0; f < 8; f++) { const p = s.b[r * 8 + f]; if (p === '.') e++; else { if (e) out += e; e = 0; out += p; } } if (e) out += e; if (r < 7) out += '/'; }
  return `${out} ${s.t} ${s.c || '-'} ${s.ep < 0 ? '-' : sqName(s.ep)} ${s.h} ${s.n}`;
}
export const sqName = i => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));
const sqIdx = n => (8 - +n[1]) * 8 + 'abcdefgh'.indexOf(n[0]);
const isW = p => p !== '.' && p === p.toUpperCase();
const colorOf = p => p === '.' ? null : isW(p) ? 'w' : 'b';
const N8 = [[-1, -2], [1, -2], [-2, -1], [2, -1], [-2, 1], [2, 1], [-1, 2], [1, 2]];
const K8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const DIAG = [[-1, -1], [1, -1], [-1, 1], [1, 1]], ORTH = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const at = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : -1;
// Is square i attacked by side `by`?
function attacked(b, i, by) {
  const f = i % 8, r = Math.floor(i / 8), up = by === 'w' ? 1 : -1; // a white pawn attacks from the row below (higher index)
  const P = by === 'w' ? 'P' : 'p', N = by === 'w' ? 'N' : 'n', B = by === 'w' ? 'B' : 'b', R = by === 'w' ? 'R' : 'r', Q = by === 'w' ? 'Q' : 'q', K = by === 'w' ? 'K' : 'k';
  for (const df of [-1, 1]) { const j = at(f + df, r + up); if (j >= 0 && b[j] === P) return true; }
  for (const [df, dr] of N8) { const j = at(f + df, r + dr); if (j >= 0 && b[j] === N) return true; }
  for (const [df, dr] of K8) { const j = at(f + df, r + dr); if (j >= 0 && b[j] === K) return true; }
  for (const [dirs, A] of [[DIAG, B], [ORTH, R]]) for (const [df, dr] of dirs) {
    let ff = f + df, rr = r + dr;
    while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) { const p = b[rr * 8 + ff]; if (p !== '.') { if (p === A || p === Q) return true; break; } ff += df; rr += dr; }
  }
  return false;
}
const kingAt = (b, c) => b.indexOf(c === 'w' ? 'K' : 'k');
export const inCheck = (s, c = s.t) => attacked(s.b, kingAt(s.b, c), c === 'w' ? 'b' : 'w');
function pseudo(s) {
  const out = [], b = s.b, c = s.t, opp = c === 'w' ? 'b' : 'w';
  for (let i = 0; i < 64; i++) {
    const p = b[i]; if (colorOf(p) !== c) continue;
    const f = i % 8, r = Math.floor(i / 8), t = p.toLowerCase();
    const add = (j, extra = {}) => out.push({ f: i, t: j, ...extra });
    if (t === 'p') {
      const dir = c === 'w' ? -1 : 1, start = c === 'w' ? 6 : 1, last = c === 'w' ? 0 : 7, one = at(f, r + dir);
      const push = (j, extra) => { if (Math.floor(j / 8) === last) for (const q of 'qrbn') add(j, { ...extra, pr: c === 'w' ? q.toUpperCase() : q }); else add(j, extra); };
      if (one >= 0 && b[one] === '.') { push(one); const two = at(f, r + 2 * dir); if (r === start && b[two] === '.') add(two, { dbl: 1 }); }
      for (const df of [-1, 1]) { const j = at(f + df, r + dir); if (j < 0) continue; if (colorOf(b[j]) === opp) push(j, { x: 1 }); else if (j === s.ep) add(j, { ep: 1, x: 1 }); }
    } else if (t === 'n' || t === 'k') {
      for (const [df, dr] of t === 'n' ? N8 : K8) { const j = at(f + df, r + dr); if (j >= 0 && colorOf(b[j]) !== c) add(j, b[j] !== '.' ? { x: 1 } : {}); }
      if (t === 'k') {
        const home = c === 'w' ? 60 : 4, rights = c === 'w' ? s.c.replace(/[a-z]/g, '') : s.c.replace(/[A-Z]/g, '').toUpperCase();
        if (i === home && !attacked(b, i, opp)) {
          if (rights.includes('K') && b[i + 1] === '.' && b[i + 2] === '.' && b[i + 3] === (c === 'w' ? 'R' : 'r') && !attacked(b, i + 1, opp) && !attacked(b, i + 2, opp)) add(i + 2, { castle: 'k' });
          if (rights.includes('Q') && b[i - 1] === '.' && b[i - 2] === '.' && b[i - 3] === '.' && b[i - 4] === (c === 'w' ? 'R' : 'r') && !attacked(b, i - 1, opp) && !attacked(b, i - 2, opp)) add(i - 2, { castle: 'q' });
        }
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : [...DIAG, ...ORTH];
      for (const [df, dr] of dirs) { let ff = f + df, rr = r + dr; while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) { const j = rr * 8 + ff; if (b[j] === '.') add(j); else { if (colorOf(b[j]) === opp) add(j, { x: 1 }); break; } ff += df; rr += dr; } }
    }
  }
  return out;
}
export function chessApply(s, m) {
  const b = s.b.slice(), p = b[m.f], c = s.t, opp = c === 'w' ? 'b' : 'w';
  let cr = s.c;
  b[m.t] = m.pr || p; b[m.f] = '.';
  if (m.ep) b[m.t + (c === 'w' ? 8 : -8)] = '.';
  if (m.castle === 'k') { b[m.t - 1] = b[m.t + 1]; b[m.t + 1] = '.'; }
  if (m.castle === 'q') { b[m.t + 1] = b[m.t - 2]; b[m.t - 2] = '.'; }
  if (p === 'K') cr = cr.replace(/[KQ]/g, ''); if (p === 'k') cr = cr.replace(/[kq]/g, '');
  for (const [sq, ch] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.f === sq || m.t === sq) cr = cr.replace(ch, '');
  const pawn = p.toLowerCase() === 'p';
  return { b, t: opp, c: cr, ep: m.dbl ? (m.f + m.t) / 2 : -1, h: pawn || s.b[m.t] !== '.' || m.ep ? 0 : s.h + 1, n: s.n + (c === 'b' ? 1 : 0) };
}
export const chessMoves = s => pseudo(s).filter(m => !inCheck(chessApply(s, m), s.t));
const posKey = s => s.b.join('') + s.t + s.c + s.ep;
function lowMaterial(b) {
  const left = b.filter(p => p !== '.' && p.toLowerCase() !== 'k');
  return !left.length || (left.length === 1 && /[nb]/i.test(left[0]));
}
// The result after the side to move has no move, or by the draw rules. hist = position keys so far (for repetition).
export function chessStatus(s, hist = []) {
  const ms = chessMoves(s);
  if (!ms.length) return inCheck(s) ? { over: true, winner: s.t === 'w' ? 'b' : 'w', why: 'mate' } : { over: true, winner: null, why: 'stalemate' };
  if (s.h >= 100) return { over: true, winner: null, why: 'fifty' };
  if (lowMaterial(s.b)) return { over: true, winner: null, why: 'material' };
  const k = posKey(s); if (hist.filter(x => x === k).length >= 2) return { over: true, winner: null, why: 'repeat' };
  return { over: false, check: inCheck(s) };
}
export const chessKey = posKey;
// Short algebraic notation for the move list (e4, Nf3, exd5, O-O, e8=Q+).
export function chessSan(s, m) {
  const p = s.b[m.f], t = p.toLowerCase(), n = chessApply(s, m), st = chessMoves(n).length ? (inCheck(n) ? '+' : '') : (inCheck(n) ? '#' : '');
  if (m.castle) return (m.castle === 'k' ? 'O-O' : 'O-O-O') + st;
  let san = '';
  if (t === 'p') san = (m.x ? sqName(m.f)[0] + 'x' : '') + sqName(m.t) + (m.pr ? '=' + m.pr.toUpperCase() : '');
  else {
    const same = chessMoves(s).filter(o => o.t === m.t && o.f !== m.f && s.b[o.f] === p);
    let dis = ''; if (same.length) dis = same.some(o => o.f % 8 === m.f % 8) ? (same.some(o => Math.floor(o.f / 8) === Math.floor(m.f / 8)) ? sqName(m.f) : sqName(m.f)[1]) : sqName(m.f)[0];
    san = t.toUpperCase() + dis + (m.x ? 'x' : '') + sqName(m.t);
  }
  return san + st;
}
// The computer: alpha-beta search with piece-square tables. Level 1..3 = how far it looks.
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20]
};
function chessEval(s) { // from white's side
  let v = 0;
  for (let i = 0; i < 64; i++) { const p = s.b[i]; if (p === '.') continue; const t = p.toLowerCase(); if (isW(p)) v += VAL[t] + PST[t][i]; else v -= VAL[t] + PST[t][(7 - Math.floor(i / 8)) * 8 + i % 8]; }
  return v;
}
const order = (s, ms) => ms.map(m => ({ m, k: (m.x ? 10 * VAL[(s.b[m.t] === '.' ? 'p' : s.b[m.t].toLowerCase())] - VAL[s.b[m.f].toLowerCase()] / 10 : 0) + (m.pr ? 800 : 0) })).sort((a, b) => b.k - a.k).map(x => x.m);
function quiesce(s, a, b, d) {
  const stand = (s.t === 'w' ? 1 : -1) * chessEval(s);
  if (stand >= b) return b; if (a < stand) a = stand; if (d <= 0) return a;
  for (const m of order(s, chessMoves(s).filter(m => m.x || m.pr))) { const v = -quiesce(chessApply(s, m), -b, -a, d - 1); if (v >= b) return b; if (v > a) a = v; }
  return a;
}
function negamax(s, depth, a, b, ply) {
  const ms = chessMoves(s);
  if (!ms.length) return inCheck(s) ? -100000 + ply : 0;
  if (s.h >= 100) return 0;
  if (depth === 0) return quiesce(s, a, b, 4);
  for (const m of order(s, ms)) { const v = -negamax(chessApply(s, m), depth - 1, -b, -a, ply + 1); if (v >= b) return b; if (v > a) a = v; }
  return a;
}
export function chessBest(s, level = 2, rnd = Math.random) {
  const ms = order(s, chessMoves(s)); if (!ms.length) return null;
  const depth = level <= 1 ? 1 : level === 2 ? 2 : 3;
  let scored = ms.map(m => ({ m, v: -negamax(chessApply(s, m), depth - 1, -Infinity, Infinity, 1) }));
  scored.sort((x, y) => y.v - x.v);
  // The easy level sometimes picks a weaker move; the others choose among moves that are about as good.
  const slack = level <= 1 ? 120 : level === 2 ? 25 : 8;
  const good = scored.filter(x => x.v >= scored[0].v - slack);
  return good[Math.floor(rnd() * good.length)].m;
}

/* ---------- Checkers (דמקה) ----------
   8x8, pieces on the dark squares. Men move one step diagonally forward and capture forward and backward.
   Capturing is a must, and a capture goes on as long as it can. A man that reaches the far row becomes a king,
   which moves and captures any distance along a diagonal. The board is a 64-char string: . w b W B (W/B = kings).
   White starts at the bottom (rows 5..7) and moves up. */
export const DAMA_START = (() => { let s = ''; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s += (r + c) % 2 ? (r < 3 ? 'b' : r > 4 ? 'w' : '.') : '.'; return s; })();
const dOwner = p => p === '.' ? null : p.toLowerCase();
const dKing = p => p === 'W' || p === 'B';
function damaCaptures(b, i, c, taken, out, path, kinged) {
  const p = kinged ? c.toUpperCase() : b[i], r = Math.floor(i / 8), f = i % 8, opp = c === 'w' ? 'b' : 'w';
  let found = false;
  for (const [df, dr] of DIAG) {
    if (dKing(p)) {
      let ff = f + df, rr = r + dr;
      while (at(ff, rr) >= 0 && b[at(ff, rr)] === '.') { ff += df; rr += dr; }
      const e = at(ff, rr); if (e < 0 || dOwner(b[e]) !== opp || taken.includes(e)) continue;
      let lf = ff + df, lr = rr + dr;
      while (at(lf, lr) >= 0 && b[at(lf, lr)] === '.') {
        const land = at(lf, lr); found = true;
        const nb = b.slice(0, i) + '.' + b.slice(i + 1), nb2 = nb.slice(0, land) + p + nb.slice(land + 1);
        if (!damaCaptures(nb2, land, c, [...taken, e], out, [...path, land], true)) out.push({ path: [...path, land], caps: [...taken, e] });
        lf += df; lr += dr;
      }
    } else {
      const e = at(f + df, r + dr), land = at(f + 2 * df, r + 2 * dr);
      if (e < 0 || land < 0 || dOwner(b[e]) !== opp || taken.includes(e) || b[land] !== '.') continue;
      found = true;
      const promote = (c === 'w' && Math.floor(land / 8) === 0) || (c === 'b' && Math.floor(land / 8) === 7);
      const nb = b.slice(0, i) + '.' + b.slice(i + 1), nb2 = nb.slice(0, land) + (promote ? c.toUpperCase() : c) + nb.slice(land + 1);
      if (!damaCaptures(nb2, land, c, [...taken, e], out, [...path, land], promote)) out.push({ path: [...path, land], caps: [...taken, e] });
    }
  }
  return found;
}
export function damaMoves(b, c) {
  const caps = [], steps = [], fwd = c === 'w' ? -1 : 1;
  for (let i = 0; i < 64; i++) {
    if (dOwner(b[i]) !== c) continue;
    damaCaptures(b, i, c, [], caps, [i], false);
    if (caps.length) continue;
    const f = i % 8, r = Math.floor(i / 8);
    for (const [df, dr] of DIAG) {
      if (dKing(b[i])) { let ff = f + df, rr = r + dr; while (at(ff, rr) >= 0 && b[at(ff, rr)] === '.') { steps.push({ path: [i, at(ff, rr)], caps: [] }); ff += df; rr += dr; } }
      else if (dr === fwd) { const j = at(f + df, r + dr); if (j >= 0 && b[j] === '.') steps.push({ path: [i, j], caps: [] }); }
    }
  }
  return caps.length ? caps : steps;
}
export function damaApply(b, c, m) {
  const a = b.split(''), from = m.path[0], to = m.path[m.path.length - 1];
  let p = a[from]; a[from] = '.';
  m.caps.forEach(x => { a[x] = '.'; });
  if (m.path.some(x => (c === 'w' && Math.floor(x / 8) === 0) || (c === 'b' && Math.floor(x / 8) === 7))) p = c.toUpperCase();
  a[to] = p; return a.join('');
}
// quiet = moves in a row with kings only and no capture (30 = a draw).
export function damaStatus(b, c, quiet = 0) {
  if (!damaMoves(b, c).length) return { over: true, winner: c === 'w' ? 'b' : 'w' };
  if (quiet >= 30) return { over: true, winner: null };
  return { over: false };
}
function damaEval(b) { // from white's side
  let v = 0;
  for (let i = 0; i < 64; i++) { const p = b[i]; if (p === '.') continue; const r = Math.floor(i / 8), f = i % 8, center = (f > 1 && f < 6 ? 4 : 0);
    if (p === 'w') v += 100 + (7 - r) * 6 + center; else if (p === 'b') v -= 100 + r * 6 + center; else if (p === 'W') v += 300; else v -= 300; }
  return v;
}
function damaNeg(b, c, depth, a, bt) {
  const ms = damaMoves(b, c); if (!ms.length) return -100000 - depth;
  if (depth === 0) return (c === 'w' ? 1 : -1) * damaEval(b);
  ms.sort((x, y) => y.caps.length - x.caps.length);
  for (const m of ms) { const v = -damaNeg(damaApply(b, c, m), c === 'w' ? 'b' : 'w', depth - 1, -bt, -a); if (v >= bt) return bt; if (v > a) a = v; }
  return a;
}
export function damaBest(b, c, level = 2, rnd = Math.random) {
  const ms = damaMoves(b, c); if (!ms.length) return null;
  const depth = level <= 1 ? 2 : level === 2 ? 4 : 6;
  const scored = ms.map(m => ({ m, v: -damaNeg(damaApply(b, c, m), c === 'w' ? 'b' : 'w', depth - 1, -Infinity, Infinity) })).sort((x, y) => y.v - x.v);
  const slack = level <= 1 ? 90 : level === 2 ? 15 : 3, good = scored.filter(x => x.v >= scored[0].v - slack);
  return good[Math.floor(rnd() * good.length)].m;
}
