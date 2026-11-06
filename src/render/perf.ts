/**
 * Medidor de desempenho (?perf ou ?perf=rotulo): FPS, tempo de quadro (média e p95), chamadas de
 * desenho e triângulos. Mostra no canto e, no servidor de desenvolvimento, manda o resumo para
 * /__perf a cada 15 s (o vite.config grava em reports/perf.jsonl).
 */
import type * as THREE from 'three';

export interface PerfStats {
  fps: number;
  avg: number;
  p95: number;
  cpu: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export class PerfMeter {
  readonly enabled: boolean;
  private label: string;
  private frames: number[] = [];
  private cpu: number[] = [];
  private last = 0;
  private start = 0;
  private el: HTMLDivElement | null = null;
  private lastShow = 0;
  private lastSend = 0;
  private sent = 0;
  private status = 'medindo…';
  /** Texto a mais no fim da linha (ex.: custo da simulação). */
  extra = '';

  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    const p = new URLSearchParams(location.search);
    this.enabled = p.has('perf');
    this.label = p.get('perf') || '';
    if (this.enabled) {
      this.el = document.createElement('div');
      this.el.className = 'perf';
      document.body.appendChild(this.el);
    }
  }

  begin(): void {
    const now = performance.now();
    if (this.last) {
      const dt = now - this.last;
      // Aba em segundo plano dá quadros enormes; não contam.
      if (dt < 250) this.frames.push(dt);
      if (this.frames.length > 600) this.frames.shift();
    }
    this.last = now;
    this.start = now;
  }

  end(): void {
    this.cpu.push(performance.now() - this.start);
    if (this.cpu.length > 600) this.cpu.shift();
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.lastShow > 500) {
      this.lastShow = now;
      const s = this.stats();
      this.el!.textContent = `${s.fps.toFixed(0)} fps · p95 ${s.p95.toFixed(1)} ms · cpu ${s.cpu.toFixed(1)} ms · ${s.calls} draws · ${(s.triangles / 1000).toFixed(1)}k tri · dpr ${this.renderer.getPixelRatio().toFixed(2)} · ${this.status}${this.extra ? ' · ' + this.extra : ''}`;
    }
    // Primeiro envio com 8 s de medição; depois, a cada 15 s.
    const wait = this.sent === 0 ? 8000 : 15000;
    if (now - this.lastSend > wait && this.frames.length > 120 && this.sent < 40) {
      this.lastSend = now;
      this.sent++;
      void this.send();
    }
  }

  stats(): PerfStats {
    const f = [...this.frames].sort((a, b) => a - b);
    const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
    const p95 = f.length ? f[Math.floor(f.length * 0.95)]! : 0;
    const cpu = this.cpu.length ? this.cpu.reduce((a, b) => a + b, 0) / this.cpu.length : 0;
    const info = this.renderer.info;
    return {
      fps: avg ? 1000 / avg : 0,
      avg,
      p95,
      cpu,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  private gpu(): string {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    } catch {
      return '?';
    }
  }

  private async send(): Promise<void> {
    if (!import.meta.env.DEV) return;
    const s = this.stats();
    const body = {
      label: this.label,
      ...s,
      dpr: this.renderer.getPixelRatio(),
      screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
      canvas: `${this.renderer.domElement.width}x${this.renderer.domElement.height}`,
      gpu: this.gpu(),
      shadows: this.renderer.shadowMap.enabled,
    };
    const text = JSON.stringify(body);
    try {
      // sendBeacon é o mais confiável no Safari do iPhone; fetch fica de reserva.
      const ok = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/__perf', new Blob([text], { type: 'text/plain' }));
      if (!ok) {
        const r = await fetch('/__perf', { method: 'POST', body: text });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      }
      this.status = `enviado ${this.sent}×`;
    } catch (e) {
      this.status = `envio falhou: ${(e as Error).message}`;
    }
  }
}
