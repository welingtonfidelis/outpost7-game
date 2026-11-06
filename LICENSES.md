# Licenças de terceiros

## KayKit (Kay Lousberg) — CC0 1.0

Modelos, texturas e animações em `public/assets/kaykit/`, copiados da Coleção Completa do
KayKit v6.1 (local em `Projects/others/kaykit-complete-v6-1-assets`) por `npm run art`
(lista em `tools/art-manifest.ts`). Licença CC0: uso livre, sem obrigação de crédito. Crédito
mesmo assim: **KayKit — Kay Lousberg (kaylousberg.com)**.

- Space Base Bits 1.0: módulos, garagem, depósito, contêineres, broca, turbina, estruturas, rochas,
  cargas empilhadas.
- Prototype Bits 1.1: parede.
- Resource Bits 1.0: pedras, cobre e ouro; caixas, barris de combustível e pallet do pátio.
- Forest Nature Pack 1.0: pinheiros, árvores secas, moita, pedras e capim dos biomas.
- Mystery Monthly: Survivalist e Space Ranger (série 4), Combat Mech (série 5), Marksman (série 6),
  com armas e mochila.
- Character Animations 1.1 (Rig_Medium): General, MovementBasic, CombatRanged e Tools.

Os insetos (todas as espécies), a muralha, os portões, as torres, o terreno, a interface e os sons
são feitos no próprio projeto. Os clarões dos tiros vêm do pixelfx (abaixo).

## pixelfx (Patch e Hugo Duprez) — MIT

Os clarões dos tiros (Etapa 21) estão em `public/assets/fx/tiros.png`. São quadros dos efeitos
"SMG burst" (`src/fx/projectiles/muzzle-smg.js`) e "Pistol shot" (`src/fx/projectiles/muzzle-pistol.js`)
do pixelfx, https://github.com/patch-gg/pixelfx (commit a84159688af3ca37a4be05a0d422b94451b2e24e),
gerados por `tools/bake-fx.ts`. Os dois efeitos adaptam o muzzle-flash do Sprite Fusion
(https://www.spritefusion.com/pixel-art-vfx/muzzle-flash), de Hugo Duprez, também MIT.

Única mudança nossa: o recorte. Fica de fora o chão do efeito, abaixo do cano: a cápsula quicando,
as faíscas no piso e o brilho do chão. O código do pixelfx não vai no jogo nem no repositório.

```
MIT License

Copyright (c) 2026 Patch
Copyright (c) 2026 Hugo Duprez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
