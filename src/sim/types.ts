import type { Config } from './config.ts';
import type { Swarm } from './swarm.ts';

export type Phase = 'calm' | 'warning' | 'breach' | 'assault';
export type Ring = 0 | 1 | 2;

export type WorkerState =
  /** Dentro da base, parado ou indo para o lugar dele. */
  | 'inside'
  | 'toNode'
  | 'gathering'
  | 'returning'
  /** Correndo para o portão depois da rolagem de pânico (o resultado já está decidido). */
  | 'panic'
  /** Abrigado num fortim até a onda acabar (Etapa 17). */
  | 'sheltered'
  | 'dead';

export type PanicOutcome = 'limpo' | 'sem-carga' | 'ferido' | 'devorado';

export interface Vec {
  x: number;
  z: number;
}

export interface Worker {
  id: number;
  name: string;
  x: number;
  z: number;
  /** Posição no tick anterior (o 3D interpola entre as duas). */
  px: number;
  pz: number;
  /** Velocidade base (m/s): o atributo de fuga do GDD. */
  speed: number;
  state: WorkerState;
  node: number;
  route: Vec[];
  timer: number;
  cargo: number;
  /** Segundos de repouso que faltam (ferido não sai). */
  wounded: number;
  panic: null | {
    outcome: PanicOutcome;
    chance: number;
    gate: number;
    /** Quando é pego (só para 'devorado'). */
    catchAt: number;
    /** Refúgio: fortim (id) ou -1 para o portão. */
    fort: number;
  };
  /** Quando morreu (para o corpo sumir no fim da onda). */
  diedAt: number;
  /** Chamado de volta pelo "Chamar em risco": fica dentro até liberar a saída ou a onda acabar. */
  hold: boolean;
  /** Fortim onde está abrigado (-1: nenhum). */
  fort: number;
}

export interface ResourceNode {
  id: number;
  ring: Ring;
  x: number;
  z: number;
  stock: number;
  load: number;
  /** Estoque cheio (para a recuperação entre ondas). */
  max: number;
}

export interface Gate {
  /** Ponto do lado de fora e do lado de dentro do portão. */
  outer: Vec;
  inner: Vec;
  /** Até quando fica aberto nesta onda (segura para quem foi salvo e ainda chega). */
  closeAt: number;
}

export interface WaveTimes {
  start: number;
  siren: number;
  arrive: number;
  gatesClose: number;
  end: number;
  bugs: number;
}

export interface WaveStats {
  wave: number;
  delivered: number;
  outsideAtArrive: number;
  saved: number;
  dropped: number;
  wounded: number;
  devoured: number;
  /** Carga perdida (largada ou com quem foi devorado). */
  cargoLost: number;
  /** Segundos entre a sirene e o alarme geral (null: não tocou). */
  alarmDelay: number | null;
  kills: number;
  /** Células de muralha ou portão derrubadas. */
  breaches: number;
  coreDamage: number;
  /** Trabalhadores pegos dentro dos muros. */
  insideDeaths: number;
  unitsLost: number;
}

export type UnitKind = 'soldado' | 'atirador' | 'robo';

export interface Unit {
  id: number;
  kind: UnitKind;
  x: number;
  z: number;
  px: number;
  pz: number;
  hp: number;
  route: Vec[];
  /** Para onde está indo (o lugar dele na formação). */
  goal: Vec;
  /** Ordem do jogador para esta unidade (null: automático, portões ou brechas). */
  order: Vec | null;
  /** Fortim onde está (id do prédio; -1: no mapa) e para qual fortim está indo (-1: nenhum). */
  inside: number;
  enter: number;
  dead: boolean;
  /** Índice do inseto na mira (-1: nenhum). */
  target: number;
  tx: number;
  tz: number;
}

export interface Tunnel {
  id: number;
  /** Lado de onde vem (para o aviso). */
  side: string;
  /** Boca (fora) e saída (dentro da base). */
  ex: number;
  ez: number;
  ix: number;
  iz: number;
  /** Quando o primeiro entrou (s; -1: ninguém ainda) e quantos estão embaixo agora. */
  started: number;
  under: number;
  /** Já saiu alguém (para avisar uma vez só). */
  emerged?: boolean;
}

export type BuildingKind = 'torre' | 'gerador' | 'refinaria' | 'fabrica' | 'quartel' | 'fortim';

export interface Building {
  id: number;
  kind: BuildingKind;
  /** Canto de baixo à esquerda (célula) e centro (m). */
  x: number;
  z: number;
  size: number;
  hp: number;
  cells: number[];
  /** Nível (1 a 3) e melhoria em andamento (s que faltam; 0: nenhuma). */
  level: number;
  upgradeLeft: number;
  /** Fila de treino (quartel e fábrica) e quanto falta para o primeiro sair (s). */
  queue: UnitKind[];
  trainLeft: number;
  /** Obra: quanto falta para ficar pronto (s; 0: pronto). Em obra não funciona. */
  buildLeft: number;
  /** Já avisou que caiu para metade da vida (volta a avisar depois de consertado). */
  hurt?: boolean;
}

export interface Tower {
  /** Chave da torre (0 a 3 nos cantos; 100 + id do prédio nas livres). */
  slot: number;
  /** Prédio da torre (-1: torre fixa de canto, em cima da muralha). */
  buildingId: number;
  powered: boolean;
  level: number;
  upgradeLeft: number;
  x: number;
  z: number;
  built: boolean;
  /** Índice do inseto na mira (-1: nenhum). */
  target: number;
  tx: number;
  tz: number;
}

export type SimEvent =
  | { type: 'siren'; wave: number; arrive: number }
  | { type: 'alarm'; on: boolean }
  | { type: 'recall'; n: number }
  | { type: 'arrive'; wave: number; outside: number }
  | { type: 'panic'; worker: number; name: string; outcome: PanicOutcome; chance: number }
  | { type: 'saved'; worker: number; name: string; outcome: PanicOutcome; fort?: boolean }
  | { type: 'devoured'; worker: number; name: string; x: number; z: number; cargo: number }
  | { type: 'gatesClosed'; wave: number }
  | { type: 'waveEnd'; stats: WaveStats }
  | { type: 'deposit'; worker: number; amount: number }
  | { type: 'recruit'; worker: number; name: string }
  | { type: 'depleted'; node: number }
  | { type: 'newDeposit'; x: number; z: number }
  | { type: 'breach'; x: number; z: number }
  | { type: 'tower'; slot: number }
  | { type: 'repair'; cost: number }
  | { type: 'lost'; wave: number }
  | { type: 'climb'; x: number; z: number }
  | { type: 'tunnel'; side: string; x: number; z: number }
  | { type: 'emerge'; x: number; z: number }
  | { type: 'unitReady'; kind: UnitKind }
  | { type: 'upgraded'; kind: BuildingKind; level: number }
  | { type: 'built'; kind: BuildingKind | 'muralha' | 'portao'; cells: number }
  | { type: 'finished'; kind: BuildingKind; x: number; z: number }
  | { type: 'buildFail'; reason: string }
  /** Aviso curto que não é de construção (fortim cheio, robô não entra...). */
  | { type: 'notice'; text: string }
  | { type: 'demolished'; refund: number }
  /** `inside`: quantos saíram feridos (fortim). */
  | { type: 'buildingDown'; kind: BuildingKind; x: number; z: number; inside: number }
  | { type: 'buildingHurt'; kind: BuildingKind; x: number; z: number }
  | { type: 'unitDown'; kind: UnitKind; x: number; z: number };

export interface World {
  cfg: Config;
  seed: number;
  /** Estado do mulberry32 (mapa, atributos, recrutas). */
  rng: number;
  tick: number;
  wave: number;
  times: WaveTimes;
  phase: Phase;
  alarm: boolean;
  /** Quando o alarme foi tocado nesta onda (s de jogo). */
  alarmAt: number | null;
  focus: Ring;
  ore: number;
  oreTotal: number;
  morale: number;
  workers: Worker[];
  nextId: number;
  names: number;
  nodes: ResourceNode[];
  gates: Gate[];
  stats: WaveStats;
  history: WaveStats[];
  events: SimEvent[];
  swarm: Swarm;
  /** HP do núcleo (o depósito). Zero é derrota. */
  core: number;
  towers: Tower[];
  lost: boolean;
  units: Unit[];
  nextUnitId: number;
  buildings: Building[];
  nextBuildId: number;
  tunnels: Tunnel[];
  energy: { supply: number; demand: number };
  /** Ponto de reunião de cada tipo (null: automático). */
  rally: { soldado: Vec | null; atirador: Vec | null; robo: Vec | null };
}
