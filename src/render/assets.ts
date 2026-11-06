/**
 * Arte do KayKit (CC0): personagens com esqueleto e animações, prédios do Space Base,
 * parede do Prototype e minério do Resource Bits. Carrega uma vez e clona.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export type CharKind = 'worker' | 'soldier' | 'sniper' | 'robot';
export type PropKind =
  | 'quartel'
  | 'fabrica'
  | 'refinaria'
  | 'gerador'
  | 'deposito'
  | 'containers'
  | 'torre'
  | 'torreCanto'
  | 'rockA'
  | 'rockB'
  | 'rocks'
  | 'ore0'
  | 'ore1'
  | 'ore2';

const CHAR_FILES: Record<CharKind, string> = {
  worker: 'chars/Survivalist.glb',
  soldier: 'chars/SpaceRanger.glb',
  sniper: 'chars/Marksman.glb',
  robot: 'chars/CombatMech.glb',
};
const WEAPON_FILES: Partial<Record<CharKind, string>> = {
  soldier: 'chars/SpaceRanger_Rifle.gltf',
  sniper: 'chars/Marksman_Rifle.gltf',
  robot: 'chars/CombatMech_Minigun.gltf',
};
const PROP_FILES: Record<PropKind, string> = {
  quartel: 'spacebase/basemodule_A.gltf',
  fabrica: 'spacebase/basemodule_garage.gltf',
  refinaria: 'spacebase/drill_structure.gltf',
  gerador: 'spacebase/windturbine_tall.gltf',
  deposito: 'spacebase/cargodepot_A.gltf',
  containers: 'spacebase/containers_A.gltf',
  torre: 'spacebase/structure_low.gltf',
  torreCanto: 'spacebase/structure_tall.gltf',
  rockA: 'spacebase/rock_A.gltf',
  rockB: 'spacebase/rock_B.gltf',
  rocks: 'spacebase/rocks_A.gltf',
  ore0: 'resource/Stone_Chunks_Large.gltf',
  ore1: 'resource/Copper_Nuggets.gltf',
  ore2: 'resource/Gold_Nuggets.gltf',
};
const ANIM_FILES = ['anims/Rig_Medium_General.glb', 'anims/Rig_Medium_MovementBasic.glb', 'anims/Rig_Medium_CombatRanged.glb', 'anims/Rig_Medium_Tools.glb'];

/** Altura alvo de cada personagem (m) e de cada prédio (lado do maior eixo no chão). */
const CHAR_HEIGHT: Record<CharKind, number> = { worker: 1.7, soldier: 1.75, sniper: 1.75, robot: 2.7 };

export interface Art {
  chars: Record<CharKind, { scene: THREE.Object3D; scale: number }>;
  weapons: Partial<Record<CharKind, THREE.Object3D>>;
  backpack: THREE.Object3D | null;
  clips: Map<string, THREE.AnimationClip>;
  props: Record<PropKind, { scene: THREE.Object3D; size: THREE.Vector3; base: number }>;
  wall: { geometry: THREE.BufferGeometry; material: THREE.Material } | null;
}

function fixMaterials(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) {
          // Sem mapa de ambiente, o metal do glTF fica escuro: deixa fosco.
          m.metalness = 0;
          m.roughness = Math.max(0.7, m.roughness);
        }
      }
    }
  });
}

export async function loadArt(base: string): Promise<Art> {
  const loader = new GLTFLoader();
  const load = (f: string) => loader.loadAsync(base + f);
  const [charsL, weaponsL, backpackL, animsL, propsL, wallL] = await Promise.all([
    Promise.all((Object.keys(CHAR_FILES) as CharKind[]).map(async (k) => [k, await load(CHAR_FILES[k])] as const)),
    Promise.all((Object.keys(WEAPON_FILES) as CharKind[]).map(async (k) => [k, await load(WEAPON_FILES[k]!)] as const)),
    load('chars/backpack.gltf').catch(() => null),
    Promise.all(ANIM_FILES.map((f) => load(f))),
    Promise.all((Object.keys(PROP_FILES) as PropKind[]).map(async (k) => [k, await load(PROP_FILES[k])] as const)),
    load('prototype/Wall.gltf').catch(() => null),
  ]);
  const chars = {} as Art['chars'];
  for (const [k, g] of charsL) {
    fixMaterials(g.scene);
    const box = new THREE.Box3().setFromObject(g.scene);
    const h = box.max.y - box.min.y || 1;
    chars[k] = { scene: g.scene, scale: CHAR_HEIGHT[k] / h };
  }
  const weapons: Art['weapons'] = {};
  for (const [k, g] of weaponsL) {
    fixMaterials(g.scene);
    weapons[k] = g.scene;
  }
  const clips = new Map<string, THREE.AnimationClip>();
  for (const g of animsL) for (const c of g.animations) clips.set(c.name, c);
  const props = {} as Art['props'];
  for (const [k, g] of propsL) {
    fixMaterials(g.scene);
    const box = new THREE.Box3().setFromObject(g.scene);
    props[k] = { scene: g.scene, size: box.getSize(new THREE.Vector3()), base: box.min.y };
  }
  let wall: Art['wall'] = null;
  if (wallL) {
    // Junta as malhas da parede numa geometria só, normalizada para 1×1×1 com a base em y = 0.
    let mesh: THREE.Mesh | null = null;
    wallL.scene.traverse((o) => {
      if (!mesh && o instanceof THREE.Mesh) mesh = o;
    });
    if (mesh) {
      const m = mesh as THREE.Mesh;
      m.updateWorldMatrix(true, false);
      const geo = (m.geometry as THREE.BufferGeometry).clone().applyMatrix4(m.matrixWorld);
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      const size = b.getSize(new THREE.Vector3());
      geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      // O eixo comprido da parede vira x.
      if (size.z > size.x) geo.rotateY(Math.PI / 2);
      geo.computeBoundingBox();
      const s2 = geo.boundingBox!.getSize(new THREE.Vector3());
      geo.scale(1 / s2.x, 1 / s2.y, 1 / Math.max(0.0001, s2.z));
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
      const lam = new THREE.MeshLambertMaterial({ map: mat.map ?? null, color: '#ffffff' });
      wall = { geometry: geo, material: lam };
    }
  }
  return { chars, weapons, backpack: backpackL?.scene ?? null, clips, props, wall };
}

/** Clona um personagem com esqueleto próprio. */
export function cloneChar(art: Art, kind: CharKind): THREE.Object3D {
  const src = art.chars[kind];
  const o = SkeletonUtils.clone(src.scene);
  o.scale.setScalar(src.scale);
  return o;
}

/** Clona um prédio cabendo em `foot` metros no chão (maior lado), com a base no chão. */
export function cloneProp(art: Art, kind: PropKind, foot: number): THREE.Object3D {
  const p = art.props[kind];
  const o = p.scene.clone(true);
  const s = foot / Math.max(p.size.x, p.size.z, 0.001);
  o.scale.setScalar(s);
  o.position.y = -p.base * s;
  const g = new THREE.Group();
  g.add(o);
  return g;
}

/** Acha um osso pelo nome (o GLTFLoader tira os pontos: "handslot.r" vira "handslotr"). */
export function findBone(root: THREE.Object3D, names: string[]): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && names.includes(o.name)) found = o;
  });
  return found;
}
