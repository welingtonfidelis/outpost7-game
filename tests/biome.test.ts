import { describe, expect, it } from 'vitest';
import { BIOME_IDS, biomeFor } from '../src/render/biome.ts';

describe('bioma da partida (Etapa 19)', () => {
  it('sai da semente: a mesma semente volta no mesmo bioma (saves)', () => {
    for (const seed of [0, 1, 2, 7, 123456789, 4294967295]) expect(biomeFor(seed).id).toBe(biomeFor(seed).id);
  });

  it('as três aparecem com sementes diferentes', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 30; s++) seen.add(biomeFor(s * 7919).id);
    expect([...seen].sort()).toEqual([...BIOME_IDS].sort());
  });

  it('?bioma= na URL vence a semente; valor estranho é ignorado', () => {
    expect(biomeFor(0, new URLSearchParams('bioma=gelo')).id).toBe('gelo');
    expect(biomeFor(1, new URLSearchParams('bioma=lava')).id).toBe(biomeFor(1).id);
  });
});
