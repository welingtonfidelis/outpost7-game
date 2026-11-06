/**
 * Etapa 4 (GDD 5.2): balanceador headless. Bots com políticas de recolhimento diferentes
 * jogam N ondas com várias sementes, para cada janela de aviso. Mede minério entregue,
 * mortes e variância. A pergunta: em que janela arriscar tem valor parecido com jogar
 * seguro, mas com mais variância? É aí que a tensão é real.
 *
 *   npm run balance -- --seeds 40 --waves 8 --warning 15,20,30,45
 */
import { advance, autoTower, canPlace, createWorld, hasFactory, placeBuilding, recallAtRisk, recruit, recruitUnit, repair, repairCost, setAlarm, setFocus, withConfig } from '../src/sim/index.ts';
import type { Ring } from '../src/sim/index.ts';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const SEEDS = Number(arg('seeds', '40'));
const WAVES = Number(arg('waves', '8'));
const WARNINGS = arg('warning', '15,20,30,45').split(',').map(Number);
const FROM = Number(arg('from', '1000'));

interface Policy {
  name: string;
  focus: Ring;
  /** Segundos depois da sirene em que toca o alarme (negativo: antes). null: nunca. */
  alarm: number | null;
  /** Etapa 16: em vez do alarme, "Chamar em risco" a cada segundo na calma e na sirene. */
  recall?: boolean;
}

const POLICIES: Policy[] = [];
for (const focus of [0, 1, 2] as Ring[]) {
  for (const alarm of [-10, 0, 10, 20, null]) {
    const f = ['perto', 'médio', 'longe'][focus]!;
    const a = alarm === null ? 'nunca' : alarm < 0 ? `${-alarm}s antes` : alarm === 0 ? 'na sirene' : `+${alarm}s`;
    POLICIES.push({ name: `${f.padEnd(5)} · ${a}`, focus, alarm });
  }
  POLICIES.push({ name: `${['perto', 'médio', 'longe'][focus]!.padEnd(5)} · em risco`, focus, alarm: null, recall: true });
}

interface Result {
  lost: boolean;
  waves: number;
  ore: number;
  deaths: number;
  outside: number;
  minutes: number;
}

function play(seed: number, warning: number, p: Policy): Result {
  const cfg = withConfig({ warning });
  const w = createWorld(seed, cfg);
  setFocus(w, p.focus);
  let deaths = 0;
  let outside = 0;
  const tps = cfg.ticksPerSecond;
  while (w.wave < WAVES && !w.lost) {
    const t = w.tick / tps;
    if (p.alarm !== null && !w.alarm && (w.phase === 'calm' || w.phase === 'warning') && t >= w.times.siren + p.alarm) setAlarm(w, true);
    if (p.recall && (w.phase === 'calm' || w.phase === 'warning') && w.tick % tps === 0) recallAtRisk(w);
    // Todos os bots administram a base do mesmo jeito (a diferença é só o alarme e o foco):
    // recrutam até 10, consertam a muralha na calma, juntam para as torres (mais minério por
    // dano) e só depois compram 2 robôs e soldados. Comprar soldado antes das torres é armadilha.
    const alive = w.workers.filter((k) => k.state !== 'dead').length;
    if (alive < 10 && w.ore >= cfg.recruitCost) recruit(w);
    else if (w.phase === 'calm' && repairCost(w) > 20) repair(w);
    else if (w.towers.length < 8) autoTower(w);
    else if (!w.buildings.some((b) => b.kind === 'quartel')) {
      if (canPlace(w, 'quartel', 20, 20).ok) placeBuilding(w, 'quartel', 20, 20);
    } else if (!hasFactory(w)) {
      if (canPlace(w, 'fabrica', -20, -20).ok) placeBuilding(w, 'fabrica', -20, -20);
    }
    else if (w.units.filter((u) => u.kind === 'robo').length < 2) recruitUnit(w, 'robo');
    else recruitUnit(w, 'soldado');
    advance(w, 1, (ev) => {
      for (const e of ev) {
        if (e.type === 'devoured') deaths++;
        if (e.type === 'arrive') outside += e.outside;
      }
    });
  }
  return { lost: w.lost, waves: w.history.length, ore: w.oreTotal, deaths, outside, minutes: w.tick / tps / 60 };
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};

const t0 = performance.now();
console.log(`Balanceador · ${SEEDS} sementes × ${WAVES} ondas · janelas de aviso: ${WARNINGS.join(', ')} s\n`);
for (const warning of WARNINGS) {
  const rows = POLICIES.map((p) => {
    const rs: Result[] = [];
    for (let s = 0; s < SEEDS; s++) rs.push(play(FROM + s, warning, p));
    const ore = rs.map((r) => r.ore);
    return {
      p,
      ore: mean(ore),
      sd: sd(ore),
      perMin: mean(rs.map((r) => r.ore / r.minutes)),
      deaths: mean(rs.map((r) => r.deaths / Math.max(1, r.waves))),
      outside: mean(rs.map((r) => r.outside / Math.max(1, r.waves))),
      lost: rs.filter((r) => r.lost).length / rs.length,
      waves: mean(rs.map((r) => r.waves)),
    };
  });
  console.log(`— Janela de aviso ${warning} s —`);
  console.log('política              minério   desvio  min/min  mortes/onda  fora/onda  perdeu  ondas');
  for (const r of rows) {
    console.log(
      `${r.p.name.padEnd(20)} ${r.ore.toFixed(0).padStart(8)} ${r.sd.toFixed(0).padStart(8)} ${r.perMin.toFixed(1).padStart(8)} ${r.deaths.toFixed(2).padStart(12)} ${r.outside.toFixed(2).padStart(10)} ${(r.lost * 100).toFixed(0).padStart(6)}% ${r.waves.toFixed(1).padStart(6)}`,
    );
  }
  // Seguro = alarme antes ou na sirene; arriscado = depois.
  const safe = rows.filter((r) => r.p.alarm !== null && r.p.alarm <= 0).sort((a, b) => b.ore - a.ore)[0]!;
  const risky = rows.filter((r) => !r.p.recall && (r.p.alarm === null || r.p.alarm > 0)).sort((a, b) => b.ore - a.ore)[0]!;
  const recall = rows.filter((r) => r.p.recall).sort((a, b) => b.ore - a.ore)[0];
  const gap = (risky.ore - safe.ore) / safe.ore;
  console.log(
    `melhor seguro: ${safe.p.name.trim()} (${safe.ore.toFixed(0)} ± ${safe.sd.toFixed(0)}) · melhor arriscado: ${risky.p.name.trim()} (${risky.ore.toFixed(0)} ± ${risky.sd.toFixed(0)}) · diferença ${(gap * 100).toFixed(0)}%`,
  );
  if (recall)
    console.log(
      `melhor "em risco": ${recall.p.name.trim()} (${recall.ore.toFixed(0)} ± ${recall.sd.toFixed(0)}, ${recall.deaths.toFixed(2)} mortes/onda) · contra o melhor seguro ${(((recall.ore - safe.ore) / safe.ore) * 100).toFixed(0)}% de minério\n`,
    );
}
console.log(`(${((performance.now() - t0) / 1000).toFixed(1)} s)`);
