// Gerado por tools/bake-fx.ts a partir do pixelfx (commit a84159688af3ca37a4be05a0d422b94451b2e24e). Não editar à mão.
/**
 * Folha dos tiros (`public/assets/fx/tiros.png`): quadros do pixelfx, MIT (Patch e Hugo Duprez),
 * ver LICENSES.md. Cada efeito ocupa uma faixa a partir da linha `y`, em `cols` colunas de quadros
 * `cw` x `ch` px (com 1 px vazio em volta). `mx`, `my`: o cano dentro do quadro (px, y para baixo).
 */
export const SHOT_ATLAS = { file: 'tiros.png', w: 1022, h: 290 } as const;

export const SHOT_SHEETS = {
  /** SMG burst (pixelfx). */
  smg: { y: 0, cols: 14, cw: 73, ch: 38, frames: 30, fps: 30, loop: true, mx: 25, my: 25 },
  /** Pistol shot (pixelfx). */
  pistol: { y: 114, cols: 16, cw: 63, ch: 44, frames: 49, fps: 30, loop: false, mx: 23, my: 31 },
} as const;

export type ShotSheetKey = keyof typeof SHOT_SHEETS;
