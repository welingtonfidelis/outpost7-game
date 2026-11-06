/**
 * Grade de cor da tela inteira (Etapa 19), sem passo extra de pós-processamento: o tom vai
 * no "tone mapping" customizado do three, que todo material embutido já chama no fim do
 * shader. Tira saturação, puxa o tom do bioma e passa pela curva ACES (contraste de cinema).
 * Tem que ser chamada antes do primeiro desenho (os shaders levam o código ao compilar).
 */
import * as THREE from 'three';
import type { Biome } from './biome.ts';

export function applyGrade(renderer: THREE.WebGLRenderer, b: Biome): void {
  const { sat, tint, exposure } = b.grade;
  const f = (x: number) => x.toFixed(3);
  const fn = `vec3 CustomToneMapping( vec3 color ) {
	float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = mix( vec3( l ), color, ${f(sat)} ) * vec3( ${f(tint[0])}, ${f(tint[1])}, ${f(tint[2])} );
	return ACESFilmicToneMapping( color );
}`;
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  const re = /vec3 CustomToneMapping\( vec3 color \) \{[\s\S]*?\n?\}/;
  if (!re.test(chunk)) {
    console.warn('grade: não achei o CustomToneMapping do three; sem grade');
    return;
  }
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(re, fn);
  renderer.toneMapping = THREE.CustomToneMapping;
  // A curva ACES do three multiplica por exposição / 0,6 e escurece os meios-tons; com a
  // exposição perto de 1 o brilho fica parecido com o de antes, só com mais contraste.
  renderer.toneMappingExposure = exposure;
}
