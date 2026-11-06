import type { World } from './types.ts';

/** mulberry32 com o estado dentro do mundo: mapa, atributos e recrutas. */
export function rand(w: World): number {
  let t = (w.rng = (w.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Mistura de 32 bits (fmix do murmur3). */
function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * RNG por contador: o mesmo (semente, onda, id, sal) dá sempre o mesmo número, não importa
 * a ordem em que as coisas acontecem. É o dado da rolagem de pânico.
 */
export function hash01(seed: number, a: number, b: number, c: number): number {
  let h = fmix(seed ^ 0x9e3779b9);
  h = fmix(h ^ Math.imul(a + 1, 0x27d4eb2d));
  h = fmix(h ^ Math.imul(b + 1, 0x165667b1));
  h = fmix(h ^ Math.imul(c + 1, 0x61c88647));
  return h / 4294967296;
}
