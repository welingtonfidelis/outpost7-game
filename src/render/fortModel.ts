/**
 * Modelo do fortim (Etapa 14), feito por código: a Space Base do KayKit não tem bunker, e os
 * módulos octogonais dela já são o quartel e a fábrica. Casamata baixa e octogonal de
 * concreto, faixa escura de seteiras, teto com escotilha, faixa do time, porta em +x, sacos de
 * areia em volta (abertos na porta) e uma luz por vaga no teto.
 */
import * as THREE from 'three';

export interface FortModel {
  root: THREE.Group;
  /** Uma por vaga; a tela acende as ocupadas. */
  lamps: THREE.Mesh[];
}

const shared = {
  concrete: new THREE.MeshLambertMaterial({ color: '#8c8e8a' }),
  roof: new THREE.MeshLambertMaterial({ color: '#a5a7a2' }),
  slit: new THREE.MeshLambertMaterial({ color: '#17191c' }),
  team: new THREE.MeshLambertMaterial({ color: '#ff8a1f' }),
  bag: new THREE.MeshLambertMaterial({ color: '#b39869' }),
  hatch: new THREE.MeshLambertMaterial({ color: '#3a3d40' }),
  lampOff: new THREE.MeshBasicMaterial({ color: '#2e3a2c' }),
  lampOn: new THREE.MeshBasicMaterial({ color: '#7dff8a' }),
  lampWorker: new THREE.MeshBasicMaterial({ color: '#ffb020' }),
};

/** Verde: soldado dentro; âmbar: trabalhador abrigado. */
export const FORT_LAMP = { on: shared.lampOn, off: shared.lampOff, worker: shared.lampWorker };

/** `size`: lado da planta (m). `slots`: quantas luzes de vaga. */
export function makeFortModel(size: number, slots: number): FortModel {
  const root = new THREE.Group();
  const r = size / 2;
  const oct = (rt: number, rb: number, h: number, y: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), mat);
    m.position.y = y;
    // Uma face do octógono virada para +x (a porta).
    m.rotation.y = Math.PI / 8;
    root.add(m);
    return m;
  };
  // Corpo inclinado, faixa do time embaixo, seteiras no alto, teto e escotilha.
  oct(r * 0.86, r, 1.15, 0.575, shared.concrete);
  oct(r * 0.985, r * 0.995, 0.12, 0.24, shared.team);
  // Seteiras: um pouco para fora da parede inclinada (que ali tem raio de ~0,9 r).
  oct(r * 0.93, r * 0.93, 0.17, 0.86, shared.slit);
  oct(r * 0.62, r * 0.88, 0.36, 1.33, shared.roof);
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.14, 10), shared.hatch);
  hatch.position.set(0, 1.58, 0);
  root.add(hatch);
  // Porta em +x.
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.7), shared.slit);
  door.position.set(r * 0.93, 0.42, 0);
  door.rotation.z = 0.12;
  root.add(door);
  // Sacos de areia num anel, abertos na porta.
  const bagGeo = new THREE.CapsuleGeometry(0.17, 0.34, 3, 6);
  const ringR = r + 0.45;
  const nBags = 16;
  for (let i = 0; i < nBags; i++) {
    const a = (i / nBags) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.45) continue;
    for (let layer = 0; layer < 2; layer++) {
      const b = new THREE.Mesh(bagGeo, shared.bag);
      const off = layer ? Math.PI / nBags : 0;
      b.position.set(Math.cos(a + off) * ringR, 0.14 + layer * 0.24, -Math.sin(a + off) * ringR);
      // Deitado e de lado para o fortim (ao longo do anel).
      b.rotation.set(0, a + off + Math.PI / 2, Math.PI / 2);
      b.scale.set(1, 1, 0.75);
      root.add(b);
    }
  }
  // Luzes de vaga num anel no teto.
  const lamps: THREE.Mesh[] = [];
  const lampGeo = new THREE.BoxGeometry(0.16, 0.1, 0.16);
  for (let i = 0; i < slots; i++) {
    const a = (i / slots) * Math.PI * 2 + Math.PI / slots;
    const m = new THREE.Mesh(lampGeo, shared.lampOff);
    m.position.set(Math.cos(a) * 0.62, 1.55, Math.sin(a) * 0.62);
    root.add(m);
    lamps.push(m);
  }
  return { root, lamps };
}
