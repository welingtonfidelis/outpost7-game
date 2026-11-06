import { describe, expect, it } from 'vitest';
import { CONFIG, buildWall, canSave, createWorld, finishConstruction, garrison, placeBuilding, readMeta, recruitUnit, loadWorld, saveWorld, setAlarm, setFocus, stateHash, step } from '../src/sim/index.ts';
import type { World } from '../src/sim/index.ts';

const TPS = 20;

function playWave(w: World): void {
  const wave = w.wave;
  while (w.wave === wave && !w.lost) {
    if (w.phase === 'warning' && !w.alarm) setAlarm(w, true);
    step(w);
  }
}

/** Uma partida com prédios, muralha, fortim ocupado e duas ondas jogadas. */
function midGame(seed = 3): World {
  const w = createWorld(seed);
  setFocus(w, 2);
  w.ore = 3000;
  placeBuilding(w, 'quartel', 24, 24);
  const fort = placeBuilding(w, 'fortim', 17, 2)!;
  placeBuilding(w, 'torre', -18, 6);
  buildWall(w, 'muralha', -30, 20, -20, 20);
  finishConstruction(w);
  for (let i = 0; i < 4; i++) recruitUnit(w, 'soldado');
  for (let k = 0; k < 30 * TPS; k++) step(w);
  garrison(w, w.units.map((u) => u.id), fort.id);
  playWave(w);
  playWave(w);
  return w;
}

describe('salvar e carregar (Etapa 17)', () => {
  it('carregar e seguir dá o mesmo hash que nunca ter salvo', () => {
    const a = midGame();
    expect(canSave(a)).toBe(true);
    const json = saveWorld(a);
    const b = loadWorld(json, a.cfg);
    expect(stateHash(b)).toBe(stateHash(a));
    playWave(a);
    playWave(b);
    expect(b.wave).toBe(a.wave);
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('só salva na calma, e o arquivo é pequeno', () => {
    const w = midGame(5);
    const json = saveWorld(w, 123);
    expect(json.length).toBeLessThan(200_000);
    const meta = readMeta(json)!;
    expect(meta.wave).toBe(w.wave);
    expect(meta.savedAt).toBe(123);
    while (w.phase === 'calm') step(w);
    expect(canSave(w)).toBe(false);
    expect(() => saveWorld(w)).toThrow();
  });

  it('carrega com a configuração atual do jogo', () => {
    const w = midGame(7);
    const cfg = structuredClone(CONFIG);
    cfg.warning = 17;
    const b = loadWorld(saveWorld(w), cfg);
    expect(b.cfg.warning).toBe(17);
    expect(b.buildings.length).toBe(w.buildings.length);
    expect(b.units.filter((u) => u.inside >= 0).length).toBe(w.units.filter((u) => u.inside >= 0).length);
  });
});
