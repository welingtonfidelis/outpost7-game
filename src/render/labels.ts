/**
 * Rótulos sobre os trabalhadores (Etapa 16): o tempo de volta comparado com o que falta para a
 * horda chegar (verde com folga, âmbar no limite, vermelho "não chega" com a chance que ele
 * teria se fosse chamado agora), a chance na rolagem durante o pânico e o resultado dela.
 */
import * as THREE from 'three';
import { isSafe, projectedChance, returnTime, timeLeft } from '../sim/index.ts';
import type { WorldView } from '../sim/index.ts';
import type { World3D } from './world3d.ts';

export class Labels {
  private pool: HTMLDivElement[] = [];
  private outcomes = new Map<number, { text: string; bad: boolean; until: number }>();
  private v = new THREE.Vector3();
  private el: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private view: World3D;

  constructor(el: HTMLElement, camera: THREE.PerspectiveCamera, view: World3D) {
    this.el = el;
    this.camera = camera;
    this.view = view;
  }

  outcome(id: number, text: string, bad: boolean, until: number): void {
    this.outcomes.set(id, { text, bad, until });
  }

  clear(): void {
    this.outcomes.clear();
  }

  update(w: WorldView, t: number): void {
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    const left = timeLeft(w);
    const margin = w.cfg.recallMargin;
    let used = 0;
    const show = (p: THREE.Vector3, text: string, cls: string) => {
      this.v.set(p.x, 2.35, p.z).project(this.camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) return;
      let d = this.pool[used];
      if (!d) {
        d = document.createElement('div');
        this.el.appendChild(d);
        this.pool.push(d);
      }
      used++;
      const x = (this.v.x * 0.5 + 0.5) * W;
      const y = (-this.v.y * 0.5 + 0.5) * H;
      if (d.textContent !== text) d.textContent = text;
      if (d.className !== cls) d.className = cls;
      d.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      d.style.display = '';
    };
    for (const k of w.workers) {
      const p = this.view.workerPosition(k.id);
      if (!p) continue;
      const o = this.outcomes.get(k.id);
      if (o && t < o.until) {
        show(p, o.text, `pill out${o.bad ? ' bad' : ''}`);
        continue;
      }
      if (o) this.outcomes.delete(k.id);
      if (k.state === 'dead') continue;
      if (k.state === 'panic' && k.panic) {
        const pct = Math.round(k.panic.chance * 100);
        show(p, `${pct}%`, pct === 0 ? 'pill zero' : pct < 35 ? 'pill low' : pct < 70 ? 'pill mid' : 'pill');
        continue;
      }
      if ((w.phase !== 'warning' && w.phase !== 'calm') || isSafe(w.cfg, k)) continue;
      const rt = returnTime(w, k);
      const s = Math.ceil(rt);
      // Na calma, só quem já está perto do limite (para não poluir a tela).
      if (w.phase === 'calm' && rt <= left - margin - 10) continue;
      if (rt > left) {
        const pct = Math.round(projectedChance(w, k) * 100);
        show(p, `não chega · ${pct}%`, pct === 0 ? 'pill zero' : 'pill low');
      } else if (rt > left - margin) show(p, w.phase === 'calm' && !k.hold && k.state !== 'returning' ? `chamar · ${s} s` : `${s} s`, 'pill mid');
      else show(p, `${s} s`, 'pill');
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]!.style.display = 'none';
  }
}
