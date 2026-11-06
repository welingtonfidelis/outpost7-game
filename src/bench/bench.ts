/**
 * Etapa 0: quantos insetos este aparelho desenha a 60 fps? Usa o mesmo enxame do jogo
 * (BugSwarm, mesmo shader e mesma cena) e mede cada nível de detalhe com 1 a 32 mil.
 * Abrir com ?bench. O resultado fica na tela (o envio do celular pode não chegar ao Mac).
 */
import { BugSwarm, FLOATS_PER_BUG } from '../render/bugs.ts';
import type { BugDetail } from '../render/bugMesh.ts';
import { RtsCamera } from '../render/rtsCamera.ts';
import { createStage, FOG } from '../render/stage.ts';

const NS = [1000, 2000, 4000, 8000, 16000, 32000];
const MAX = NS[NS.length - 1]!;
const WARM_MS = 1200;
const MEASURE_MS = 3000;

interface Row {
  lod: BugDetail;
  tris: number;
  n: number;
  fps: number;
  p95: number;
}

export function startBench(canvas: HTMLCanvasElement, root: HTMLElement): void {
  const stage = createStage(canvas);
  const cam = new RtsCamera(stage.camera, canvas);
  const swarm = new BugSwarm(stage.scene, MAX, FOG);
  const ang = new Float32Array(MAX);
  const rad = new Float32Array(MAX);
  const spd = new Float32Array(MAX);
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < MAX; i++) {
    ang[i] = rnd() * Math.PI * 2;
    rad[i] = 14 + Math.sqrt(rnd()) * 70;
    spd[i] = 0.8 + rnd() * 0.6;
    swarm.set(i, 0, 0, 0, rnd() * 6.28, 1 + rnd() * 0.35, 0.8 + rnd() * 0.5, rnd(), 0);
  }

  const gl = stage.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));

  root.innerHTML = `
    <div class="bench">
      <h1>Etapa 0 · medição do enxame</h1>
      <p class="bench-info"></p>
      <div class="bench-row">
        <button data-act="run">Rodar teste (~1 min)</button>
        <button data-act="minus">− insetos</button>
        <button data-act="plus">+ insetos</button>
        <button data-act="lod">Detalhe</button>
      </div>
      <p class="bench-live"></p>
      <p class="bench-summary"></p>
      <table class="bench-table"><thead><tr><th>Detalhe</th><th>Insetos</th><th>fps</th><th>p95 ms</th></tr></thead><tbody></tbody></table>
      <p class="bench-hint">Deixe o aparelho fora do Modo de Pouca Energia e com a tela ligada. Ao terminar, me diga a linha do resumo (ou mande um print).</p>
    </div>`;
  const $ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const info = $('.bench-info');
  const live = $('.bench-live');
  const summary = $('.bench-summary');
  const tbody = $('tbody');
  const dpr = stage.renderer.getPixelRatio();
  info.textContent = `${gpu} · tela ${innerWidth}×${innerHeight} @${devicePixelRatio} · DPR usado ${dpr} · triângulos por inseto ${swarm.triangles.join(' / ')}`;

  let n = 4000;
  let frames: number[] = [];
  let last = performance.now();
  let t = 0;
  // Sequência automática.
  let queue: { lod: BugDetail; n: number }[] = [];
  let stepStart = 0;
  let measuring = false;
  const rows: Row[] = [];

  const startStep = () => {
    const s = queue[0];
    if (!s) {
      finish();
      return;
    }
    n = s.n;
    swarm.setDetail(s.lod);
    frames = [];
    measuring = false;
    stepStart = performance.now();
  };

  const finish = () => {
    const best = ([0, 1, 2] as BugDetail[]).map((lod) => {
      const ok = rows.filter((r) => r.lod === lod && r.fps >= 57);
      return ok.length ? Math.max(...ok.map((r) => r.n)) : 0;
    });
    const low = rows.length && rows[0]!.fps < 33 && rows[0]!.n <= 2000;
    summary.textContent =
      `Resumo: a 60 fps, detalhe alto ${best[0]! / 1000} mil · médio ${best[1]! / 1000} mil · baixo ${best[2]! / 1000} mil` +
      (low ? ' · fps travado perto de 30: Modo de Pouca Energia?' : '');
    try {
      const body = JSON.stringify({ label: 'bench', fps: 0, p95: 0, gpu, dpr, screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, rows, best });
      if (!navigator.sendBeacon?.('/__perf', new Blob([body], { type: 'text/plain' }))) void fetch('/__perf', { method: 'POST', body });
    } catch {
      // sem servidor de desenvolvimento: tudo bem, o resumo está na tela
    }
  };

  root.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).dataset.act;
    if (act === 'run') {
      rows.length = 0;
      tbody.innerHTML = '';
      summary.textContent = 'Medindo…';
      queue = [];
      for (const lod of [0, 1, 2] as BugDetail[]) for (const k of NS) queue.push({ lod, n: k });
      startStep();
    } else if (act === 'plus') n = Math.min(MAX, n * 2);
    else if (act === 'minus') n = Math.max(500, Math.floor(n / 2));
    else if (act === 'lod') swarm.setDetail(((swarm.getDetail() + 1) % 3) as BugDetail);
  });

  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    const frameMs = now - last;
    last = now;
    t += dt;
    for (let i = 0; i < n; i++) {
      const a = (ang[i]! += spd[i]! * dt * 0.05);
      const o = i * FLOATS_PER_BUG;
      swarm.data[o] = Math.cos(a) * rad[i]!;
      swarm.data[o + 1] = Math.sin(a) * rad[i]!;
      swarm.data[o + 2] = a + Math.PI / 2;
    }
    swarm.upload(n, t);
    cam.update(dt);
    stage.renderer.render(stage.scene, stage.camera);

    if (frameMs < 250) frames.push(frameMs);
    if (frames.length > 240 && !queue.length) frames.shift();
    if (queue.length) {
      const el = now - stepStart;
      if (!measuring && el > WARM_MS) {
        measuring = true;
        frames = [];
      } else if (measuring && el > WARM_MS + MEASURE_MS) {
        const s = queue.shift()!;
        const f = [...frames].sort((a, b) => a - b);
        const avg = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length);
        const row: Row = { lod: s.lod, tris: swarm.triangles[s.lod]!, n: s.n, fps: 1000 / avg, p95: f[Math.floor(f.length * 0.95)] ?? 0 };
        rows.push(row);
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${['alto', 'médio', 'baixo'][s.lod]} (${row.tris})</td><td>${s.n}</td><td>${row.fps.toFixed(0)}</td><td>${row.p95.toFixed(1)}</td>`;
        tbody.appendChild(tr);
        // Abaixo de 30 fps não adianta subir mais neste nível.
        if (row.fps < 30) queue = queue.filter((q) => q.lod !== s.lod);
        startStep();
      }
    }
    if (frames.length > 10 && Math.floor(now / 400) !== Math.floor((now - frameMs) / 400)) {
      const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
      live.textContent = `${n} insetos · detalhe ${['alto', 'médio', 'baixo'][swarm.getDetail()]} · ${(1000 / avg).toFixed(0)} fps${queue.length ? ` · faltam ${queue.length} passos` : ''}`;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
