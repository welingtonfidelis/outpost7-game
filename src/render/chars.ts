/**
 * Personagem do KayKit em cena: clone com esqueleto próprio, mixer de animação, arma na
 * mão direita e (no trabalhador) a mochila no peito. Troca de animação com transição curta.
 */
import * as THREE from 'three';
import { cloneChar, findBone } from './assets.ts';
import type { Art, CharKind } from './assets.ts';

/**
 * Cabeça menor que a do KayKit (Etapa 19, tom mais adulto): o boneco perde a cara de
 * cabeçudo. Aplicado depois da animação a cada quadro.
 */
const HEAD_SCALE = 0.6;

/** Giro da arma no osso da mão (ver o construtor). */
export const GRIP_TURN = Math.PI / 2;

export type Anim = 'Idle_A' | 'Walking_A' | 'Running_A' | 'Pickaxing' | 'Ranged_2H_Shooting' | 'Ranged_2H_Aiming' | 'Death_A';

export class CharView {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Anim, THREE.AnimationAction>();
  private current: Anim | null = null;
  readonly cargo: THREE.Object3D | null = null;
  private head: THREE.Object3D | null;

  constructor(art: Art, kind: CharKind) {
    this.model = cloneChar(art, kind);
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const name of ['Idle_A', 'Walking_A', 'Running_A', 'Pickaxing', 'Ranged_2H_Shooting', 'Ranged_2H_Aiming', 'Death_A'] as Anim[]) {
      const clip = art.clips.get(name);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (name === 'Death_A') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(name, a);
    }
    this.head = findBone(this.model, ['head', 'Head']);
    const hand = findBone(this.model, ['handslotr', 'handslot.r']);
    const weapon = art.weapons[kind];
    if (hand && weapon) {
      const w = weapon.clone(true);
      // As armas do KayKit vêm com o cano em +z; no osso da mão (no tiro de duas mãos) isso
      // aponta para o lado. Um quarto de volta em y põe o cano para a frente (medido no
      // Ranged_2H_Shooting: produto com a frente de 0,02 para 1).
      w.rotation.y = GRIP_TURN;
      hand.add(w);
    }
    if (kind === 'worker' && art.backpack) {
      const chest = findBone(this.model, ['chest']);
      if (chest) {
        const bag = art.backpack.clone(true);
        bag.visible = false;
        // Nas costas: o personagem olha para +z, então a mochila vai para -z do peito.
        bag.position.set(0, 0.2, -0.55);
        chest.add(bag);
        this.cargo = bag;
      }
    }
    // Pequena variação de fase para não andarem todos no mesmo passo.
    this.mixer.setTime(Math.random() * 2);
  }

  private want: Anim | null = null;
  private wantFor = 0;

  /**
   * Pede uma animação. A troca só acontece se o pedido durar um instante (0,15 s): evita o
   * pisca-pisca entre andar e parar quando o movimento oscila. Morte troca na hora.
   */
  play(name: Anim, speed = 1): void {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = speed;
    if (this.current === name) {
      this.want = null;
      return;
    }
    if (this.current && name !== 'Death_A') {
      if (this.want !== name) {
        this.want = name;
        this.wantFor = 0;
        return;
      }
      if (this.wantFor < 0.15) return;
    }
    this.want = null;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    a.reset();
    a.play();
    if (prev) a.crossFadeFrom(prev, name === 'Death_A' ? 0.1 : 0.2, false);
    this.current = name;
  }

  update(dt: number): void {
    this.wantFor += dt;
    this.mixer.update(dt);
    this.head?.scale.setScalar(HEAD_SCALE);
  }

  dispose(): void {
    this.mixer.stopAllAction();
  }
}
