/**
 * Caminho das pessoas (trabalhadores, soldados, robôs): A* na grade de 1 m, 8 direções sem
 * cortar quina, custo inteiro (10/14) e desempate fixo, então é determinístico. Muralha e
 * prédio bloqueiam; portão (do posto ou do jogador), entulho e núcleo deixam passar.
 * Depois o caminho é suavizado por linha de visada (linha 4-conectada, sem buraco).
 */
import { STRUCT, WALL, cellAt, cellCenter } from './swarm.ts';
import type { Swarm } from './swarm.ts';
import type { Vec, World } from './types.ts';

const MAX_EXPAND = 60000;

let stamp = new Int32Array(0);
let gScore = new Int32Array(0);
let came = new Int32Array(0);
let closed = new Int32Array(0);
let heapF = new Int32Array(0);
let heapH = new Int32Array(0);
let heapV = new Int32Array(0);
let cur = 0;

export function humanPassable(sw: Swarm, c: number): boolean {
  const t = sw.terrain[c]!;
  return t !== WALL && t !== STRUCT;
}

function ensure(n: number): void {
  if (stamp.length >= n) return;
  stamp = new Int32Array(n);
  gScore = new Int32Array(n);
  came = new Int32Array(n);
  closed = new Int32Array(n);
  heapF = new Int32Array(n * 4);
  heapH = new Int32Array(n * 4);
  heapV = new Int32Array(n * 4);
}

/** Linha de visada entre centros de célula, pela linha 4-conectada. */
function sight(sw: Swarm, a: number, b: number): boolean {
  let x = a % sw.size;
  let z = (a / sw.size) | 0;
  const x1 = b % sw.size;
  const z1 = (b / sw.size) | 0;
  const dx = Math.abs(x1 - x);
  const dz = Math.abs(z1 - z);
  const sx = x < x1 ? 1 : -1;
  const sz = z < z1 ? 1 : -1;
  let err = dx - dz;
  let guard = 0;
  while ((x !== x1 || z !== z1) && guard++ < 4000) {
    const e2 = 2 * err;
    if (e2 > -dz) {
      err -= dz;
      x += sx;
      if (!humanPassable(sw, z * sw.size + x)) return false;
    }
    if (e2 < dx) {
      err += dx;
      z += sz;
      if (!humanPassable(sw, z * sw.size + x)) return false;
    }
  }
  return true;
}

/** Célula passável mais perto (anéis crescentes), para alvo dentro de muralha ou prédio. */
function nearestPassable(sw: Swarm, c: number): number {
  if (humanPassable(sw, c)) return c;
  const ci = c % sw.size;
  const cj = (c / sw.size) | 0;
  for (let r = 1; r < 8; r++)
    for (let oz = -r; oz <= r; oz++)
      for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
        const i = ci + ox;
        const j = cj + oz;
        if (i < 0 || j < 0 || i >= sw.size || j >= sw.size) continue;
        const n = j * sw.size + i;
        if (humanPassable(sw, n)) return n;
      }
  return c;
}

/** Caminho de (fx, fz) até (tx, tz) como lista de pontos (sem o ponto de partida). */
export function findPath(w: World, fx: number, fz: number, tx: number, tz: number): Vec[] {
  const sw = w.swarm;
  const s0 = cellAt(sw, fx, fz);
  let goal = cellAt(sw, tx, tz);
  if (s0 < 0 || goal < 0) return [{ x: tx, z: tz }];
  const goalOk = humanPassable(sw, goal);
  goal = nearestPassable(sw, goal);
  const start = s0;
  if (start === goal) return [goalOk ? { x: tx, z: tz } : cellCenter(sw, goal)];
  const N = sw.size * sw.size;
  ensure(N);
  cur++;
  const size = sw.size;
  const gi = goal % size;
  const gj = (goal / size) | 0;
  const h = (c: number) => {
    const dx = Math.abs((c % size) - gi);
    const dz = Math.abs(((c / size) | 0) - gj);
    return 10 * Math.max(dx, dz) + 4 * Math.min(dx, dz);
  };
  let hn = 0;
  // Heap por (f, h, índice): desempate fixo.
  const less = (a: number, b: number) =>
    heapF[a]! < heapF[b]! || (heapF[a] === heapF[b] && (heapH[a]! < heapH[b]! || (heapH[a] === heapH[b] && heapV[a]! < heapV[b]!)));
  const swap = (a: number, b: number) => {
    let t = heapF[a]!;
    heapF[a] = heapF[b]!;
    heapF[b] = t;
    t = heapH[a]!;
    heapH[a] = heapH[b]!;
    heapH[b] = t;
    t = heapV[a]!;
    heapV[a] = heapV[b]!;
    heapV[b] = t;
  };
  const push = (f: number, hh: number, v: number) => {
    if (hn >= heapF.length) return;
    let i = hn++;
    heapF[i] = f;
    heapH[i] = hh;
    heapV[i] = v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(i, p)) break;
      swap(i, p);
      i = p;
    }
  };
  const pop = () => {
    const v = heapV[0]!;
    hn--;
    if (hn > 0) {
      heapF[0] = heapF[hn]!;
      heapH[0] = heapH[hn]!;
      heapV[0] = heapV[hn]!;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < hn && less(l, m)) m = l;
        if (r < hn && less(r, m)) m = r;
        if (m === i) break;
        swap(i, m);
        i = m;
      }
    }
    return v;
  };
  stamp[start] = cur;
  gScore[start] = 0;
  came[start] = -1;
  push(h(start), h(start), start);
  let found = false;
  let expanded = 0;
  while (hn > 0 && expanded < MAX_EXPAND) {
    const c = pop();
    if (closed[c] === cur) continue;
    closed[c] = cur;
    expanded++;
    if (c === goal) {
      found = true;
      break;
    }
    const ci = c % size;
    const cj = (c / size) | 0;
    for (let oz = -1; oz <= 1; oz++)
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oz) continue;
        const ni = ci + ox;
        const nj = cj + oz;
        if (ni < 0 || nj < 0 || ni >= size || nj >= size) continue;
        const n = nj * size + ni;
        if (!humanPassable(sw, n) || closed[n] === cur) continue;
        // Sem cortar quina na diagonal.
        if (ox && oz && (!humanPassable(sw, cj * size + ni) || !humanPassable(sw, nj * size + ci))) continue;
        const g = gScore[c]! + (ox && oz ? 14 : 10);
        if (stamp[n] !== cur || g < gScore[n]!) {
          stamp[n] = cur;
          gScore[n] = g;
          came[n] = c;
          const hh = h(n);
          push(g + hh, hh, n);
        }
      }
  }
  if (!found) return [{ x: tx, z: tz }];
  const cells: number[] = [];
  for (let c = goal; c !== -1; c = came[c]!) cells.push(c);
  cells.reverse();
  // Suaviza: de cada ponto, vai até o mais longe que ainda se vê.
  const out: Vec[] = [];
  let i = 0;
  while (i < cells.length - 1) {
    let j = i + 1;
    while (j + 1 < cells.length && sight(sw, cells[i]!, cells[j + 1]!)) j++;
    out.push(cellCenter(sw, cells[j]!));
    i = j;
  }
  if (goalOk) {
    if (out.length) out[out.length - 1] = { x: tx, z: tz };
    else out.push({ x: tx, z: tz });
  }
  return out;
}
