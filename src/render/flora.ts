/**
 * Flora do bioma (Etapa 19): árvores, arbustos, pedras e capim do Forest Nature Pack do
 * KayKit (CC0), instanciados (poucas chamadas de desenho). No gelo, as faces viradas para
 * cima ganham neve no shader. Só visual: a simulação não sabe deles. Nada nasce perto da base,
 * das jazidas nem do caminho até elas, e o que fica embaixo de um prédio some.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Biome } from './biome.ts';
import type { Building, ResourceNode } from '../sim/index.ts';

type Model = { meshes: { geo: THREE.BufferGeometry; mat: THREE.Material; local: THREE.Matrix4 }[]; size: THREE.Vector3; base: number };

export interface FloraArt {
  models: Map<string, Model>;
}

/**
 * O que cada bioma usa: arquivos, quantos, altura mínima e máxima, raio para sumir, distância
 * mínima da base e tamanho da sombra. Orçamento: até ~350 mil triângulos (a floresta), para
 * caber junto com o enxame no iPhone.
 */
type Spec = { files: string[]; count: number; hMin: number; hMax: number; r: number; near?: number; shadow?: number };

function specs(b: Biome): Spec[] {
  // Só as coníferas (altas e finas): as copas redondas do pacote têm cara de brinquedo.
  const trees = (c: number) => [4, 6].map((n) => `Tree_${n}_A_Color${c}`);
  const rocks = [1, 2, 3, 4, 5, 6].map((n) => `Rock_${n}_A_Color1`);
  const bare = ['Tree_Bare_1_A_Color1', 'Tree_Bare_2_A_Color1'];
  if (b.id === 'floresta')
    return [
      { files: trees(2), count: 440, hMin: 5, hMax: 10, r: 1.6, near: 30, shadow: 2.6 },
      { files: bare, count: 40, hMin: 4, hMax: 7, r: 1, near: 30, shadow: 1.6 },
      { files: ['Bush_3_A_Color2'], count: 160, hMin: 0.5, hMax: 1.0, r: 0.9, near: 20 },
      { files: rocks, count: 80, hMin: 0.6, hMax: 2.2, r: 1.2, near: 22 },
      { files: ['Grass_1_A_Color2', 'Grass_2_A_Color2'], count: 1200, hMin: 0.45, hMax: 0.9, r: 0.3, near: 16 },
    ];
  if (b.id === 'gelo')
    return [
      { files: trees(4), count: 360, hMin: 4.5, hMax: 9, r: 1.5, near: 32, shadow: 2.2 },
      { files: bare, count: 60, hMin: 3.5, hMax: 6.5, r: 1, near: 30, shadow: 1.4 },
      { files: rocks, count: 140, hMin: 0.8, hMax: 3.2, r: 1.4, near: 22 },
    ];
  return [{ files: bare, count: 34, hMin: 3, hMax: 5.5, r: 1, near: 34, shadow: 1.4 }];
}

const loader = new GLTFLoader();
const matCache = new Map<string, THREE.Material>();

/** Lambert (mais barato) com o mesmo mapa; no gelo, neve nas faces de cima. */
function convert(m: THREE.Material, snow: boolean): THREE.Material {
  const key = m.uuid + (snow ? 's' : '');
  const hit = matCache.get(key);
  if (hit) return hit;
  const src = m as THREE.MeshStandardMaterial;
  const lam = new THREE.MeshLambertMaterial({ map: src.map ?? null, color: src.color ?? new THREE.Color('#ffffff'), side: src.side });
  if (snow) {
    lam.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSnowN;')
        .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvSnowN = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSnowN;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
float sn = smoothstep(0.3, 0.65, normalize(vSnowN).y);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.97), sn * 0.88);`,
        );
    };
    lam.customProgramCacheKey = () => 'neve';
  }
  matCache.set(key, lam);
  return lam;
}

export async function loadFlora(base: string, b: Biome): Promise<FloraArt> {
  const names = [...new Set(specs(b).flatMap((s) => s.files))];
  const snow = b.id === 'gelo';
  const models = new Map<string, Model>();
  await Promise.all(
    names.map(async (n) => {
      const g = await loader.loadAsync(`${base}forest/${n}.gltf`);
      g.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g.scene);
      const meshes: Model['meshes'] = [];
      g.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          meshes.push({ geo: o.geometry, mat: convert(mats[0]!, snow), local: o.matrixWorld.clone() });
        }
      });
      models.set(n, { meshes, size: box.getSize(new THREE.Vector3()), base: box.min.y });
    }),
  );
  return { models };
}

function blobTex(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

interface Spot {
  x: number;
  z: number;
  r: number;
  /** (malha instanciada, índice, matriz) de cada pedaço deste item. */
  parts: { mesh: THREE.InstancedMesh; i: number; m: THREE.Matrix4 }[];
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Flora {
  readonly root = new THREE.Group();
  private spots: Spot[] = [];
  private seen = '';

  constructor(art: FloraArt, b: Biome, seed: number, nodes: ResourceNode[]) {
    let s = (seed ^ 0x9e3779b9) >>> 0;
    const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false });
    const all = specs(b);
    const nShadow = all.reduce((t, sp) => t + (sp.shadow ? sp.count : 0), 0);
    const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, Math.max(1, nShadow));
    shadows.count = 0;
    this.root.add(shadows);
    // Caminhos da base até cada jazida (os trabalhadores andam por ali).
    const clear = (x: number, z: number, rad: number) => {
      for (const n of nodes) {
        if (Math.hypot(n.x - x, n.z - z) < 6 + rad) return false;
        const len = Math.hypot(n.x, n.z) || 1;
        const t = Math.max(0, Math.min(1, (x * n.x + z * n.z) / (len * len)));
        if (Math.hypot(x - n.x * t, z - n.z * t) < 3.5 + rad) return false;
      }
      return true;
    };
    const tmp = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const sp of all) {
      const models = sp.files.map((f) => art.models.get(f)!).filter(Boolean);
      // Uma malha instanciada por pedaço de cada modelo.
      const inst = models.map((m) =>
        m.meshes.map((p) => {
          const im = new THREE.InstancedMesh(p.geo, p.mat, sp.count);
          im.count = 0;
          this.root.add(im);
          return im;
        }),
      );
      for (let k = 0, tries = 0; k < sp.count && tries < sp.count * 6; tries++) {
        const a = r() * Math.PI * 2;
        // Mais denso longe (o perto fica limpo para ver o enxame).
        const d = (sp.near ?? 30) + Math.pow(r(), 0.9) * (230 - (sp.near ?? 30));
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (!clear(x, z, sp.r)) continue;
        // Moitas: as árvores nascem em grupos (mais vazio entre eles).
        if (sp.shadow && Math.sin(x * 0.045) * Math.sin(z * 0.05 + 1.3) < -0.25 && r() < 0.75) continue;
        const mi = Math.floor(r() * models.length);
        const m = models[mi]!;
        const h = sp.hMin + r() * (sp.hMax - sp.hMin);
        const sc = h / Math.max(0.01, m.size.y);
        q.setFromAxisAngle(up, r() * Math.PI * 2);
        tmp.compose(new THREE.Vector3(x, -m.base * sc, z), q, new THREE.Vector3(sc, sc * (0.9 + r() * 0.2), sc));
        const parts: Spot['parts'] = [];
        m.meshes.forEach((p, pi) => {
          const im = inst[mi]![pi]!;
          const mat = tmp.clone().multiply(p.local);
          const i = im.count++;
          im.setMatrixAt(i, mat);
          parts.push({ mesh: im, i, m: mat });
        });
        if (sp.shadow) {
          const w = sp.shadow * (h / sp.hMax + 0.4);
          const sm = new THREE.Matrix4().compose(new THREE.Vector3(x + 0.4, 0.03, z + 0.3), new THREE.Quaternion(), new THREE.Vector3(w, 1, w));
          const i = shadows.count++;
          shadows.setMatrixAt(i, sm);
          parts.push({ mesh: shadows, i, m: sm });
        }
        this.spots.push({ x, z, r: sp.r, parts });
        k++;
      }
    }
    this.root.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) {
        o.instanceMatrix.needsUpdate = true;
        o.computeBoundingSphere();
      }
    });
  }

  /** Some o que ficou embaixo de um prédio ou perto de uma jazida nova. */
  sync(buildings: Building[], nodes: ResourceNode[]): void {
    const key = `${nodes.length}|` + buildings.map((b) => `${b.id}:${b.x}:${b.z}`).join('|');
    if (key === this.seen) return;
    this.seen = key;
    const touched = new Set<THREE.InstancedMesh>();
    for (const sp of this.spots) {
      const hide =
        buildings.some((b) => Math.abs(b.x - sp.x) < b.size / 2 + sp.r + 0.5 && Math.abs(b.z - sp.z) < b.size / 2 + sp.r + 0.5) ||
        nodes.some((n) => Math.hypot(n.x - sp.x, n.z - sp.z) < 5 + sp.r);
      for (const p of sp.parts) {
        p.mesh.setMatrixAt(p.i, hide ? ZERO : p.m);
        touched.add(p.mesh);
      }
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
  }
}
