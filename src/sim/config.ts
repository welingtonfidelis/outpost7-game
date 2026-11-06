/**
 * Todos os números do protótipo num lugar só. O balanceador (tools/balance.ts) troca
 * campos daqui para testar janelas de aviso e políticas de recolhimento.
 */
export interface RingConfig {
  /** Raio interno e externo do anel, em metros a partir do centro da base. */
  r0: number;
  r1: number;
  /** Quantos nós de recurso no anel. */
  count: number;
  /** Carga que um trabalhador traz por viagem. */
  load: number;
  /** Estoque de cada nó (acaba). */
  stock: number;
}

export interface SpeciesStats {
  hp: number;
  speed: number;
  bite: number;
}
export interface SpeciesShare {
  from: number;
  share: number;
  perWave: number;
  max: number;
}

export interface Config {
  ticksPerSecond: number;
  /** Meia largura da base quadrada (m). */
  baseHalf: number;
  /** Meia largura dos portões no meio de cada lado (m). */
  gateHalf: number;
  /** Perímetro externo: quando a horda cruza, rola o pânico. */
  dangerRadius: number;
  hordeSpawnRadius: number;
  /** Calma da primeira onda e quanto encurta a cada onda, com piso. */
  calmFirst: number;
  calmStep: number;
  calmMin: number;
  /** Janela de aviso (GDD 5.2): da sirene até a horda cruzar o perímetro. */
  warning: number;
  /** Portões fecham este tanto depois que a horda cruza o perímetro. */
  gateGrace: number;
  /** Folga (s) do "Chamar em risco": chama quem precisa de mais que o tempo que falta menos isto. */
  recallMargin: number;
  /** Até quanto os guardas seguram um portão para quem foi salvo e ainda está chegando. */
  gateMaxHold: number;
  /** Tempo máximo do ataque depois que os portões fecham (os que sobram recuam). */
  assault: number;
  startWorkers: number;
  maxWorkers: number;
  recruitCost: number;
  speedMin: number;
  speedMax: number;
  /** Multiplicadores de velocidade. */
  carrySlow: number;
  sprint: number;
  woundSlow: number;
  gatherTime: number;
  /** Tempo de repouso de quem chega ferido (s). */
  woundRest: number;
  rings: RingConfig[];
  /** Economia de longo prazo: os nós se recuperam entre ondas e surgem jazidas novas mais longe. */
  economy: {
    /** Fração do estoque máximo que cada nó recupera no fim de cada onda. */
    regrow: number;
    /** A cada quantas ondas surge uma jazida nova, e onde (m do centro). */
    newEvery: number;
    newMin: number;
    newMax: number;
    newStock: number;
    newLoad: number;
  };
  panic: {
    /** Chance com margem zero (chega no portão no instante em que ele fecha). */
    base: number;
    /** Cada segundo de folga (ou de atraso) soma (ou tira) isto. */
    perSecond: number;
    /** Cada m/s de velocidade acima de 3 soma isto. */
    perSpeed: number;
    min: number;
    max: number;
    /** Entre os salvos: sai limpo, larga a carga ou chega ferido. */
    clean: number;
    dropped: number;
  };
  morale: { start: number; deathHit: number; regenPerSecond: number; lowAt: number; lowSpeed: number };
  horde: {
    /** Insetos na onda n (n a partir de 0): base + linear·n + quad·n², até o teto. */
    base: number;
    linear: number;
    quad: number;
    cap: number;
    speed: number;
    /** Cada onda deixa o inseto mais forte: vida e mordida crescem estas frações por onda. */
    hpGrowth: number;
    biteGrowth: number;
  };
  swarm: {
    /** Lado da grade em células de 1 m, centrada na base. */
    grid: number;
    wallHp: number;
    gateHp: number;
    coreHp: number;
    bugHp: number;
    /** Dano por segundo de cada inseto mordendo muralha/portão e núcleo. */
    biteWall: number;
    /** Quantos insetos mordem a mesma célula ao mesmo tempo. */
    biteSlots: number;
    biteCore: number;
    /** Raio de separação e teto de vizinhos checados. */
    radius: number;
    maxCheck: number;
    /** Distância em que um inseto dentro dos muros pega um trabalhador. */
    reach: number;
    /** Intervalo mínimo entre recálculos do flow field (s). */
    flowEvery: number;
    /** Minério por ponto de HP consertado. */
    repairPerHp: number;
  };
  towers: { range: number; dps: number };
  /**
   * Espécies do enxame (Etapa 20, desenhos nossos): multiplicadores de vida, velocidade e
   * mordida; a fração de cada uma (a partir da onda `from`, crescendo `perWave` até `max`).
   * O resto é corredor. Saltador: bote em tropa perto (`leap`) e pulo sobre a muralha quando
   * a pilha encostada nela passa de `pile`. Cuspidor: para a `range` m de muralha ou prédio
   * e cospe ácido (`dps`).
   */
  species: {
    corredor: SpeciesStats;
    besouro: SpeciesStats & SpeciesShare;
    saltador: SpeciesStats & SpeciesShare & { leap: { range: number; speed: number; time: number; every: number; pile: number; over: number } };
    cuspidor: SpeciesStats & SpeciesShare & { spit: { range: number; dps: number } };
  };
  /**
   * Comportamento da horda (Etapa 15): caçadores (fração na onda 1, quanto sobe por onda e o
   * teto), distância em que um caçador vai numa tropa, bandos (mínimo, máximo, insetos por
   * bando), avulsos, atraso máximo das levas e folga de cada inseto (s), e o andar: desvio
   * lateral, oscilação de ritmo e a distância (m) em que o desvio some perto do alvo.
   */
  ai: {
    hunters: number;
    huntersPerWave: number;
    huntersMax: number;
    /**
     * Prédios que atraem caçadores, se só os de fora da fortaleza, e a distância (m) em que o
     * caçador os percebe. A "fila" de cada alvo cresce `crowdCost` (em décimos de metro de
     * caminho) por inseto que já o morde, até `crowdMax`: espalha os caçadores entre os alvos.
     */
    targets: string[];
    outsideOnly: boolean;
    sense: number;
    crowdCost: number;
    crowdMax: number;
    chase: number;
    packsMin: number;
    packsMax: number;
    perPack: number;
    loners: number;
    /** Largura do leque de cada bando (mínimo e máximo). */
    spreadMin: number;
    spreadMax: number;
    surge: number;
    jitter: number;
    lateral: number;
    pace: number;
    calm: number;
  };
  /** Pilha de insetos que escala a muralha. */
  climb: { threshold: number; rate: number; decay: number; speed: number; cost: number };
  /** Escavadores: túnel que sai dentro da base. */
  tunnel: { fromWave: number; share: number; min: number; max: number; entry: number; exit: number; time: number };
  upgrades: {
    /** Tempo de melhoria de prédio e de torre (s). */
    time: number;
    towerTime: number;
    /** Níveis 2 e 3 de cada um (índice 0 = nível 2). */
    quartel: UpgradeLevel[];
    fabrica: UpgradeLevel[];
    torre: UpgradeLevel[];
    fortim: UpgradeLevel[];
  };
  build: {
    /** Até onde se constrói (m do centro). */
    radius: number;
    wall: { costPerCell: number; hp: number };
    gate: { costPerCell: number; hp: number; maxLen: number };
    torre: BuildingConfig;
    gerador: BuildingConfig & { energy: number };
    refinaria: BuildingConfig & { bonus: number; max: number };
    fabrica: BuildingConfig & { queue: number; perBuilding: number };
    quartel: BuildingConfig & { queue: number; perBuilding: number };
    /**
     * Vagas, bônus de dano (fração) e de alcance (m) de quem está dentro. Fora da fortaleza
     * (posto avançado): alcance a mais, blindagem (fração da mordida que não passa) e vagas de
     * abrigo para trabalhadores na hora do pânico.
     */
    fortim: BuildingConfig & { slots: number; dmg: number; range: number; outpostRange: number; armor: number; shelter: number; reach: number };
    /** Fração da vida que quem estava dentro perde quando o fortim cai. */
    fortFall: number;
    /** Fração do custo que volta ao demolir. */
    refund: number;
    /** Energia que o núcleo dá (as torres dos cantos usam). */
    coreEnergy: number;
  };
  units: {
    soldado: UnitConfig;
    atirador: UnitConfig;
    robo: UnitConfig;
    /** Dano por segundo de cada inseto mordendo uma unidade. */
    bite: number;
    /** Distância em que um inseto morde uma unidade. */
    reach: number;
  };
}

export interface BuildingConfig {
  cost: number;
  /** Lado em células de 1 m. */
  size: number;
  hp: number;
  /** Tempo de obra (s): em obra o prédio não funciona. */
  time: number;
}

export interface UnitConfig {
  cost: number;
  hp: number;
  dps: number;
  range: number;
  speed: number;
  max: number;
  /** Quantos insetos mordem a mesma unidade ao mesmo tempo. */
  biteSlots: number;
  /** Raio do respingo do tiro (0: sem respingo). Metade do dano. */
  splash: number;
  /** Tempo de treino no prédio (s). */
  train: number;
}

/** Um nível de melhoria: custo e o que soma (dano e vida em fração, alcance em metros). */
export interface UpgradeLevel {
  cost: number;
  dmg: number;
  hp: number;
  range: number;
  /** Respingo passa a ser este raio (0: não muda). */
  splash: number;
  /** Vagas a mais (fortim). */
  slots?: number;
}

export const CONFIG: Config = {
  ticksPerSecond: 20,
  baseHalf: 12,
  gateHalf: 2.5,
  dangerRadius: 110,
  hordeSpawnRadius: 240,
  calmFirst: 120,
  calmStep: 4,
  calmMin: 80,
  // 20 s por decisão do usuário em 2026-11-05 (era 30; §C.31).
  warning: 20,
  gateGrace: 6,
  recallMargin: 10,
  gateMaxHold: 6,
  assault: 90,
  startWorkers: 10,
  maxWorkers: 24,
  recruitCost: 30,
  speedMin: 2.6,
  speedMax: 3.4,
  carrySlow: 0.85,
  sprint: 1.6,
  woundSlow: 0.7,
  gatherTime: 3,
  woundRest: 45,
  rings: [
    { r0: 24, r1: 40, count: 6, load: 3, stock: 45 },
    { r0: 46, r1: 70, count: 7, load: 7, stock: 90 },
    { r0: 76, r1: 100, count: 8, load: 14, stock: 160 },
  ],
  economy: { regrow: 0.25, newEvery: 2, newMin: 80, newMax: 106, newStock: 260, newLoad: 16 },
  panic: { base: 0.5, perSecond: 0.08, perSpeed: 0.12, min: 0.03, max: 0.97, clean: 0.4, dropped: 0.35 },
  morale: { start: 100, deathHit: 12, regenPerSecond: 0.1, lowAt: 50, lowSpeed: 0.85 },
  // Etapa 20: crescimento 8% menor, para as espécies novas não pesarem demais (bots, §C.36).
  horde: { base: 160, linear: 36.8, quad: 3.68, cap: 4000, speed: 9, hpGrowth: 0.05, biteGrowth: 0.04 },
  swarm: {
    grid: 280,
    wallHp: 800,
    gateHp: 400,
    coreHp: 1500,
    bugHp: 30,
    biteWall: 4,
    biteSlots: 4,
    biteCore: 3,
    radius: 0.6,
    maxCheck: 12,
    reach: 1.0,
    flowEvery: 0.5,
    repairPerHp: 0.05,
  },
  towers: { range: 30, dps: 70 },
  // Ajustado com os bots (§C.36): besouro 3× a vida (era 5), mordida 1,6 (era 3); cuspe 1,2/s
  // (era 2,5); saltador só pula com a pilha a 60% (era 40%).
  species: {
    corredor: { hp: 1, speed: 1, bite: 1 },
    besouro: { hp: 3, speed: 0.55, bite: 1.6, from: 2, share: 0.03, perWave: 0.008, max: 0.12 },
    saltador: { hp: 0.6, speed: 1.3, bite: 0.8, from: 1, share: 0.05, perWave: 0.01, max: 0.18, leap: { range: 6, speed: 3, time: 0.45, every: 3, pile: 0.6, over: 4 } },
    cuspidor: { hp: 1.3, speed: 0.75, bite: 0.5, from: 3, share: 0.03, perWave: 0.006, max: 0.09, spit: { range: 8, dps: 1.2 } },
  },
  // Ajustado com os bots (§C.28): caçar torres e geradores também derrubava a progressão
  // (o bot que melhora tudo caía na onda 8–15 em vez de 18); só o fortim atrai.
  ai: {
    // Etapa 17: com todos os prédios de fora como alvo, menos caçadores (§C.32).
    hunters: 0.15,
    huntersPerWave: 0.008,
    huntersMax: 0.3,
    // Etapa 17 (decisão do usuário): tudo que está fora da fortaleza chama atenção, espalhado.
    targets: ['torre', 'gerador', 'refinaria', 'quartel', 'fabrica', 'fortim'],
    outsideOnly: true,
    sense: 20,
    crowdCost: 25,
    crowdMax: 400,
    chase: 7,
    packsMin: 5,
    packsMax: 14,
    perPack: 200,
    loners: 0.35,
    spreadMin: 0.3,
    spreadMax: 0.7,
    surge: 12,
    jitter: 4,
    lateral: 0.6,
    pace: 0.25,
    calm: 8,
  },
  // Limiar 45 (era 25): os bandos concentram a pressão num trecho da muralha (§C.28).
  climb: { threshold: 45, rate: 0.005, decay: 0.3, speed: 0.4, cost: 6 },
  tunnel: { fromWave: 5, share: 0.02, min: 4, max: 40, entry: 30, exit: 9, time: 18 },
  upgrades: {
    time: 20,
    towerTime: 10,
    quartel: [
      { cost: 150, dmg: 0.4, hp: 0.25, range: 0, splash: 0 },
      { cost: 250, dmg: 0.2, hp: 0, range: 0, splash: 0 },
    ],
    fabrica: [
      { cost: 200, dmg: 0.3, hp: 0.3, range: 0, splash: 0 },
      { cost: 300, dmg: 0.3, hp: 0.3, range: 0, splash: 2.2 },
    ],
    torre: [
      { cost: 80, dmg: 0.35, hp: 0, range: 4, splash: 0 },
      { cost: 150, dmg: 0.35, hp: 0, range: 0, splash: 1.5 },
    ],
    // No fortim, dano e alcance somam ao bônus de quem está dentro; vida é a do prédio.
    fortim: [
      { cost: 120, dmg: 0, hp: 0.5, range: 0, splash: 0, slots: 2 },
      { cost: 200, dmg: 0.25, hp: 0, range: 2, splash: 0 },
    ],
  },
  build: {
    radius: 50,
    wall: { costPerCell: 2, hp: 800 },
    gate: { costPerCell: 10, hp: 400, maxLen: 5 },
    torre: { cost: 60, size: 2, hp: 600, time: 8 },
    gerador: { cost: 80, size: 2, hp: 400, time: 8, energy: 3 },
    refinaria: { cost: 150, size: 3, hp: 800, time: 12, bonus: 0.25, max: 2 },
    fabrica: { cost: 150, size: 3, hp: 800, time: 12, queue: 3, perBuilding: 2 },
    quartel: { cost: 100, size: 3, hp: 900, time: 12, queue: 5, perBuilding: 8 },
    fortim: { cost: 125, size: 3, hp: 2400, time: 12, slots: 4, dmg: 0.5, range: 3, outpostRange: 3, armor: 0.4, shelter: 4, reach: 95 },
    fortFall: 0.35,
    refund: 0.5,
    coreEnergy: 4,
  },
  units: {
    soldado: { cost: 50, hp: 60, dps: 12, range: 12, speed: 4, max: 48, biteSlots: 3, splash: 0, train: 6 },
    atirador: { cost: 75, hp: 40, dps: 30, range: 22, speed: 3.6, max: 48, biteSlots: 3, splash: 0, train: 10 },
    robo: { cost: 120, hp: 450, dps: 30, range: 9, speed: 2.6, max: 12, biteSlots: 8, splash: 1.5, train: 15 },
    bite: 3,
    reach: 0.9,
  },
};

/** Cópia profunda com trocas pontuais (para testes e para o balanceador). */
export function withConfig(patch: Partial<Config>): Config {
  return { ...structuredClone(CONFIG), ...patch };
}
