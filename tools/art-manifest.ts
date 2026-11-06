/**
 * O que vem da coleção KayKit local (CC0) para public/assets/kaykit. Só estes arquivos são
 * copiados (`npm run art`); a coleção fica fora do projeto.
 */
export const KAYKIT_ROOT = '../kaykit-complete-v6-1-assets';

const SB = 'KayKit Space Base Bits 1.0/Assets/gltf';
const PB = 'KayKit Prototype Bits 1.1/Assets/gltf';
const RB = 'KayKit Resource Bits 1.0/Assets/gltf';
const CA = 'KayKit Character Animations 1.1/Animations/gltf/Rig_Medium';
const MM4 = 'KayKit Mystery Monthly Series 4 (1.1)';
const MM5 = 'KayKit Mystery Monthly Series 5 (1.1)';
const MM6 = 'KayKit Mystery Monthly Series 6 (1.1)';

/** [origem relativa à coleção, destino relativo a public/assets/kaykit] */
export const ART: [string, string][] = [
  ...['basemodule_A', 'basemodule_garage', 'cargodepot_A', 'containers_A', 'drill_structure', 'windturbine_tall', 'structure_low', 'structure_tall', 'rock_A', 'rock_B', 'rocks_A'].flatMap(
    (n) => [
      [`${SB}/${n}.gltf`, `spacebase/${n}.gltf`],
      [`${SB}/${n}.bin`, `spacebase/${n}.bin`],
    ] as [string, string][],
  ),
  [`${SB}/spacebits_texture.png`, 'spacebase/spacebits_texture.png'],
  [`${PB}/Wall.gltf`, 'prototype/Wall.gltf'],
  [`${PB}/Wall.bin`, 'prototype/Wall.bin'],
  [`${PB}/prototypebits_texture.png`, 'prototype/prototypebits_texture.png'],
  ...['Stone_Chunks_Large', 'Copper_Nuggets', 'Gold_Nuggets'].flatMap(
    (n) => [
      [`${RB}/${n}.gltf`, `resource/${n}.gltf`],
      [`${RB}/${n}.bin`, `resource/${n}.bin`],
    ] as [string, string][],
  ),
  [`${RB}/resource_bits_texture.png`, 'resource/resource_bits_texture.png'],
  [`${MM4}/9 - March 2024 - Survivalist/character/Survivalist.glb`, 'chars/Survivalist.glb'],
  [`${MM4}/7 - January 2024 - Space Ranger/character/SpaceRanger.glb`, 'chars/SpaceRanger.glb'],
  [`${MM6}/10 - April 2026 - Marksman/characters/Marksman.glb`, 'chars/Marksman.glb'],
  [`${MM5}/1 - July 2024 - Combat Mech/characters/CombatMech.glb`, 'chars/CombatMech.glb'],
  [`${MM4}/7 - January 2024 - Space Ranger/assets/gltf/SpaceRanger_Rifle.gltf`, 'chars/SpaceRanger_Rifle.gltf'],
  [`${MM4}/7 - January 2024 - Space Ranger/assets/gltf/SpaceRanger_Rifle.bin`, 'chars/SpaceRanger_Rifle.bin'],
  [`${MM4}/7 - January 2024 - Space Ranger/assets/gltf/spaceranger_texture.png`, 'chars/spaceranger_texture.png'],
  [`${MM6}/10 - April 2026 - Marksman/assets/gltf/Marksman_Rifle.gltf`, 'chars/Marksman_Rifle.gltf'],
  [`${MM6}/10 - April 2026 - Marksman/assets/gltf/Marksman_Rifle.bin`, 'chars/Marksman_Rifle.bin'],
  [`${MM6}/10 - April 2026 - Marksman/assets/gltf/marksman_texture.png`, 'chars/marksman_texture.png'],
  [`${MM6}/10 - April 2026 - Marksman/assets/gltf/marksman_foliage_texture.png`, 'chars/marksman_foliage_texture.png'],
  [`${MM5}/1 - July 2024 - Combat Mech/assets/gltf/CombatMech_Minigun.gltf`, 'chars/CombatMech_Minigun.gltf'],
  [`${MM5}/1 - July 2024 - Combat Mech/assets/gltf/CombatMech_Minigun.bin`, 'chars/CombatMech_Minigun.bin'],
  [`${MM5}/1 - July 2024 - Combat Mech/assets/gltf/combatmech_texture.png`, 'chars/combatmech_texture.png'],
  [`${MM4}/9 - March 2024 - Survivalist/assets/gltf/backpack.gltf`, 'chars/backpack.gltf'],
  [`${MM4}/9 - March 2024 - Survivalist/assets/gltf/backpack.bin`, 'chars/backpack.bin'],
  [`${MM4}/9 - March 2024 - Survivalist/assets/gltf/survivalist_texture.png`, 'chars/survivalist_texture.png'],
  [`${CA}/Rig_Medium_General.glb`, 'anims/Rig_Medium_General.glb'],
  [`${CA}/Rig_Medium_MovementBasic.glb`, 'anims/Rig_Medium_MovementBasic.glb'],
  [`${CA}/Rig_Medium_CombatRanged.glb`, 'anims/Rig_Medium_CombatRanged.glb'],
  [`${CA}/Rig_Medium_Tools.glb`, 'anims/Rig_Medium_Tools.glb'],
];
