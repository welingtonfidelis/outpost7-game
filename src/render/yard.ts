/**
 * Enfeites do pátio (Etapa 18): pilhas de caixas, barris de combustível, pallets, cargas e
 * postes de luz do KayKit (CC0) encostados na muralha, longe das trilhas dos portões e dos
 * lugares onde os trabalhadores esperam. Só visual: a simulação não sabe deles. Um grupo
 * some quando o jogador constrói um prédio por cima.
 */
import * as THREE from 'three';
import { cloneProp } from './assets.ts';
import type { Art, PropKind } from './assets.ts';
import type { Building } from '../sim/index.ts';

interface Item {
  kind: PropKind;
  /** Maior lado no chão (m). */
  foot: number;
  dx: number;
  dz: number;
  rot?: number;
  /** Empilha em cima do item de índice `on` deste grupo. */
  on?: number;
}

interface Cluster {
  x: number;
  z: number;
  /** Meio lado da área ocupada (para sumir sob um prédio). */
  r: number;
  items: Item[];
}

const CLUSTERS: Cluster[] = [
  {
    x: -9.1,
    z: -4.4,
    r: 1.4,
    items: [
      { kind: 'crateL', foot: 1.4, dx: 0, dz: 0, rot: Math.PI / 2 },
      { kind: 'crateM', foot: 0.95, dx: 0.05, dz: 0.05, rot: Math.PI / 2 + 0.2, on: 0 },
      { kind: 'crateS', foot: 0.7, dx: 0.2, dz: -1.05, rot: 0.4 },
    ],
  },
  {
    x: -4.3,
    z: -9.2,
    r: 1.5,
    items: [
      { kind: 'fuelA', foot: 1.3, dx: -0.7, dz: 0 },
      { kind: 'fuelB', foot: 1.3, dx: 0.75, dz: 0.1, rot: 0.6 },
    ],
  },
  { x: 9.0, z: -4.4, r: 1.3, items: [{ kind: 'cargoStack', foot: 2.1, dx: 0, dz: 0, rot: Math.PI / 2 }] },
  {
    x: 4.4,
    z: 9.2,
    r: 1.4,
    items: [
      { kind: 'pallet', foot: 1.35, dx: 0, dz: 0 },
      { kind: 'crateS', foot: 0.7, dx: 1.1, dz: 0.15, rot: -0.3 },
      { kind: 'crateM', foot: 0.9, dx: 1.05, dz: 0.1, rot: -0.2, on: 1 },
    ],
  },
  { x: -9.1, z: 4.5, r: 1.3, items: [{ kind: 'tanks', foot: 2.0, dx: 0, dz: 0, rot: Math.PI / 2 }] },
  {
    x: 9.1,
    z: 4.5,
    r: 1.4,
    items: [
      { kind: 'fuelC', foot: 1.3, dx: 0, dz: -0.55, rot: 1.2 },
      { kind: 'cargoPack', foot: 1.2, dx: 0.05, dz: 0.8, rot: Math.PI / 2 },
    ],
  },
  { x: -4.3, z: 9.3, r: 1.1, items: [{ kind: 'crateL', foot: 1.4, dx: 0, dz: 0, rot: 0.1 }, { kind: 'crateS', foot: 0.7, dx: 0.1, dz: 0, rot: 0.5, on: 0 }] },
  { x: 4.4, z: -9.3, r: 1.0, items: [{ kind: 'fuelA', foot: 1.3, dx: 0, dz: 0, rot: 2.2 }] },
];

/** Postes de holofote junto dos baluartes, virados para o centro do pátio. */
const FLOODS: [number, number][] = [
  [-8.9, -8.9],
  [8.9, -8.9],
  [8.9, 8.9],
  [-8.9, 8.9],
];

const floodMats = {
  pole: new THREE.MeshLambertMaterial({ color: '#4a4f54' }),
  housing: new THREE.MeshLambertMaterial({ color: '#2f3337' }),
  glow: new THREE.MeshBasicMaterial({ color: '#fff3c4' }),
};

/** Poste de 4,6 m com travessa e dois holofotes inclinados para +x. */
function floodlight(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.6, 6), floodMats.pole);
  pole.position.y = 2.3;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.25, 8), floodMats.pole);
  foot.position.y = 0.125;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.0), floodMats.pole);
  bar.position.set(0.05, 4.55, 0);
  g.add(pole, foot, bar);
  for (const z of [-0.36, 0.36]) {
    const lamp = new THREE.Group();
    lamp.position.set(0.16, 4.5, z);
    lamp.rotation.z = -0.55;
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.32), floodMats.housing);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.26), floodMats.glow);
    face.position.x = 0.12;
    lamp.add(h, face);
    g.add(lamp);
  }
  return g;
}

export class YardDecor {
  readonly root = new THREE.Group();
  private groups: { c: Cluster; g: THREE.Group }[] = [];
  private seen = '';

  constructor(art: Art) {
    for (const c of CLUSTERS) {
      const g = new THREE.Group();
      g.position.set(c.x, 0.12, c.z);
      const tops: number[] = [];
      c.items.forEach((it, i) => {
        const p = art.props[it.kind];
        const o = cloneProp(art, it.kind, it.foot);
        const s = it.foot / Math.max(p.size.x, p.size.z, 0.001);
        const y = it.on !== undefined ? tops[it.on] ?? 0 : 0;
        o.position.set(it.dx, y, it.dz);
        o.rotation.y = it.rot ?? 0;
        tops[i] = y + p.size.y * s;
        g.add(o);
      });
      this.root.add(g);
      this.groups.push({ c, g });
    }
    for (const [x, z] of FLOODS) {
      const f = floodlight();
      f.position.set(x, 0.12, z);
      // A cabeça (+x) olha para o centro.
      f.rotation.y = Math.atan2(z, -x);
      this.root.add(f);
      this.groups.push({ c: { x, z, r: 0.4, items: [] }, g: f });
    }
  }

  /** Esconde o que ficou embaixo de um prédio. */
  sync(buildings: Building[]): void {
    const key = buildings.map((b) => `${b.id}:${b.x}:${b.z}`).join('|');
    if (key === this.seen) return;
    this.seen = key;
    for (const { c, g } of this.groups) {
      g.visible = !buildings.some((b) => Math.abs(b.x - c.x) < b.size / 2 + c.r && Math.abs(b.z - c.z) < b.size / 2 + c.r);
    }
  }
}
