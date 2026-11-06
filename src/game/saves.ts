/**
 * Vagas de save no navegador (Etapa 17): a manual (botão "Salvar") e a automática (começo de
 * cada calma). Ficam no localStorage desta origem; num iPhone, no Safari daquele aparelho.
 * Carregar recarrega a página com um aviso em sessionStorage, para o jogo nascer já carregado.
 */
import { readMeta } from '../sim/index.ts';
import type { SaveMeta } from '../sim/index.ts';
import type { Session } from './session.ts';

export type Slot = 'manual' | 'auto';
const KEY = (s: Slot) => `posto-avancado:save:${s}`;
const LOAD_FLAG = 'posto-avancado:carregar';

export function readSlot(s: Slot): { data: string; meta: SaveMeta } | null {
  try {
    const data = localStorage.getItem(KEY(s));
    if (!data) return null;
    const meta = readMeta(data);
    return meta ? { data, meta } : null;
  } catch {
    return null;
  }
}

/** Pede o mundo ao worker e grava na vaga. Devolve o motivo se não deu. */
export async function saveTo(session: Session, s: Slot): Promise<{ ok: true; wave: number } | { ok: false; why: string }> {
  const data = await session.snapshotSave();
  if (!data) return { ok: false, why: 'só dá para salvar na calma, entre as ondas' };
  try {
    localStorage.setItem(KEY(s), data);
  } catch {
    return { ok: false, why: 'o navegador não deixou gravar (espaço ou modo privado)' };
  }
  return { ok: true, wave: readMeta(data)?.wave ?? 0 };
}

/** Marca a vaga para carregar e recarrega a página. */
export function loadAndReload(s: Slot): void {
  try {
    sessionStorage.setItem(LOAD_FLAG, s);
  } catch {
    return;
  }
  location.reload();
}

/** Na carga da página: o save pedido (e apaga o aviso). */
export function takePendingLoad(): string | null {
  try {
    const s = sessionStorage.getItem(LOAD_FLAG) as Slot | null;
    if (!s) return null;
    sessionStorage.removeItem(LOAD_FLAG);
    return readSlot(s)?.data ?? null;
  } catch {
    return null;
  }
}
