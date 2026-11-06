import { render } from 'preact';
import * as THREE from 'three';
import { Sound } from '../audio/sound.ts';
import { Labels } from '../render/labels.ts';
import { PerfMeter } from '../render/perf.ts';
import { RtsCamera } from '../render/rtsCamera.ts';
import { applyBiome, createStage } from '../render/stage.ts';
import { biomeFor } from '../render/biome.ts';
import { applyGrade } from '../render/grade.ts';
import { setFortressBiome } from '../render/fortress.ts';
import { loadFlora } from '../render/flora.ts';
import type { FloraArt } from '../render/flora.ts';
import { loadArt } from '../render/assets.ts';
import { makePortraits } from '../render/portraits.ts';
import type { Art } from '../render/assets.ts';
import { World3D } from '../render/world3d.ts';
import { CONFIG, RUBBLE, doorOf } from '../sim/index.ts';
import type { Building, Config, Tower, UnitKind } from '../sim/index.ts';
import { App } from '../ui/App.tsx';
import { setPortraits } from '../ui/icons.tsx';
import { Controls } from './controls.ts';
import { planGhost } from './ghost.ts';
import { takePendingLoad } from './saves.ts';
import { Session } from './session.ts';

/**
 * Parâmetros de teste na URL:
 *   ?seed=N     semente fixa
 *   ?onda=N     começa direto na onda N (com minério para torres)
 *   ?horda=N    teto de insetos por onda (ex.: 8000 para medir no iPhone)
 *   ?aviso=S    janela de aviso em segundos
 */
function configFromUrl(p: URLSearchParams): Config {
  const cfg = structuredClone(CONFIG);
  const horda = Number(p.get('horda'));
  if (horda > 0) {
    cfg.horde.cap = Math.min(20000, Math.floor(horda));
    // Para medir: a onda já sai no teto.
    cfg.horde.base = cfg.horde.cap;
  }
  const aviso = Number(p.get('aviso'));
  if (aviso > 0) cfg.warning = aviso;
  return cfg;
}

export async function startGame(canvas: HTMLCanvasElement, ui: HTMLElement, labelsEl: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const cfg = configFromUrl(params);
  const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : (Date.now() % 1e9) >>> 0;
  const stage = createStage(canvas);
  const cam = new RtsCamera(stage.camera, canvas);
  // Carregar uma partida salva (pedido pela tela de início, que recarrega a página).
  const load = takePendingLoad();
  const session = new Session(cfg, seed, load ? 0 : Number(params.get('onda')) || 0, load ?? undefined);
  ui.innerHTML = '<div class="panel help" style="text-align:center">Carregando o posto…</div>';
  // Arte do KayKit; se falhar (ou com ?semarte), o jogo segue com os modelos feitos em código.
  let art: Art | null = null;
  if (!params.has('semarte')) {
    try {
      art = await loadArt(`${import.meta.env.BASE_URL}assets/kaykit/`);
    } catch (e) {
      console.warn('arte do KayKit não carregou; usando os modelos em código', e);
    }
  }
  await session.ready;
  session.paused = true;
  // Bioma da partida (Etapa 19): sai da semente do mundo (a de um save volta igual).
  const biome = biomeFor(session.world.seed, params);
  applyBiome(stage, biome);
  applyGrade(stage.renderer, biome);
  setFortressBiome(biome);
  let flora: FloraArt | null = null;
  if (art) {
    try {
      flora = await loadFlora(`${import.meta.env.BASE_URL}assets/kaykit/`, biome);
    } catch (e) {
      console.warn('flora do bioma não carregou', e);
    }
  }
  ui.innerHTML = '';
  // Retratos da grade e da seleção, tirados dos próprios modelos.
  if (art) setPortraits(makePortraits(stage.renderer, art));
  const view = new World3D(stage.scene, session.world, art, biome, flora);
  const labels = new Labels(labelsEl, stage.camera, view);
  const sound = new Sound();
  const perf = new PerfMeter(stage.renderer);
  window.addEventListener('pointerdown', () => sound.unlock(), { once: true });
  const controls = new Controls();
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const toGround = (cx: number, cy: number): { x: number; z: number } | null => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), stage.camera);
    if (!ray.ray.intersectPlane(ground, hit)) return null;
    return { x: hit.x, z: hit.z };
  };
  // Tropas na tela: o toque mira no que está desenhado (posição suavizada), no meio do corpo.
  const proj = new THREE.Vector3();
  const onScreen = (x: number, y: number, z: number): { x: number; y: number } | null => {
    proj.set(x, y, z).project(stage.camera);
    if (proj.z > 1) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((proj.x + 1) / 2) * r.width, y: r.top + ((1 - proj.y) / 2) * r.height };
  };
  const unitsOnScreen = (): { id: number; kind: UnitKind; x: number; y: number }[] => {
    const out: { id: number; kind: UnitKind; x: number; y: number }[] = [];
    for (const u of session.world.units) {
      if (u.dead || u.inside >= 0) continue;
      const p = view.unitPos(u.id);
      const s = onScreen(p ? p.x : u.x, u.kind === 'robo' ? 1.3 : 0.85, p ? p.z : u.z);
      if (s) out.push({ id: u.id, kind: u.kind, x: s.x, y: s.y });
    }
    return out;
  };
  const pickUnit = (cx: number, cy: number) => {
    let best: { id: number; kind: UnitKind } | null = null;
    let bd = Infinity;
    for (const u of unitsOnScreen()) {
      const d = Math.hypot(u.x - cx, u.y - cy);
      if (d < (u.kind === 'robo' ? 34 : 26) && d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  };
  /** Trabalhador mais perto do toque na tela (vivo e à vista). */
  const pickWorker = (cx: number, cy: number): { id: number; d: number } | null => {
    let best: { id: number; d: number } | null = null;
    for (const k of session.world.workers) {
      if (k.state === 'dead') continue;
      const p = view.workerPosition(k.id);
      if (!p || !view.workerVisible(k.id)) continue;
      const s = onScreen(p.x, 0.85, p.z);
      if (!s) continue;
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < 26 && (!best || d < best.d)) best = { id: k.id, d };
    }
    return best;
  };
  let lastTap: { id: number; t: number } | null = null;
  // Altura de cada coisa (m), para o toque acertar o teto e não o chão atrás dele.
  const HEIGHT: Record<string, number> = { torre: 4.4, gerador: 3.2, refinaria: 4.4, quartel: 2.6, fabrica: 4, fortim: 1.8 };
  const pickSolid = (cx: number, cy: number): { tower?: Tower; building?: Building; wall?: { x: number; z: number } } | null => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), stage.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    if (d.y >= -1e-4) return null;
    const w = session.world;
    const size = w.gridSize;
    const half = size / 2;
    const byCell = new Map<number, Building>();
    for (const b of w.buildings) for (const c of b.cells) byCell.set(c, b);
    const wallK = new Map<number, number>();
    w.wallCells.forEach((c, k) => wallK.set(c, k));
    // Desce o raio de 6 m até o chão em passos de 15 cm; o primeiro sólido que encontrar vale.
    for (let y = 6; y >= 0; y -= 0.15) {
      const t = (y - o.y) / d.y;
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      for (const tw of w.towers) {
        if (!tw.built || tw.buildingId >= 0) continue;
        if (y <= 6 && Math.hypot(x - tw.x, z - tw.z) < 1.4) return { tower: tw };
      }
      const c = Math.floor(z + half) * size + Math.floor(x + half);
      const b = byCell.get(c);
      if (b && y <= (HEIGHT[b.kind] ?? 3)) return { building: b };
      const k = wallK.get(c);
      if (k !== undefined && y <= (w.wallTerrain[k] === RUBBLE ? 0.5 : 3.4)) return { wall: { x, z } };
    }
    return null;
  };
  const enterFort = (b: Building) => {
    session.garrison(controls.unitIds(), b.id);
    const d = doorOf(b);
    controls.ping(d, 'move');
  };
  const orderTo = (p: { x: number; z: number }) => {
    session.order(controls.unitIds(), p);
    controls.ping(p, 'move');
  };
  cam.onTap = (cx, cy, add) => {
    const p = toGround(cx, cy);
    if (controls.building) {
      if (p && controls.tool && !controls.isLineTool()) controls.setPending({ tool: controls.tool, a: p, b: null, dragging: false });
      return;
    }
    // Trabalhador mais perto que a tropa mais perto: escolhe o trabalhador (painel com Voltar).
    const wk = pickWorker(cx, cy);
    const u = pickUnit(cx, cy);
    const ud = u ? (() => { const q = unitsOnScreen().find((x) => x.id === u.id); return q ? Math.hypot(q.x - cx, q.y - cy) : Infinity; })() : Infinity;
    if (wk && wk.d < ud) {
      lastTap = null;
      return controls.select({ type: 'worker', id: wk.id });
    }
    // Tropa: escolhe. Dois toques seguidos na mesma: todas daquele tipo na tela.
    if (u) {
      const t = performance.now();
      if (lastTap && lastTap.id === u.id && t - lastTap.t < 400) {
        const r = canvas.getBoundingClientRect();
        const ids = unitsOnScreen()
          .filter((q) => q.kind === u.kind && q.x >= r.left && q.x <= r.right && q.y >= r.top && q.y <= r.bottom)
          .map((q) => q.id);
        controls.select({ type: 'units', ids });
        lastTap = null;
      } else if (add && controls.unitIds().length) {
        // Shift + clique: põe ou tira esta tropa da escolha.
        const ids = controls.unitIds();
        controls.select({ type: 'units', ids: ids.includes(u.id) ? ids.filter((x) => x !== u.id) : [...ids, u.id] });
      } else {
        controls.select({ type: 'units', ids: [u.id] });
        lastTap = { id: u.id, t };
      }
      return;
    }
    lastTap = null;
    // Torre, prédio ou muralha: o raio desce pela altura de cada um (tocar no teto acerta).
    const hit = pickSolid(cx, cy);
    if (hit?.tower) return controls.select({ type: 'tower', slot: hit.tower.slot });
    if (hit?.building) {
      const b = hit.building;
      // Tropas escolhidas + fortim: entrar.
      if (b.kind === 'fortim' && controls.unitIds().length) return enterFort(b);
      return controls.select(b.kind === 'torre' ? { type: 'tower', slot: 100 + b.id } : { type: 'building', id: b.id });
    }
    if (hit?.wall) return controls.select({ type: 'wall', x: hit.wall.x, z: hit.wall.z });
    if (!p) return;
    // Chão: com tropas escolhidas, é a ordem de ir; sem, limpa a escolha.
    if (controls.unitIds().length) orderTo(p);
    else controls.select(null);
  };
  // Clique direito (mouse): manda as tropas escolhidas para lá, mesmo em cima de um prédio (no fortim, entram).
  cam.onAltTap = (cx, cy) => {
    if (!controls.unitIds().length || controls.building) return;
    const hit = pickSolid(cx, cy);
    if (hit?.building?.kind === 'fortim') return enterFort(hit.building);
    const p = toGround(cx, cy);
    if (p) orderTo(p);
  };
  // Caixa de seleção: segurar e arrastar (ou Ctrl/⌘ e arrastar).
  const boxEl = document.createElement('div');
  boxEl.className = 'boxsel';
  boxEl.hidden = true;
  document.body.appendChild(boxEl);
  let box0 = { x: 0, y: 0 };
  const drawBox = (x: number, y: number) => {
    boxEl.style.left = `${Math.min(box0.x, x)}px`;
    boxEl.style.top = `${Math.min(box0.y, y)}px`;
    boxEl.style.width = `${Math.abs(x - box0.x)}px`;
    boxEl.style.height = `${Math.abs(y - box0.y)}px`;
  };
  const onBox = (phase: 'start' | 'move' | 'end' | 'cancel', x: number, y: number, add = false) => {
    if (phase === 'start') {
      box0 = { x, y };
      drawBox(x, y);
      boxEl.hidden = false;
      return;
    }
    if (phase === 'move') return drawBox(x, y);
    boxEl.hidden = true;
    if (phase === 'cancel') return;
    const pad = 8;
    const x0 = Math.min(box0.x, x) - pad;
    const x1 = Math.max(box0.x, x) + pad;
    const y0 = Math.min(box0.y, y) - pad;
    const y1 = Math.max(box0.y, y) + pad;
    const ids = unitsOnScreen()
      .filter((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1)
      .map((q) => q.id);
    // Shift ao soltar: soma à escolha que já havia.
    const keep = add ? controls.unitIds().filter((id) => !ids.includes(id)) : [];
    const all = [...keep, ...ids];
    controls.select(all.length ? { type: 'units', ids: all } : null);
  };
  cam.onBox = onBox;
  // Traçar muralha/portão: um dedo arrasta do começo ao fim; dois dedos mexem a câmera.
  const drawLine = (phase: 'start' | 'move' | 'end', cx: number, cy: number) => {
    const tool = controls.tool;
    if (!tool) return;
    if (phase === 'start') {
      const p = toGround(cx, cy);
      if (p) controls.setPending({ tool, a: p, b: p, dragging: true });
      return;
    }
    const pend = controls.pending;
    if (!pend) return;
    if (phase === 'move') {
      const p = toGround(cx, cy);
      if (p) pend.b = p;
      return;
    }
    if (Number.isNaN(cx)) {
      controls.setPending(null);
      return;
    }
    const p = toGround(cx, cy);
    if (p) pend.b = p;
    controls.setPending({ ...pend, dragging: false });
  };
  controls.on(() => {
    cam.dragTool = controls.building && controls.isLineTool() ? drawLine : null;
    cam.onBox = controls.building ? null : onBox;
  });
  controls.onPing = (p, kind) => view.ping(p.x, p.z, kind);
  const camInfo = () => {
    const h = cam.distance * Math.tan((stage.camera.fov * Math.PI) / 360);
    return { x: cam.target.x, z: cam.target.z, yaw: cam.yaw, halfW: h * stage.camera.aspect, halfD: h / Math.sin(cam.pitch) };
  };
  const jump = (x: number, z: number) => {
    cam.target = { x, z };
  };
  render(<App session={session} sound={sound} labels={labels} controls={controls} camInfo={camInfo} jump={jump} biome={biome} />, ui);

  let last = performance.now();
  let lastDeathAt = performance.now();
  const frame = (dtMs: number) => {
    perf.begin();
    session.frame(dtMs);
    cam.update(dtMs / 1000);
    view.cameraPos.copy(stage.camera.position);
    view.camTarget.set(cam.target.x, cam.target.z);
    view.pixelH = stage.renderer.domElement.height;
    view.update(session.world, session.bugs, session.time, session.alpha, dtMs / 1000, session.snapId);
    stage.renderer.render(stage.scene, stage.camera);
    labels.update(session.world, session.time);
    // Fantasma: o que vai ser construído, ou o pedaço de muralha escolhido (o que sai se demolir).
    const wsel = controls.selected?.type === 'wall' ? controls.selected : null;
    const pend = controls.building ? controls.pending : wsel ? { tool: 'demolir' as const, a: { x: wsel.x, z: wsel.z }, b: null, dragging: false } : null;
    view.setGhost(pend ? planGhost(session.world, pend).cells : null, session.world.gridSize);
    // Tropa que morreu sai da escolha.
    const sel = controls.selected;
    if (sel?.type === 'units') {
      // Quem morreu ou entrou num fortim sai da escolha.
      const alive = sel.ids.filter((id) => session.world.units.some((u) => u.id === id && !u.dead && u.inside < 0));
      if (alive.length !== sel.ids.length) controls.select({ type: 'units', ids: alive });
    }
    // Trabalhador que morreu sai da escolha.
    if (sel?.type === 'worker' && !session.world.workers.some((k) => k.id === sel.id && k.state !== 'dead')) controls.select(null);
    view.setSelection(controls.selected);
    // Morte marcante à vista: a câmera treme de leve.
    for (const d of view.deaths) {
      if (d.at <= lastDeathAt) continue;
      lastDeathAt = d.at;
      const s = onScreen(d.x, 0.5, d.z);
      const r = canvas.getBoundingClientRect();
      if (s && s.x >= r.left && s.x <= r.right && s.y >= r.top && s.y <= r.bottom) cam.shake(0.6);
    }
    perf.extra = `${session.world.bugsAlive} insetos · sim ${session.simMsPerTick.toFixed(2)} ms/tick`;
    perf.end();
  };
  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  if (import.meta.env.DEV) {
    // Para testar com o painel do navegador oculto (o requestAnimationFrame para).
    (window as unknown as Record<string, unknown>).posto = {
      session,
      view,
      cam,
      controls,
      /** Roda n quadros de 1/60 s na mão. */
      frames(n = 1, dtMs = 1000 / 60) {
        for (let i = 0; i < n; i++) frame(dtMs);
      },
      /** Pula `s` segundos de jogo (no worker) e desenha um quadro. */
      async simulate(s: number) {
        await session.simulate(s);
        frame(1000 / 60);
      },
      /** Grava uma captura em reports/snap-<nome>.png (servidor de desenvolvimento). */
      async snap(name: string) {
        frame(1000 / 60);
        const url = stage.renderer.domElement.toDataURL('image/png');
        await fetch(`/__snap?name=${encodeURIComponent(name)}`, { method: 'POST', body: url });
        return url.length;
      },
    };
  }
}
