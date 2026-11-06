# Outpost 7

Doc único do projeto: GDD, avaliação técnica, plano do protótipo, estado e como rodar. O jogo se chama **Outpost 7** (decisão do usuário em 2026-11-06, repositório `welingtonfidelis/outpost7-game`); "Posto Avançado" era o codinome e segue no nome da pasta, deste arquivo e das chaves de save.

**Estado em 2026-11-05:** as etapas 0 a 12 do roteiro estão prontas (§C), e a 12 (arte do KayKit, inseto novo e som, §C.22–C.23) foi jogada no iPhone depois das correções de tremido e da arma. A Etapa 13 fecha as pendências da interface: escolher tropas por toque, toque duplo e caixa, ordens por unidade, ícones e retratos (jogados no iPhone: "ficou bom") e o canteiro de obra com guindaste, faíscas e barra (falta jogar no iPhone) (§C.24). A Etapa 14 trouxe o fortim (§C.25–C.26). A Etapa 15 refez a IA do enxame: bandos, levas, andar caótico e caçadores que atacam o fortim e as tropas no mapa (§C.27–C.28). A Etapa 16 mostra o tempo de volta de cada trabalhador, avisa quem não chega e chama só quem está em risco (§C.29–C.30). A Etapa 17 trouxe as decisões do usuário (aviso de 20 s, horda atrás de tudo que está fora, fortim como posto avançado com abrigo), chamar um trabalhador, salvar a partida e mortes marcantes (§C.31–C.32); falta jogar no iPhone e decidir se compensa a dificuldade. A Etapa 18 refez o visual do forte a partir de uma imagem de referência do usuário (§C.33). A Etapa 19 trouxe biomas aleatórios e o tom sombrio (§C.34–C.35). A Etapa 20 dividiu o enxame em quatro espécies (§C.36). A Etapa 21 trocou as linhas dos tiros por clarões de cano do pixelfx (§C.37). A 6 trouxe soldados e robôs (§C.10–C.11); a 7, a construção livre (§C.12–C.13); a 8 e a 9, a curva gradual, a economia que se renova, a produção e as melhorias (§C.14–C.17); a 10, a interface de RTS com o StarCraft como referência de gênero (§C.18–C.19); a 11, insetos que escalam e cavam (§C.20–C.21). O iPhone do usuário segurou o enxame até 8 mil insetos e caiu em 16 mil (§C.1). A horda roda num Web Worker (§C.8–C.9). As etapas 0 a 17 estão no GitHub (`welingtonfidelis/outpost7-game`, commit b2aed21); as 18 a 20 também (commit 6c83ae9), e a 21 depois delas.

## Sumário
- Parte A: avaliação técnica (feita antes do código)
- Parte B: GDD original (texto do usuário)
- Parte C: protótipo, estado, resultados e como rodar

---

# Parte A · Avaliação técnica

## A.0 Resumo

- **Dá para fazer na web.** A recomendação é TypeScript + Vite + Three.js (WebGL2 com um shader instanciado próprio), com a simulação num Web Worker em TS puro e determinístico, a UI em Preact e um balanceador headless no Node. É a mesma receita do Vigília.
- **O que medi no Mac (M4, Chrome 156):**
  - 20 mil insetos de 336 triângulos, com as patas animadas, levam 9,5 ms por quadro.
  - Com LOD, uns 28 mil cabem em 6 ms.
  - A simulação de 20 mil insetos (flow field, separação, ataque à muralha e 248 atiradores) custa 2 ms por tick, a 20 ticks por segundo.
- **O gargalo é a GPU do celular, não a CPU.** A estimativa para um iPhone recente é de 5 a 10 mil insetos na tela a 60 fps, com LOD. Esse número precisa ser medido no aparelho (Etapa 0).
- **Godot com GDScript não aguenta o enxame.** No mesmo algoritmo, ficou de 20 a 30 vezes mais lento que o JS. Unity com DOTS aguenta muito mais, mas perde quase toda a vantagem na exportação para web e custa caro para aprender.

## A.1 O que pesa tecnicamente no GDD

### A.1.1 Milhares de insetos na tela
- **Instancing:** um draw call por nível de LOD. Os dados por instância são posição, direção, fase da animação, escala, tom e estado, em 32 bytes, e vão do worker para a GPU a cada tick.
- **O custo é de vértice, não de pixel.** Medido: 20 mil insetos LOD0 levam 9,5 ms em 1920×1080 e 8,4 ms em 1704×786. A resolução quase não muda nada. O M4 rendeu uns 650 milhões de triângulos por segundo. Por isso o LOD é a principal alavanca:
  - LOD0, com uns 300 triângulos, até ~25 m;
  - LOD1, com ~150, até ~60 m;
  - LOD2, com 40 a 70, mais longe;
  - impostor de 2 triângulos no fundo.
  - A troca de LOD é feita por baldes de distância, calculados no worker.
- **Animação na GPU:**
  - O andar fica no vertex shader, com as patas em tripé, como no teste. Custa quase nada.
  - Os clipes de ataque, mordida e morte usam VAT (vertex animation texture), assados uma vez a partir de um modelo com esqueleto.
  - Nada de esqueleto por inseto.
- **Sombra:** sem shadow map para os insetos. Uma sombra-blob instanciada embaixo de cada um basta.
- **Mortes e corpos:** um pool instanciado com fade. Mortes "cinematográficas" só para os trabalhadores, poucas por vez.

### A.1.2 Inteligência de enxame e pathfinding de massa
- **Um flow field serve para todos.** É um campo de distância (Dijkstra com 8 vizinhos) a partir do núcleo da base. A muralha entra com custo proporcional ao HP, então o enxame procura o ponto fraco sozinho. No teste, os portões têm HP 300 e a muralha 1200, e as brechas aparecem nos portões.
- **Separação local:** hash espacial de 1 m (counting sort por célula a cada tick), com teto de 12 vizinhos por inseto. O teto segura o custo quando a massa se amontoa na muralha.
- **Recálculo do campo:** só quando uma muralha cai ou é construída, no máximo duas vezes por segundo, no worker. Medido: 7 ms num mapa de 256×256. Num mapa de 512×512 deve ir para 30 a 40 ms. Nesse caso, dividir o recálculo em fatias entre ticks ou usar setores hierárquicos.
- **Comportamento de enxame:** grupos com líder, variação de velocidade e de fase por inseto, e ondas por flanco. Nada de boids completos para todos, que fica caro e parece gosma.

### A.1.3 Escalar muralhas, cavar túneis e esmagar defesas
Isso é truque de design, não física.
- **Escalar:** cada trecho da muralha guarda uma "pressão". Quem chega ganha uma vaga numa pilha, que vira um deslocamento de altura no shader e forma uma rampa visível de insetos. Quando a pilha alcança a altura da muralha, o trecho fica passável numa camada "escalada" do flow field.
- **Cavar:** é um evento com aviso.
  - Os escavadores somem no chão e um monte de terra se move (decal), com um tremor ou sonar avisando o jogador.
  - Depois de T segundos, abre uma saída dentro da base, que vira novo ponto de spawn e nova fonte no campo.
  - O jogador pode reagir: minas, sensores, soldados na saída.
- **Esmagar:** as estruturas têm HP por célula, e tipos pesados priorizam estruturas. O teste já abre brechas (de 14 a 52 por rodada) e recalcula o campo.

### A.1.4 Torres e soldados mirando em muitos alvos
- **Busca de alvo:** um hash grosso de 8 m. Cada atirador refaz a mira 4 vezes por segundo, de forma escalonada, mantém o alvo enquanto ele for válido e tem um teto de checagens.
- **Tiros:** rifles e torres usam hitscan. Só foguete e artilharia viram projéteis, num pool instanciado. Traçantes, clarões e respingos são partículas instanciadas.
- **Medido:** os 248 atiradores (48 torres e 200 soldados) já estão dentro dos 2 ms do tick com 20 mil insetos.

### A.1.5 Simulação determinística dos trabalhadores e da rolagem de pânico
- **Tick:** fixo em 20 por segundo, com o render interpolando entre ticks.
- **RNG por contador:** um hash de (semente, onda, id do trabalhador, sal). A rolagem não depende da ordem em que as coisas acontecem e dá para reproduzir qualquer onda.
- **Regras dentro da sim:**
  - nada de `Math.random`, `Date`, `sin`, `cos`, `exp` ou `pow` (usar tabela ou polinômio próprio);
  - só `+ − × ÷` e `sqrt`, que são exatos pelo IEEE;
  - estado em `Float32Array`.
  - **Medido:** o hash do estado final deu igual no V8 (Chrome) e no JavaScriptCore (Safari) para todas as contagens testadas. Dois mundos com a mesma semente também deram iguais.
- **Rolagem de pânico:**
  - A chance sai da geometria real: o tempo de corrida até o portão comparado ao tempo até ele fechar, mais a velocidade e os insetos por perto.
  - Rola uma vez só e depois **anima** o resultado. Ou o trabalhador corre e se joga no portão (talvez ferido ou sem a carga), ou é interceptado numa cena curta.
  - Fica determinístico, barato e cinematográfico.
  - Mostrar a % de cada trabalhador quando a sirene toca é o que cria a tensão que o GDD pede.

### A.1.6 Desempenho no celular
- **GPU e calor:** a GPU do iPhone tem uns 1/2 a 1/3 do M4 e cai mais depois de minutos de calor. O Modo de Pouca Energia corta para 30 fps (no Portador o iPhone ficou em 27 fps por isso).
- **Presets e DPR:** presets de qualidade (quantos insetos vivos, distâncias de LOD) e DPR limitado a 1,5–2.
- **Sim separada do render:** se o quadro cair para 30 fps, o jogo continua igual.
- **Memória da aba:** o Safari mata a aba quando passa do limite, então pools fixos e nada de alocar por tick.
- **Som:** a sirene é mecânica central. No iOS a chave de silêncio pode calar o Web Audio, então o aviso visual tem que ser forte sozinho. Vale testar o `navigator.audioSession`.
- **Toque:** os controles de toque de RTS (selecionar, arrastar, pinça na câmera) são um risco de UX e precisam existir desde o protótipo.

## A.2 Comparação das opções

Os números de "insetos" são vivos na tela a 60 fps com LOD. **Medido** vem dos testes no Mac. **Estimado** é projeção e precisa ser confirmado no aparelho.

| Caminho | Celular | PC/Mac | Custo para ele | Observações |
|---|---|---|---|---|
| **Web: Three.js + WebGL2 + sim em worker (TS)** | 5–10 mil (estimado) | 25–30 mil no render (medido); sim de 50 mil em 5 ms/tick (medido) | Baixo: stack que ele já usa (Popinho, Portador, Vigília) | GitHub Pages, teste no iPhone pela rede local, balanceador no Node, Vitest com hash |
| Web + WebGPU (Three `WebGPURenderer`, compute para culling, LOD e animação) | 10–20 mil (estimado, Safari 26 / iOS 26+) | 50–100 mil+ (estimado) | Médio-alto: TSL/WGSL e um fallback WebGL2 que custa mais | Sim na GPU não é determinística: serve só para enxame "visual" |
| Web + WASM (Rust/C) no laço da sim | igual (a GPU limita) | ganho de ~1,5–3× na CPU | Médio: instalar toolchain | Só se a CPU virar gargalo. Com dados em SoA no TS, a troca é local |
| Babylon.js (WebGL2/WebGPU) | parecido com o Three | parecido | Médio: API nova para ele | Thin instances, WebGPU maduro, inspector bom. Não compensa trocar o que ele já domina |
| Godot 4 nativo + GDScript | sim em ~1–2 mil | render com MultiMesh passa de 50 mil, mas a sim trava | Baixo (ele já usa Godot) | **Medido:** 5 mil insetos levam 10,8 ms por tick e o flow field 221 ms (contra 0,55 e 7 ms no JS) |
| Godot 4 nativo + C# | ~10–20 mil (estimado) | ~20–50 mil (estimado) | Médio: build .NET do Godot, C# | Até onde sei, C# não exporta para web no Godot 4 (conferir no 4.7) |
| Godot 4 + GDExtension (C++/Rust) | 10–20 mil+ | 50 mil+ com threads e SIMD | Alto: toolchain e build por plataforma | Na web exige templates com dlink e é frágil |
| Godot 4 exportado para web | ~1–2 mil | ~2–3 mil | — | Só o renderer Compatibility (WebGL2), sem compute, uma thread por padrão, wasm de dezenas de MB, e GDScript no wasm ainda mais lento |
| Unity 6 + DOTS (nativo) | 10–30 mil (nativo) | 50–100 mil+ | Alto: DOTS é outro jeito de programar, editor pesado, iOS precisa de Xcode e conta de desenvolvedor | Diplomacy is Not an Option usa DOTS para dezenas de milhares de unidades no PC |
| Unity 6 exportado para web | ~2–5 mil (estimado) | ~5–10 mil | Alto | Burst e Jobs sem threads na web e Entities Graphics pedindo compute (WebGPU ainda experimental): a vantagem do DOTS some. Download grande e pressão de memória no Safari iOS |

**Licenças:**
- Three.js: MIT.
- Babylon.js: Apache 2.0.
- Godot: MIT.
- Unity Personal: grátis até US$ 200 mil por ano de receita, com splash opcional no Unity 6. A Runtime Fee foi cancelada em 2024. Conferir os valores do Pro no site antes de decidir.

## A.3 Recomendação

**Web, com a receita do Vigília:**
- **Stack:** TS + Vite + Three.js (`WebGLRenderer` com `ShaderMaterial` instanciado próprio, um draw por LOD) e UI em Preact.
- **Simulação:** num Web Worker em TS puro, com dados em SoA (`Float32Array`), tick fixo de 20 por segundo e interpolação no render.
- **Ferramentas:** balanceador headless no Node, Vitest com hash de determinismo e publicação no GitHub Pages.
- **Pastas:** `src/sim`, `src/render`, `src/ui` e `src/game`, como nos outros projetos.

**Orçamento inicial:**
- **Vivos ao mesmo tempo:** 5 mil no iPhone e 20 mil no PC, ajustados por preset.
- **Tamanho da onda:** os "milhares" do GDD vêm do total, que pode ser maior que o número vivo. O resto espera numa fila fora da tela.
- **Densidade:** concentrar a massa nos pontos de choque também faz parecer mais.

**Saídas, se o celular não aguentar, nesta ordem:**
1. Mais LOD e impostores.
2. WebGPU para desenhar (iOS 26+).
3. WASM no laço da sim.
4. Godot com C# ou Unity nativo. A sim em TS com SoA porta bem para C#.

**Riscos e como reduzir:**

| Risco | Como reduzir |
|---|---|
| A GPU do iPhone não segura a contagem | Etapa 0 mede no aparelho antes de tudo. LOD, impostores, teto de vivos por preset e onda total maior que os vivos |
| Calor e Modo de Pouca Energia | Sim separada do render (30 fps não muda o jogo), preset automático pelo tempo de quadro e DPR limitado |
| Engasgos de GC ou na passagem worker → tela | Buffers transferíveis em pingue-pongue, sem alocar dentro do tick, pools fixos. Evitar `SharedArrayBuffer`, porque o GitHub Pages não deixa configurar os cabeçalhos COOP/COEP |
| Recálculo do flow field dá pico (5 ms dentro do tick) | Tirar do tick, fatiar entre ticks ou fazer só a região afetada. Setores hierárquicos se o mapa crescer |
| O determinismo quebrar sem ninguém ver | Regras da sim (sem `random`, `Date` ou trigonometria nativa), RNG por contador e teste de hash no Vitest e no balanceador |
| O enxame parecer gosma | Variação de escala, tom, fase e velocidade, grupos com flanco, separação ajustada e mortes legíveis |
| Escalar e cavar ficarem caros ou confusos | Fingir: pilha com vagas e túnel como evento com aviso e ponto de spawn. Nada de física |
| Escopo (RTS + base + economia + exército + horda) | Protótipo só com o ciclo do trabalhador e uma horda simples, e decidir o resto depois de jogar |
| Sirene muda no iPhone | Aviso visual forte e contagem na tela. Testar `navigator.audioSession` |


## A.4 Plano do protótipo

O plano virou a Parte C (§C.1), com o estado de cada etapa.

## A.5 Nomes e marca

O jogo é original e só se inspira no filme. **Ficam de fora:**
- **Do título e do texto do jogo:**
  - "Klendathu" (o planeta dos insetos no livro e nos filmes), "Troopers" e "Starship Troopers";
  - "Infantaria Móvel" (Mobile Infantry), "Federação", "Aracnídeos";
  - os nomes dos insetos dos filmes (warrior, tanker, plasma, brain bug);
  - o bordão "Would you like to know more?" e o rifle Morita.
- **Soldados:** podem ser "Soldados", "Fuzileiros" ou "Guarnição".
- **O visual dos insetos do filme:** nada do inseto de quatro patas longas em lâmina com a mandíbula partida, nem da paleta deles. Os nossos podem ter seis patas (formiga e besouro), proporções e cores próprias.
- **O que pode ficar:** a mecânica do gênero, com hordas massivas, muralhas, torres, soldados com rifle, sirene, tensão e mortes rápidas com coreografia própria. Isso é gênero (They Are Billions e outros), não marca.
- **No GDD:** a "inspiração principal" pode continuar no documento interno, mas não no jogo nem na divulgação.
- **Títulos provisórios, se ajudar:** "Sirene", "Último Portão" ou "Posto Colmeia".

## A.6 Como medi (testes descartáveis)

**Render** (`render.html` + `drive-chrome.mjs`):
- **Página:** WebGL2 cru, que é o que um `InstancedMesh` faz por baixo.
- **Inseto:** genérico e procedural, com 3 LODs (336, 204 e 72 triângulos) e as patas em tripé no vertex shader.
- **Instâncias:** 32 bytes por instância enviados da CPU a cada quadro.
- **Câmera:** de RTS, com todos os insetos na tela (pior caso, sem culling), sem sombra e sem MSAA.
- **Navegador:** Chrome 156 headless com GPU real (ANGLE/Metal, Apple M4), num perfil temporário apagado no fim.
- **Medida:** vazão de 60 quadros em fila com um `readPixels` no fim. O timer de GPU do WebGL veio zerado nesse Chrome, então o número é o quadro inteiro, com CPU e GPU sobrepostas.

| ms por quadro, 1920×1080 | LOD0 (336 tri) | LOD1 (204) | LOD2 (72) |
|---|---|---|---|
| 1 mil | 0,8 | 0,65 | 1,0 |
| 2 mil | 1,1 | 0,85 | 0,8 |
| 5 mil | 2,5 | 1,8 | 0,9 |
| 10 mil | 4,8 | 3,2 | 1,6 |
| 20 mil | 9,5 | 6,0 | 2,7 |
| 50 mil | 21,7 | 14,6 | 6,8 |
| 100 mil | 42,8 | 28,0 | 12,7 |
| 200 mil | 85,0 | 54,6 | 23,7 |

Com 1704×786 (um celular deitado com DPR 2), 20 mil LOD0 levaram 8,4 ms e 50 mil LOD2 levaram 5,8 ms. O gargalo é de vértice.

**Simulação** (`swarm-sim.mjs`, `jsc-run.mjs`, `godot/bench.gd`):
- **Mapa:** 256×256, com muralha em anel e 4 portões fracos.
- **Passo:** flow field por Dijkstra, separação por hash, mordida na muralha com brechas, 48 torres e 200 soldados.
- **Medida:** 20 s de aquecimento (a horda já na muralha) e depois 200 ticks medidos.
- **Motores:** Node 22 (V8, o mesmo do Chrome), `jsc` do macOS (JavaScriptCore, o do Safari) e Godot 4.7.2 headless, com o mesmo passo em GDScript tipado. O GDScript ficou sem os atiradores e sem recálculo, o que favorece ele.

| ms por tick (20/s) | V8 médio (p95) | JSC médio (p95) | GDScript médio |
|---|---|---|---|
| 1 mil | 0,15 (0,59) | 0,19 (0,21) | 3,2 |
| 5 mil | 0,55 (0,91) | 0,86 (2,35) | 10,8 |
| 10 mil | 0,98 (5,2) | 3,45 (9,0) | 19,8 |
| 20 mil | 2,06 (6,5) | 5,25 (9,0) | — |
| 50 mil | 5,18 (9,7) | 3,83 (7,2) | — |
| Flow field 256×256 | 7,2 | 6,6 | 221 |

- **Os picos de p95** são o recálculo do flow field dentro do tick, que tem que sair dali. O JSC oscila mais entre rodadas.
- **Determinismo:** os hashes de estado bateram entre V8 e JSC em todas as contagens (por exemplo, `7e7826cc` com 20 mil). Dois mundos com a semente 42 e 600 ticks também deram iguais.

---

# Parte B · GDD original (texto do usuário)

Mantido como veio, para referência interna. O título e os nomes ligados ao filme não vão para o jogo (§A.5).

> 📋 Proposta de Projeto: Operação Klendathu (Título Provisório)
>
> 1. Visão Geral do Jogo
> * Gênero: Estratégia em Tempo Real (RTS) / Survival Base Building 3D.
> * Inspiração Principal: Starship Troopers (combate implacável contra hordas massivas de insetos) combinado com mecânicas de gerenciamento de risco e automação de colônia.
> * Premissa: Em um planeta hostil e infestado, o jogador assume o comando de um posto avançado militar. A sobrevivência depende de extrair recursos sob forte tensão, gerenciar civis/trabalhadores e erguer defesas robustas antes que a próxima onda de milhares de insetos alienígenas ataque.
>
> 2. Mecânica Core: O Ciclo de Vida do Trabalhador
> Para gerar os materiais essenciais para construções, armas e recrutamento de soldados, o jogador precisa de Trabalhadores e Mineradores. O diferencial tático do jogo reside na vulnerabilidade dessas unidades fora dos muros.
> * Fase de Coleta (Fora dos Muros): os trabalhadores saem automaticamente ou por comando direto da base fortificada para extrair minério e coletar recursos no mapa externo. Quanto mais longe a fonte de recurso, maior a eficiência, mas também maior o risco de exposição.
> * O Alerta de Invasão (A Sirene): quando faltam poucos minutos/segundos para a horda chegar (como indicado pelo sistema de alerta da interface), o jogador recebe um aviso sonoro e visual. Ação do Jogador: o jogador deve tocar o alarme geral para ordenar o recolhimento dos trabalhadores de volta para a zona segura da base.
>
> 3. Sistema de Risco: O "Fator Pânico" (Jogo de Dados)
> Se o jogador se descuidar, demorar muito para chamar os trabalhadores de volta, ou decidir arriscar a coleta até o último segundo, um sistema de eventos randômicos (jogo de dados) é ativado assim que a horda invade o perímetro externo:
> * Rolagem de Sobrevivência por Unidade: para cada trabalhador que ficar fora da base quando a horda atingir a zona de perigo, o motor do jogo roda uma verificação baseada em atributos (velocidade de fuga + proximidade dos portões):
>   * Crítico / Salvo por Pouco: o trabalhador consegue correr desesperadamente e se atirar para dentro dos portões antes que se fechem (alguns podem chegar feridos ou perder o carregamento de recursos).
>   * Baixa / Devorado: o trabalhador é interceptado pelos insetos (mortes cinematográficas rápidas inspiradas em Starship Troopers), gerando perda econômica e penalidade temporária de moral para a colônia.
>
> 4. Pilares de Jogabilidade e Produção
> * Economia e Construção: Minério e Suprimentos coletados pelos trabalhadores para erguer e consertar muralhas, torres automáticas de tiro e geradores de energia. Fábricas e Refinarias processam matéria-prima em equipamentos avançados.
> * Recrutamento Militar: Soldados (Troopers), infantaria versátil com rifles de assalto para segurar a linha de frente nos portões. Robôs de Combate, unidades pesadas de suporte para segurar brechas nas muralhas.
> * O Combate contra a Horda: ondas periódicas escalonadas. Milhares de insetos com inteligência de enxame tentando escalar muralhas, cavar túneis ou esmagar defesas.
>
> 5. Próximos Passos Sugeridos para o Desenvolvimento
> 1. Prototipagem (MVP): criar um protótipo rápido em 3D onde unidades simples coletam cubos de recursos e voltam para um quadrado central antes de um cronograma de inimigos atacar.
> 2. Testar o Balanceamento do Risco: ajustar a janela de tempo entre o aviso da horda e a chegada dela, garantindo que o jogador sinta uma tensão real ao decidir se recolhe os trabalhadores mais cedo (perdendo recursos) ou arrisca mais um ciclo de coleta.

---

# Parte C · Protótipo

## C.1 Plano e estado

| Etapa | O que faz | Precisa provar | Estado |
|---|---|---|---|
| 0. Medir no iPhone | Página `?bench` com o mesmo enxame do jogo, de 1 a 32 mil insetos, nos 3 níveis de detalhe | Quantos insetos o aparelho desenha a 60 fps | Feita: no iPhone do usuário o fps caiu em 16 mil, e até 8 mil ficou bom (nota abaixo) |
| 1. Simulação sem gráfico | Mapa, base, nós de recurso, trabalhadores, ondas, sirene e alarme em `src/sim` (puro, 20 ticks/s, com semente) | Ciclo econômico funcionando e mesma semente = mesma partida | Pronta (10 testes) |
| 2. 3D mínimo e controles | Three.js, câmera de RTS (toque e mouse), HUD em Preact, botão "Alarme geral" | Legível e jogável no iPhone e no Mac | Pronta no Mac; falta ver no iPhone |
| 3. Portões e pânico | Rolagem por trabalhador, resultado animado, % sobre a cabeça, moral | A decisão "recolhe agora ou arrisca" existe e é justa | Pronta |
| 4. Balanceamento do risco | `npm run balance`: bots × janelas de aviso × sementes | A faixa de janela que dá tensão real | Primeira rodada feita (§C.3) |
| 6. Soldados e robôs | Recrutar, mover por toque, robô tampando brecha | Unidades ajudam e o toque é confiável | Pronta e testada pelo usuário no iPhone |
| 7. Construção da base | Muralha e portão traçados, torre, gerador, refinaria, fábrica, demolir, A* para pessoas | Construir no toque, energia e caminho funcionando | Pronta e testada pelo usuário no iPhone |
| 8. Curva gradual | Horda cresce aos poucos, inseto mais forte por onda, calma maior, nós que se recuperam e jazidas novas | A dificuldade sobe sem degrau e o jogo não seca | Pronta no Mac (§C.17) |
| 9. Produção e melhorias | Quartel, fila de treino, atirador, melhorias de quartel, fábrica e torre, painel do prédio | Prédios diferentes geram unidades diferentes e melhorar melhora | Pronta (§C.17) |
| 12. Arte e som | KayKit (personagens animados, prédios, muralha, minério), inseto novo com LOD por distância, som de combate | Mais bonito sem perder os 60 fps no iPhone | Pronta (§C.23) e jogada pelo usuário no iPhone, depois das correções de tremido e da arma |
| 17. Decisões, abrigo, salvar e mortes | Aviso de 20 s, caçadores atrás de tudo que está fora (com fila), fortim posto avançado (blindado, abrigo de 4, até 95 m), chamar um trabalhador, salvar manual e automático, mortes marcantes, conserto de prédios | Tudo o que o usuário pediu em 2026-11-05 | Pronta no Mac (§C.32); falta jogar no iPhone |
| 18. Visual do forte | Muralha de concreto com capa, painéis de grade e colunas; portões de chapa com faixa de perigo e batentes com luz; escombros; baluartes octogonais e casamatas com canhão; pátio de areia batida com trilhas; lajes sob os prédios; caixas, barris e holofotes; dunas no sombreado | Imagem de referência do usuário em 2026-11-06 | Pronta no Mac (§C.33); falta jogar no iPhone |
| 19. Biomas e tom sombrio | Bioma aleatório por partida (deserto, floresta, gelo) com chão, luz, névoa, flora, partículas e cor dos insetos; grade de cor sombria mas legível; concreto gasto; personagens menos cabeçudos | Pedido do usuário em 2026-11-06 | Pronta no Mac (§C.35); falta jogar no iPhone |
| 20. Espécies do enxame | Corredor, besouro couraçado, saltador (bote e pulo da muralha) e cuspidor (ácido de longe), com malhas, brilho e efeitos próprios; equilíbrio com bots | Pedido do usuário em 2026-11-06 | Pronta no Mac (§C.36); falta jogar no iPhone |
| 21. Tiros do pixelfx | Clarão de cano em quadros de pixel art no lugar das linhas: rajada "SMG burst" em laço nas torres, "Pistol shot" em cada disparo de soldado, atirador e robô | Pedido do usuário em 2026-11-06 | Pronta no Mac (§C.37); falta jogar no iPhone |
| 16. Recolher com informação | Tempo de volta sobre a cabeça, "não chega · %", contagem de risco, "Chamar em risco" com `hold`, minimapa | O jogador sabe quem chamar e quando, e pode chamar só esses | Pronta no Mac (§C.30); falta jogar no iPhone |
| 15. IA do enxame | Bandos e levas, desvio e ritmo próprios, caçadores do fortim e das tropas, escalada com 45 | Horda caótica que ataca o fortim, sem mudar muito a progressão | Pronta no Mac (§C.28); falta jogar no iPhone |
| 14. Fortim | Prédio com vagas para soldados (dano e alcance maiores, fora do alcance do enxame), Chamar, Sair, queda com dano; muralha escolhida pelo toque | O fortim ajuda sem desequilibrar e entrar é um toque | Pronta no Mac (§C.26); falta jogar no iPhone |
| 13. Acabamento da interface | Escolher tropas (toque, toque duplo, caixa), ordem por unidade, Parar e Auto, ícones e retratos, canteiro de obra | Mandar tropas sem o "Mover" de grupo; a grade lida pelo desenho; a obra se lê de longe | Pronta (§C.24). A escolha de tropas foi jogada no iPhone; a obra nova falta |
| 11. Escalar e cavar | Pilha que passa por cima da muralha, túnel de escavadores com aviso | Pressão nas tropas e dentro da base, sem quebrar a progressão | Pronta (§C.21) |
| 10. Interface e estilo | Recursos no topo, minimapa, seleção, grade 3×3 com atalhos, obra com andaime, marcador de ordem, cor do time | Tudo pela grade, atalhos, minimapa, obra, HUD ≤ 35% em pé | Pronta e testada pelo usuário |
| 5. Horda de verdade | Agentes com flow field, separação, worker, torre e brechas | Milhares a 60 fps no iPhone, sem engasgo | Pronta. No iPhone, com `?horda=8000`, o jogo ficou "muito fluido" (sem número: o contador não apareceu para o usuário) |

**Etapa 0 no iPhone (2026-11-05):**
- **O que o usuário viu:** o fps caiu quando colocou 16 mil insetos, e ele achou o resultado muito bom.
- **O que não foi confirmado:** o nível de detalhe (o padrão da página é o médio, com 204 triângulos) e o número exato de fps. O envio automático do celular não chegou ao Mac.
- **Orçamento adotado para a Etapa 5:**
  - até 8 mil insetos vivos no iPhone com detalhe médio;
  - mais que isso com LOD misto (baixo ao longe);
  - a onda total pode passar disso, com fila fora da tela.
- **Se precisar de precisão:** rodar o "Rodar teste" completo e anotar a linha do resumo.

## C.2 Regras do protótipo (os números estão em `src/sim/config.ts`)

- **Ciclo da onda:**
  1. Calma: 110 s na primeira onda, 8 s a menos por onda, com piso de 60 s.
  2. A sirene toca e começa a janela de aviso (30 s).
  3. A horda cruza o perímetro vermelho (110 m) e rola o pânico.
  4. Os portões fecham 6 s depois. Os guardas seguram até mais 6 s para quem foi salvo e ainda está chegando.
  5. Ataque à muralha por 22 s, e começa a próxima onda.
- **Recursos (os estoques acabam):**

  | Anel | Distância | Nós | Carga por viagem | Estoque por nó |
  |---|---|---|---|---|
  | Perto | 24–40 m | 6 | 3 | 45 |
  | Médio | 46–70 m | 7 | 7 | 90 |
  | Longe | 76–100 m | 8 | 14 | 160 |

- **Trabalhadores:**
  - 10 no começo, até 24; recrutar custa 30 de minério.
  - Velocidade de 2,6 a 3,4 m/s (o atributo de fuga).
  - Carregado anda a ×0,85; ferido, a ×0,7 por 45 s; com moral abaixo de 50, a ×0,85.
- **Fator pânico:**
  - Tempo de corrida = (distância até o portão mais perto + travessia) / (velocidade × 1,6 em disparada).
  - Chance = 50% + (6 s − tempo de corrida) × 8% + (velocidade − 3) × 12%, limitada entre 3% e 97%. É 0% se a corrida passar de 12 s.
  - Entre os salvos, 40% chegam limpos, 35% largam a carga e 25% chegam feridos.
  - Quem é devorado perde a carga, e a moral cai 12 (recupera 0,1 por segundo).
- **Rolagem:** usa RNG por contador (semente, onda, id), então não depende da ordem dos trabalhadores. Os testes cobrem isso e o hash de determinismo.
- **Horda do protótipo:** é analítica, só visual (`src/sim/horde.ts`).
  - Avança devagar desde a sirene, dispara ao cruzar o perímetro, ataca a muralha e morre durante o ataque.
  - Quem é devorado é pego por um "saltador" que vem de fora.
  - Na Etapa 5 vira agentes de verdade.

## C.3 Resultados do balanceador (Etapa 4, primeira rodada)

Rodada com `npm run balance -- --seeds 30 --waves 8`. Os bots têm foco fixo, tocam o alarme num atraso fixo em relação à sirene e recrutam até 14 trabalhadores.

| Janela de aviso | Melhor seguro (alarme na sirene ou antes) | Melhor arriscado (alarme depois) | Diferença | Leitura |
|---|---|---|---|---|
| 15 s | médio · na sirene: 1472 ± 105 | médio · +10 s: 1077 ± 301, 3,6 mortes/onda | −27% | Arriscar não compensa: punitivo demais |
| 20 s | médio · na sirene: 1548 ± 43 | médio · +10 s: 1501 ± 80, 2,1 mortes/onda | −3% | **Empate com o dobro da variância: é a faixa de tensão** |
| 30 s (atual) | médio · na sirene: 1568 ± 34 | longe · +10 s: 1695 ± 104, 1,0 morte/onda | +8% | Arriscar compensa um pouco |
| 45 s | longe · na sirene: 1571 ± 61 | longe · +20 s: 1986 ± 44, 0,3 morte/onda | +26% | Esperar quase não custa nada: sem tensão |

**Sugestão:** uma janela de aviso entre 20 e 25 s, a confirmar jogando. Os bots são simples: um jogador de verdade chama mais cedo quem está longe e arrisca com quem está perto. Por isso vale testar um alarme por grupo (§C.7).

### Segunda rodada, com combate de verdade (Etapa 5)

Rodada com `npm run balance -- --seeds 8 --waves 8 --warning 20,30` (cerca de 7 min). Agora todos os bots também recrutam até 10, consertam a muralha na calma e põem torres com o que sobra.

| Janela | Melhor seguro | Melhor arriscado | Diferença | Leitura |
|---|---|---|---|---|
| 20 s | longe · na sirene: 1188 ± 53 | médio · +10 s: 1126 ± 64, 1,3 mortes/onda | −5% | Arriscar já não compensa. Com longe · +10 s, a colônia cai em 13% das partidas |
| 30 s (atual) | longe · na sirene: 1260 ± 41 | longe · +10 s: 1281 ± 81, 1,0 morte/onda | +2% | **Quase empate com o dobro da variância: a faixa de tensão** |

- **Por que a janela ideal subiu de 20–25 s para 30 s:** com combate, perder trabalhador custa em cascata. Menos minério vira menos torres e menos conserto, e aí vem a derrota.
- **Nunca tocar o alarme:** perde a colônia em 13% a 75% das partidas.
- **Sugestão atual:** manter 30 s. Confirmar jogando.

## C.4 Como rodar

- **Servidores:**
  - `npm run dev`, ou o launch "posto" (porta 5220).
  - Para o iPhone na rede local, o launch "posto-rede" (5222, `--host`). Abra `http://<ip-do-mac>:5222/`.
- **Arte:** `npm run art` copia da coleção KayKit local o que está em `tools/art-manifest.ts` para `public/assets/kaykit/`. Os arquivos precisam ter sido baixados com `git lfs pull --include` na coleção.
- **Parâmetros da URL:**
  - `?semarte`: joga com os modelos feitos em código (sem KayKit).
  - `?bench`: Etapa 0, a medição do enxame. O resumo fica na tela.
  - `?perf`: medidor de fps. Na Etapa 5 ele também mostra os insetos vivos e o custo da simulação no worker (ms por tick).
  - `?seed=N`: semente fixa.
  - `?onda=N`: começa direto na onda N, com 60 × N de minério para torres.
  - `?horda=N`: a primeira onda já sai com N insetos (teto de 20 mil). Serve para medir o jogo no iPhone.
  - `?aviso=S`: janela de aviso em segundos.
- **Comandos:**
  - `npm test` (80 testes), `npm run typecheck` e `npm run build`.
  - `npm run balance -- --seeds 30 --waves 8 --warning 15,20,30,45`.
- **Console (só em dev):**
  - `await posto.simulate(s)` pula s segundos de jogo (no worker, por isso é assíncrono).
  - `posto.frames(n)` desenha n quadros.
  - `posto.snap('nome')` grava `reports/snap-nome.png`.
  - `posto.session.world` mostra o estado.
- **Controles (Etapa 10):**
  - A grade de comandos 3×3 (embaixo, à direita) muda com o contexto. Atalhos: Q W E / A S D / Z X C; espaço toca o alarme e Esc volta.
  - Câmera: setas movem e Shift + setas giram (WASD agora é da grade). O minimapa leva a câmera com um toque.
  - Prédio e torre: tocar neles (fora do modo construir) abre o painel, com treinar, melhorar, a fila com progresso e "Fechar".
  - Construir: "Construir" abre a paleta. Prédio: escolher e tocar no chão (o fantasma fica verde ou vermelho), depois "Construir". Muralha e portão: arrastar um dedo do começo ao fim, depois "Construir". Dois dedos movem a câmera.
  - Demolir (Etapa 14): prédio pelo painel dele; muralha tocando nela fora do modo construir (o fantasma vermelho mostra o que sai). Volta metade.
  - Fortim (Etapa 14): com tropas escolhidas, tocar nele as manda entrar; no painel dele, "Chamar" e "Sair".
  - Tropas (Etapa 13):
    - "+ Soldado", "+ Atirador" e "+ Robô" recrutam.
    - Escolher: tocar numa tropa; dois toques seguidos escolhem todas daquele tipo na tela; segurar parado um instante e arrastar puxa uma caixa (no Mac também Ctrl/⌘ e arrastar); Shift + clique põe ou tira uma. "Soldados" (Z) e "Robôs" (X) escolhem todos de uma vez.
    - Mandar: com tropas escolhidas, um toque no chão (ou clique direito, mesmo em cima de um prédio) leva todas para lá em formação. Tocar num prédio escolhe o prédio.
    - Na grade: "Parar" (ficam onde estão), "Auto" (voltam aos portões e brechas), "Todas" e, com tipos misturados, "só soldados/atiradores/robôs".
  - Arrastar move a câmera; pinça ou roda dá zoom.
  - Para girar: dois dedos, o botão direito ou Shift + arrastar.
  - Teclado: WASD ou setas para mover, Q e E para girar.

## C.5 Estrutura

- **`src/sim/`:** núcleo puro, sem DOM: `config`, `world`, `workers`, `panic`, `swarm` (a horda), `units` (soldados, atiradores e robôs), `build` (construção e energia), `production` (treino e melhorias), `path` (A* das pessoas), `step`, `commands`, `view` (o retrato para a tela) e `hash`.
- **`src/game/`:**
  - `sim.worker.ts`: o mundo mora aqui;
  - `protocol.ts`: as mensagens;
  - `session.ts`: na tela; acumula os ticks, manda os comandos e guarda o último retrato.
  - `controls.ts`: a escolha (prédio, torre ou tropas) e o modo "Construir", compartilhados entre o HUD e o toque no mapa.
  - `ghost.ts`: o fantasma da construção, calculado na tela com o retrato.
- **`src/render/`:** `stage`, `rtsCamera`, `bugMesh` e `bugs` (o enxame instanciado), `world3d`, `assets` e `chars` (arte do KayKit), `portraits` (retratos da interface), `sites` (canteiro de obra), `labels` e `perf`.
- **`src/ui/`:** `App.tsx` (HUD), `CommandCard.tsx` (grade 3×3), `Minimap.tsx`, `icons.tsx` (ícones e retratos) e `style.css`.
- **`src/audio/sound.ts`:** sirene, buzina, portão, mordida, todos sintetizados.
- **Outros:** `src/bench/bench.ts` (Etapa 0), `tests/` e `tools/balance.ts`.

## C.6 Arte

- **Hoje:** tudo é procedural (cubos de recurso, trabalhadores de cápsula e um inseto próprio de seis patas).
- **Do KayKit, quando for a hora de arte:**
  - Space Base Bits: módulos, `drill_structure`, `terrain_mining` e túneis;
  - Resource Bits: pepitas e caixas;
  - Space Ranger, Combat Mech e Survivalist.
- **Antes de usar o KayKit:** os `.bin` da coleção local são ponteiros do Git LFS (130 bytes). Antes de usar, é preciso rodar `git lfs pull` na coleção, o que precisa da autorização do usuário.
- **Insetos:** malha própria, longe do visual dos filmes (§A.5).

## C.7 Próximos passos e decisões pendentes

1. ~~Medir no iPhone (Etapa 0)~~: feito; orçamento de até 8 mil vivos (§C.1).
1. ~~Jogar a Etapa 6 no iPhone~~: feito; o HUD em pé ficou em 35% da tela (§C.19).
2. ~~Janela de aviso~~: o usuário decidiu 20 s em 2026-11-05 (era 30; §C.31).
3. ~~Etapa 5: horda de verdade~~: feita (§C.8–C.9).
4. ~~Escolher o nome do jogo~~: o usuário escolheu **Outpost 7** em 2026-11-06 (o codinome era Posto Avançado).
5. ~~Ideias que o protótipo levantou~~: chamar só quem está em risco, tempo de volta e aviso de quem não chega, feitos na Etapa 16 (§C.29–C.30).
6. ~~**Fortim**~~: feito na Etapa 14 (§C.25–C.26). Ideia original (nome provisório; pedido do usuário em 2026-11-05):
   - **De onde veio:** um prédio parecido do StarCraft. Só a mecânica entra; nome e visual são nossos.
   - **Ideia:** um prédio de defesa com vagas para um número limitado de soldados (por exemplo, 4).
   - **Lá dentro:** os soldados ficam protegidos e o dano deles sobe (e talvez o alcance).
   - **O risco:** o enxame pode morder o fortim. Se ele cair, os soldados saem para fora, expostos.
   - **Como caberia no que existe:**
     - o fortim é mais um prédio com HP, que o enxame já sabe morder;
     - a tropa lá dentro sai da mira dos insetos;
     - "Entrar" e "Sair" na grade, e com tropas escolhidas, tocar no fortim manda entrar;
     - melhorar o fortim dá mais vagas ou mais dano.
7. ~~Decisões abertas das Etapas 14 e 15~~: o usuário decidiu em 2026-11-05. O fortim funciona como posto avançado, e tudo que está fora chama atenção de forma equilibrada (§C.31–C.32).
8. **Custo da IA no iPhone:** o usuário mandou manter como está (no Mac, 1,8 ms por tick com 8 mil; §C.28).
9. **Aberto:** compensar a dificuldade que o aviso de 20 s trouxe? (§C.32)

## C.8 Etapa 5: a horda de verdade (especificação)

**Objetivo:** trocar a horda analítica por agentes simulados. Tem que provar que milhares de insetos rodam a 60 fps no iPhone, com a simulação num Web Worker e sem engasgo.

- **Grade:** 280×280 células de 1 m, centrada na base. As células são de cinco tipos:
  - livre;
  - muralha (anel de 2 m de espessura em volta da base de 24 m, HP por célula);
  - portão (4 m de vão em cada lado, aberto na calma e na sirene, fechado com HP próprio depois);
  - entulho (muralha destruída, passável e um pouco mais lenta);
  - núcleo (o depósito no centro).
- **Flow field:**
  - Dijkstra com custo inteiro a partir do núcleo.
  - Muralha e portão fechado custam proporcionalmente ao HP, então o enxame procura o ponto fraco sozinho.
  - Recalcula só quando uma célula cai ou um portão muda, no máximo duas vezes por segundo.
- **Insetos:**
  - **Vida e chegada:** cada inseto tem vida, velocidade e posição em typed arrays (SoA). Nascem na sirene fora do mapa e avançam devagar até o perímetro, que cruzam na hora marcada, e aí disparam.
  - **Movimento:** dentro da grade seguem o campo e se separam dos vizinhos (hash de 1 m, até 12 vizinhos).
  - **Bloqueio:** se a próxima célula está bloqueada, mordem essa célula. Quem chega ao núcleo morde o núcleo.
  - **Dentro dos muros:** um inseto que encosta num trabalhador lá dentro mata esse trabalhador. É o custo de uma brecha.
  - **Portão segurado:** se os guardas seguram um portão aberto para quem foi salvo, os insetos que chegam antes de ele fechar entram.
- **Torres automáticas:**
  - As quatro dos cantos já atiram. Há mais quatro vagas na muralha, a 60 de minério cada.
  - Escolhem o alvo mais perto pelo hash grosso (8 m), refazem a mira 4 vezes por segundo e atiram em hitscan.
- **Muralha:**
  - O dano à muralha fica de uma onda para a outra.
  - "Consertar muralha" custa minério proporcional ao dano. Os portões são refeitos de graça a cada onda.
- **Fim da onda:** termina quando todos os insetos morrem ou depois de 90 s de ataque, quando os que sobram recuam.
- **Derrota:** quando o núcleo chega a 0.
- **Web Worker:**
  - O worker tem o mundo inteiro. A tela pede "avance N ticks e aplique estes comandos" e recebe um retrato.
  - O retrato traz o mundo sem as grades, o HP das células de muralha e um buffer transferível com 6 floats por inseto: posição anterior, posição atual, direção e estado.
  - Testes e balanceador continuam rodando a simulação direto, sem worker.
- **Deve provar:**
  - mesma semente, mesma partida (hash), agora com o enxame;
  - as primeiras ondas seguram sem brecha e as seguintes exigem torres ou conserto (medido no balanceador);
  - 4 mil insetos a 60 fps no iPhone com `?perf`.

## C.9 Etapa 5: como ficou

- **O que entrou:** tudo da §C.8.
- **Números da horda** (`src/sim/config.ts`):

  | Item | Valor |
  |---|---|
  | Muralha (por célula) | 800 HP |
  | Portão (por célula) | 400 HP |
  | Núcleo | 1500 HP |
  | Inseto | 30 HP |
  | Mordida | 3/s na muralha (no máximo 4 insetos mordendo a mesma célula) e 3/s no núcleo |
  | Torre | 70 de dano por segundo, alcance de 30 m, custa 60 |
  | Conserto | 0,05 de minério por HP |
  | Onda | 300 insetos + 120 por onda (teto de 4 mil; `?horda` muda) |

- **Teto de mordida:** antes dele, a primeira onda inteira mordia o mesmo portão e derrubava a base. Agora só 4 insetos mordem a mesma célula; os de trás empurram, mas não fazem dano.
- **Ajuste (`npm run balance` e um bot de defesa, 3 sementes):**
  - Sem construir nada, a colônia cai na onda 5. A primeira brecha aparece na onda 2.
  - Consertando a muralha e erguendo as 8 torres, ela chega à onda 10 com o núcleo entre 40% e 50%. As brechas começam na onda 5.
  - Ou seja: as ondas iniciais seguram sem brecha, e as seguintes exigem torre e conserto, como a especificação pedia.
- **Desempenho no Mac (M4):**
  - Node, 8 mil insetos: 0,5 a 1,3 ms por tick.
  - No worker do navegador, com o painel oculto (e, por isso, rebaixado): 2,7 a 7,5 ms por tick.
  - Quadro na tela: 1 a 3 ms de CPU.
  - O flow field leva uns 15 ms para recalcular a grade de 280×280, mas isso acontece no worker e só quando uma célula cai ou um portão muda.
- **Determinismo:** o hash agora inclui o enxame e a muralha, e o teste de mesma semente passa com duas ondas de combate.
- **Achado de design:** um portão segurado aberto para um trabalhador salvo deixa entrar os insetos que chegam antes. O núcleo leva dano mesmo sem brecha. É um custo de "segurar o portão" que o GDD não previa e que vale manter.

## C.10 Etapa 6: soldados e robôs (especificação)

Escolhida pelo usuário em 2026-11-05 como o próximo pilar do GDD (§4, recrutamento militar). Hoje o jogador só assiste ao ataque; com unidades, ele passa a ter o que fazer.

- **Soldado** (infantaria com rifle; o nome do filme fica fora, §A.5):

  | Custo | Vida | Dano | Alcance | Velocidade | Limite |
  |---|---|---|---|---|---|
  | 40 de minério | 60 HP | 22/s | 16 m | 4 m/s | 16 soldados |

  - Por padrão, os soldados se dividem entre os 4 portões, do lado de dentro, em formação. É o "segurar a linha de frente nos portões" do GDD.
  - Atiram por cima da muralha (sem linha de visão no protótipo).
- **Robô de combate** (unidade pesada):

  | Custo | Vida | Dano | Alcance | Velocidade | Limite |
  |---|---|---|---|---|---|
  | 120 de minério | 450 HP | 40/s | 9 m | 2,6 m/s | 4 robôs |

  - O tiro tem respingo: metade do dano acerta quem está a até 1,5 m do alvo.
  - Por padrão, cada robô vai para uma brecha diferente (célula de entulho) e fica parado nela. **Robô parado tampa a célula:** para o enxame ela vira muralha com o HP do robô, então os insetos mordem o robô ou procuram outro caminho (o flow field recalcula).
  - Sem brecha, os robôs esperam perto do núcleo.
- **Mordida:** um inseto que encosta num soldado ou robô morde (3/s, até 4 por unidade). Unidade com vida zero cai, e o corpo ou a carcaça fica até o fim da onda.
- **Entre ondas:** quem sobreviveu volta com a vida cheia.
- **Comando por toque:**
  - "Mover soldados" ou "Mover robôs" e depois um toque no chão leva o grupo para lá, em formação. Um marcador fica no chão.
  - "Auto" devolve o grupo ao comportamento padrão.
  - Dá para mandar soldados para fora dos muros (escoltar trabalhadores), por conta e risco.
- **Tiro:** a mesma mira das torres (hash grosso, re-mira 4 vezes por segundo), em hitscan, com traço visível.
- **Determinismo:** unidades e comandos entram no hash.
- **Deve provar:**
  - soldados nos portões reduzem as brechas;
  - um robô parado numa brecha segura a entrada e o enxame muda de rota;
  - com unidades, o bot de defesa chega mais longe ou com mais núcleo do que só com torres;
  - no celular, mover por toque é confiável.

## C.11 Etapa 6: como ficou

- **O que entrou:** tudo da §C.10. Soldados vão sozinhos para os portões, e robôs vão para o meio da maior brecha aberta (camada de dentro da muralha).
- **Tampão do robô:** cobre 5×5 células de entulho ou portão. Uma tentativa com 3×3 deixava escapar a terceira coluna de uma brecha de 3 m.
- **O enxame desvia de robô parado:** o campo cobra o HP do robô, então a horda procura outro ponto fraco em vez de morder.
- **Ajuste:** os números da §C.10 mudaram depois do bot de defesa.
  - **O problema:** atrás da muralha os soldados ficavam seguros demais. Com 22 de dano e 16 m de alcance, 16 soldados seguravam 12 ondas sem perder ninguém.
  - **Valores finais:**

    | Unidade | Custo | Dano | Alcance |
    |---|---|---|---|
    | Soldado | 50 | 12/s | 12 m |
    | Robô | 120 | 30/s | 9 m |

  - **A horda** cresce 170 insetos por onda.
- **Bot de defesa (3 sementes):**

  | O que o bot constrói | Até onde chega |
  |---|---|
  | Só torres | Cai na onda 8 |
  | Só tropas | Cai na onda 9 |
  | Torres, 2 robôs e 16 soldados | Chega à 15 e cai na 16 |

  Ou seja: as unidades levam mais longe e o jogo ainda tem fim.
- **Toque:** "Mover soldados" e um toque no chão levaram os 6 soldados para lá em formação (testado no navegador do Mac, clique real). No celular em pé, o HUD cabe.
- **Testes:** 6 novos, 23 no total, cobrindo:
  - recrutar e o limite;
  - ida aos portões e ponto de reunião;
  - soldados ajudam;
  - robô na brecha segura o núcleo;
  - mordida derruba unidade;
  - determinismo com unidades.
- **Balanceador com tropas** (`npm run balance -- --seeds 6 --waves 10 --warning 30`). Os bots juntam primeiro para as torres e depois compram 2 robôs e soldados:

  | Política | Minério | Mortes por onda | Colônia perdida |
  |---|---|---|---|
  | longe · na sirene (melhor segura) | 1431 ± 42 | 0,08 | 0% |
  | longe · +10 s (melhor arriscada) | 1490 ± 94 | 0,8 | 0% |
  | +20 s | — | — | até 17% |
  | Nunca tocar o alarme | — | — | 100% (cai entre as ondas 5 e 7) |

  - A janela de 30 s continua sendo a faixa de tensão: arriscar 10 s rende 4% a mais, com o dobro da variância.
- **Achado: soldado antes de torre é armadilha.**
  - Na primeira rodada, os bots compravam um soldado assim que tinham 70 de minério e nunca juntavam para as torres, que rendem mais dano por minério.
  - Com isso, só a coleta longe sustentava a defesa. Na mesma semente, o bot que comprava cedo caiu na onda 10; o que juntou para as torres chegou à 12 com o núcleo inteiro.
  - Pode valer um aviso no jogo ou soldados mais baratos no começo. Fica para decidir jogando.
- **Pendências:**
  - Unidades quase nunca morrem, porque ficam atrás da muralha ou o enxame desvia delas.
  - Falta pressão de verdade sobre as tropas: insetos que miram unidades, cuspe à distância ou escalada (o pilar "escalar e cavar").

## C.12 Etapa 7: construção da base (especificação)

Escolhida pelo usuário em 2026-11-05 (GDD §4: economia e construção). O quadrado do posto continua fixo: a muralha original, os 4 portões e as 4 torres dos cantos. O resto o jogador põe onde quiser, até 50 m do centro.

- **Modo construir:** o botão "Construir" troca a barra de baixo por uma paleta com o custo de cada item.
  - Para pôr um prédio, toca-se no chão. Um fantasma verde ou vermelho mostra onde ele vai e se cabe.
  - Muralha e portão se traçam arrastando um dedo, do começo ao fim. Dois dedos movem a câmera.
  - "Demolir" devolve metade do custo. A muralha original não se demole.
- **Itens:**

  | Item | Tamanho | Custo | HP | Efeito |
  |---|---|---|---|---|
  | Muralha | 1 m por célula | 2 por metro | 800 por célula | Bloqueia o enxame, que morde como na muralha original |
  | Portão | até 5 m por traço | 10 por metro | 400 por célula | Pessoas passam sempre; fecha para o enxame junto com os portões do posto |
  | Torre | 2×2 | 60 | 600 | Atira como as dos cantos; gasta 1 de energia |
  | Gerador | 2×2 | 80 | 400 | +3 de energia |
  | Refinaria | 3×3 | 150 | 800 | +25% em cada entrega de minério (até 2 refinarias) |
  | Fábrica | 3×3 | 150 | 800 | Libera os robôs (sem fábrica, não há robô) |

- **Energia:**
  - O núcleo dá 4, o bastante para as torres dos cantos.
  - Cada torre gasta 1. Torre sem energia não atira e fica apagada; as mais antigas têm prioridade.
  - O HUD mostra "Energia usada/total".
- **Enxame contra prédios:**
  - Prédio é obstáculo com HP. O flow field cobra pelo HP, então o enxame contorna ou morde.
  - Um prédio destruído vira entulho e some (torre incluída).
  - As 4 vagas fixas de torre da Etapa 5 saem; a torre passa a ser livre.
- **Pessoas (trabalhadores, soldados e robôs):**
  - Andam por um caminho A* na grade de 1 m que respeita muralhas e prédios e passa pelos portões.
  - O caminho é suavizado por linha de visada.
  - A rolagem de pânico continua medindo até o portão do posto mais perto.
- **Deve provar:**
  - traçar muralha e pôr prédios funciona no toque;
  - torre sem energia não atira;
  - muralha nova desvia ou segura o enxame;
  - trabalhadores contornam muralhas e passam pelos portões novos;
  - refinaria e fábrica fazem diferença;
  - continua determinístico.

## C.13 Etapa 7: como ficou

- **O que entrou:** tudo da §C.12.
- **Grade:** prédios são células STRUCT com o HP do prédio inteiro, espelhado nas células para o flow field. Muralhas e portões do jogador entram na mesma lista da muralha do posto.
  - O conserto cobre as muralhas do jogador.
  - Os portões do jogador são refeitos de graça a cada onda, como os do posto.
- **Muralha traçada:** é uma linha 4-conectada, sem buraco na diagonal, que o enxame atravessaria. Não passa por cima de nó de recurso (deixa um vão ali).
- **Pessoas:** trabalhadores, soldados, robôs e a corrida do pânico agora andam por A*.
  - Num teste, uma muralha de x = 20 até o limite de construção, com portão no meio, faz o caminho passar pelo portão em vez de contornar a ponta.
- **Testado no navegador do Mac com clique e arrasto de verdade:**
  - Torre: tocar, ver o fantasma verde e "Construir". Ela nasceu apagada (energia 5/4).
  - Muralha: arrastar 27 m custou 54.
  - Gerador: 7 de energia, e a torre acendeu e atirou.
  - Na onda, o enxame contornou as pontas da muralha nova.
  - Em pé, a paleta, o aviso e os botões cabem.
- **Bot de defesa ingênuo:**
  - Põe torres fora da muralha e um gerador quando falta energia, sem nenhuma proteção.
  - Cai nas ondas 12 e 13 (antes caía na 16). O custo da energia e as torres expostas pesam.
  - Com refinaria, juntou cerca de 20% mais minério, mas caiu na mesma faixa.
  - Um jogador que protege as torres com muralha deve ir mais longe. A confirmar jogando.
- **Testes:** 9 novos, 32 no total, cobrindo:
  - torre, energia e gerador;
  - onde não dá para construir;
  - torre sem energia não atira;
  - muralha 4-conectada que o enxame morde;
  - pessoas passando pelo portão novo;
  - refinaria rende mais;
  - demolir devolve metade e não mexe na muralha do posto;
  - prédio destruído vira entulho;
  - determinismo com construção.
- **Pendências:**
  - Não há aviso de "torre exposta".
  - A muralha não se encaixa sozinha na muralha do posto (fica a critério do traço).
  - O raio de construção de 50 m não aparece na tela.

## C.14 Roteiro do jogo (pedidos do usuário em 2026-11-05)

Depois de testar a Etapa 7 no iPhone, o usuário pediu três coisas:
1. **A horda cresce aos poucos.** Se as primeiras ondas ficarem fáceis demais, vale subir um pouco o dano de cada inseto. A intenção é o jogador ir juntando recursos, construindo e expandindo a base e as defesas.
2. **Tipos diferentes de prédio geram unidades diferentes.** Os prédios podem ser melhorados, e a melhoria melhora as unidades.
3. **Interface e estilo visual** dos prédios e personagens com o StarCraft como referência.

O roteiro fica assim:

| Etapa | O quê | Pedido |
|---|---|---|
| 8 | Curva gradual da horda: poucos insetos no começo, cada um um pouco mais forte a cada onda, mais calma para construir | 1 |
| 9 | Prédios de produção (quartel e fábrica) com fila de treino; melhorias de prédio que melhoram as unidades; melhoria de torre; a unidade nova "atirador" | 2 |
| 10 | Interface e estilo visual com o StarCraft como referência de gênero (§C.16) | 3 |
| 11 | Insetos que escalam e cavam (pressão nas tropas) | pilar do GDD |
| 12 | Arte e som (KayKit, mortes, sirene) | pilar do GDD |

## C.15 Etapas 8 e 9 (especificação)

### Etapa 8: curva gradual

- **Insetos por onda:**
  - Fórmula: 160 + 40 × onda + 4 × onda² (onda começando em 0), com teto de 4 mil.
  - Exemplos: 160, 204, 256, … onda 5 = 460, onda 10 = 960, onda 15 = 1660, onda 20 = 2560.
  - Antes era 300 + 170 × onda: muita gente cedo, e crescimento linear.
- **Cada inseto fica mais forte:** a cada onda, +5% de vida e +4% de mordida. Na onda 10 isso dá 1,5× de vida e 1,4× de mordida.
- **Primeiras ondas:** a mordida base sobe de 3 para 4 para que elas ainda peçam atenção.
- **Calma maior para construir:** 120 s na primeira onda, 4 s a menos por onda, com piso de 80 s.
- **Deve provar:**
  - sem construir nada, a colônia cai cedo, mas não na primeira onda;
  - quem constrói e expande vai bem mais longe;
  - a dificuldade sobe sem degrau.

### Etapa 9: produção e melhorias

- **Quartel** (3×3, 100 de minério, 900 HP):
  - **Treina:** soldado (50, 6 s) e, no nível 3, o atirador.
  - **Fila e limite:** até 5 na fila. Cada quartel sustenta 8 soldados ou atiradores.
- **Fábrica:**
  - **Treina:** robô (120, 15 s).
  - **Fila e limite:** até 3 na fila. Cada fábrica sustenta 2 robôs.
- **Atirador** (75, 10 s):

  | Vida | Dano | Alcance | Velocidade |
  |---|---|---|---|
  | 40 HP | 30/s | 22 m | 3,6 m/s |

  Mira só um alvo e fica atrás dos soldados (mais para dentro nos portões).
- **Melhorias de prédio:** levam tempo (20 s; o prédio não treina enquanto melhora) e valem para todas as unidades daquele tipo (pelo maior nível entre os prédios iguais).

  | Prédio | Nível | Custo | Efeito |
  |---|---|---|---|
  | Quartel | 2 | 150 | Soldados com +40% de dano e +25% de vida |
  | Quartel | 3 | 250 | Libera o atirador; soldados com +20% de dano |
  | Fábrica | 2 | 200 | Robôs com +30% de dano e de vida |
  | Fábrica | 3 | 300 | Mais +30%; respingo de 2,2 m |
  | Torre (cada uma) | 2 | 80 (10 s) | +35% de dano, +4 m de alcance |
  | Torre (cada uma) | 3 | 150 (10 s) | Mais +35%; respingo de 1,5 m |

- **Como se usa:**
  - Tocar num prédio ou numa torre (fora dos modos construir e mover) abre o painel dele: nome, nível, vida, fila com a barra de progresso e os botões Treinar e Melhorar.
  - Um anel marca o prédio escolhido.
  - Os botões "+ Soldado" e "+ Robô" do painel Tropas continuam como atalho: mandam para a fila do prédio mais livre.
- **Unidades novas** nascem na porta do prédio e seguem o comportamento padrão (ou o ponto de reunião do grupo).
- **Deve provar:**
  - treinar leva tempo e respeita o limite por prédio;
  - melhoria muda o dano e a vida de quem já existe e de quem vai nascer;
  - torre melhorada atira mais forte e mais longe;
  - o atirador só aparece com o quartel no nível 3;
  - continua determinístico.

## C.16 Etapa 10: interface e estilo visual com o StarCraft como referência (plano)

O StarCraft entra como referência de **gênero e de leitura**, como o Starship Troopers entrou no GDD. É o jeito clássico de um RTS mostrar muita informação sem atrapalhar.

- **O que vale aproveitar (convenções do gênero):**
  - Barra de baixo em três partes: minimapa, painel da seleção (retrato, vida, nível, fila) e grade de comandos 3×3 com atalhos de teclado.
  - Recursos e população no topo, à direita.
  - Marcador no chão a cada ordem dada.
  - Seleção por toque e por caixa (arrastar com dois dedos ou com o mouse).
  - Silhuetas legíveis de cima, cor do time nas unidades e prédios, luzes de status (ligado/sem energia/treinando).
  - Prédios bem maiores que as unidades, com animação de obra (andaime subindo).
  - Estilo industrial e militar robusto: placas, rebites, faixas de aviso.
- **O que fica de fora:**
  - nomes, facções e raças do StarCraft;
  - o desenho de unidades, prédios e ícones de lá;
  - sons, vozes e músicas;
  - a "gosma" que se espalha pelo chão;
  - a paleta e o logotipo.
- **No celular:**
  - A grade de comandos vira botões grandes no canto de baixo à direita.
  - O minimapa fica pequeno no canto de cima à esquerda e se toca para pular a câmera.
  - O painel da seleção abre embaixo.
- **Depende:** a arte da Etapa 12. Até lá, o estilo vem por forma, cor e luz nos modelos feitos em código.

## C.17 Etapas 8 e 9: como ficou

- **Etapa 8: curva.** Ficou como a §C.15: 160 + 40n + 4n² insetos, +5% de vida e +4% de mordida por onda, mordida base 4 e calma de 120 → 80 s.
- **Achado: o mapa secava.**
  - Com a curva gradual, o jogo dura mais, e todo o minério do mapa (2180, a soma dos nós) acabava por volta da onda 10. Sem renda, não dá para crescer.
  - **Economia nova** (`config.economy`):
    - cada nó recupera 25% do estoque no fim de cada onda;
    - a cada 2 ondas surge uma jazida rica (260 de estoque, 16 por viagem) a 80–106 m;
    - quanto mais o jogo anda, mais longe está o minério bom. É o "expandir" do pedido, com o risco do GDD.
- **Etapa 9: produção e melhorias.** Ficou como a §C.15:
  - **Quartel:** treina soldado e, no nível 3, atirador. Fila de 5; 8 de infantaria por quartel.
  - **Fábrica:** treina robô. Fila de 3; 2 robôs por fábrica.
  - **Melhorias:** levam 20 s (10 s na torre). Valem pelo maior nível do tipo de prédio e mudam a vida de quem já existe.
  - **Atirador:** fica atrás dos soldados nos portões. Atirador e soldado andam juntos no "Mover soldados".
  - **Painel do prédio:** abre com um toque e mostra nome, nível, vida, fila com %, números das unidades e o limite.
  - **No 3D:** divisas de nível nos prédios e nas torres; a torre ganha segundo cano no nível 2 e canhão no 3. Uma luz azul acende treinando e verde melhorando, e um anel amarelo marca o escolhido.
- **Bots (2 sementes, até 25 ondas):**

  | Bot | Até onde chega |
  |---|---|
  | Sem construir nada | Cai na onda 6 (primeira brecha na 3) |
  | Torres nível 1 e unidades, sem melhorar | Cai na onda 12 |
  | Melhorando torres até o nível 3 | Chega à onda 25 com folga |

  - **Leitura:** a progressão existe e as melhorias pesam muito (torre nível 3 = 1,7× de dano + respingo). Se ficar fácil jogando, o ajuste é nos custos de melhoria ou no crescimento da vida dos insetos.
  - **Nota sobre o bot:** ele põe o quartel fora da muralha e o perde. É ingênuo, não regra.
- **Testado no navegador do Mac:**
  - quartel posto;
  - painel aberto;
  - 2 soldados na fila com % e saindo depois;
  - torre do canto melhorada pelo painel (70 → 95 de dano, 30 → 34 m, modelo com dois canos).
- **Testes:** 7 novos, 39 no total, cobrindo:
  - a curva;
  - treino com tempo, fila e limite;
  - atirador só no nível 3, com a melhoria pausando a fila;
  - melhoria de quem já existe;
  - fábrica com 2 por prédio;
  - torre nível 2 e 3;
  - determinismo com produção.

## C.18 Etapa 10: interface e estilo (especificação)

Começa em 2026-11-05, a pedido do usuário ("seguir para a 10"). Detalha o plano da §C.16. As regras de referência continuam as mesmas: convenções do gênero sim, nada do StarCraft em si.

- **Topo:**
  - À esquerda: velocidade, pausa e som.
  - No meio: o relógio da onda.
  - À direita: os recursos, ou seja, minério, energia (usada/total), trabalhadores (fora/total) e tropas (usadas/limite), mais as barras de moral e do núcleo.
- **Barra de baixo** em três partes:
  1. **Minimapa** à esquerda. Mostra a base, a muralha, os prédios, os nós de recurso, as pessoas (laranja), as tropas (verde), os insetos (vermelho) e o retângulo da câmera. Um toque ou clique leva a câmera para lá.
  2. **Seleção** no meio. É o painel do prédio ou da torre escolhida; sem nada escolhido, mostra um resumo do posto.
  3. **Grade de comandos 3×3** à direita, com atalhos Q W E / A S D / Z X C, que muda conforme o contexto:

     | Contexto | Comandos |
     |---|---|
     | Padrão | Construir, Consertar, Recrutar / + Soldado, + Atirador, + Robô / Mover soldados, Mover robôs, Coleta (alterna perto, médio e longe) |
     | Construir | Muralha, Portão, Torre / Gerador, Refinaria, Quartel / Fábrica, Demolir, Voltar; com algo pendente: Confirmar e Cancelar |
     | Quartel ou fábrica | Treinar cada unidade, Melhorar, Fechar |
     | Torre | Melhorar e Fechar |
     | Outros prédios | Fechar |

- **Alarme geral:** fica fora da grade, como um botão grande sempre visível, porque é a mecânica central. Atalho: barra de espaço.
- **Câmera:** sai do WASD (que agora é da grade). Setas movem; Shift + setas giram.
- **Esc:** cancela ou fecha.
- **Marcador de ordem:** um anel que pulsa e some no chão a cada ordem (verde para mover, amarelo para construir).
- **Obra:** prédio leva tempo para ficar pronto e só funciona depois.
  - Torre e gerador levam 8 s; refinaria, quartel e fábrica, 12 s. A muralha continua instantânea.
  - Na tela, aparece o andaime e o prédio sobe conforme o progresso.
  - Em obra, o prédio não atira, não dá energia, não treina e não melhora, mas pode ser mordido.
- **Estilo:**
  - Faixa de cor do time (laranja) em prédios e unidades.
  - Luzes de status: ligada, sem energia, treinando, melhorando, em obra.
  - Placas e frisos simples nos prédios.
  - Paleta: concreto, aço, laranja do time e o amarelo e preto das faixas.
- **No celular:**
  - Em pé: o topo compacto, o minimapa pequeno no canto de cima à esquerda e, embaixo, a seleção (se houver), a grade 3×3 em largura total e o alarme.
  - Deitado: a barra de baixo em três partes.
- **Deve provar:**
  - tudo o que se fazia antes continua possível, agora pela grade;
  - os atalhos de teclado funcionam;
  - o minimapa pula a câmera;
  - prédio em obra não funciona até ficar pronto;
  - em pé, o HUD ocupa menos de 35% da tela.

## C.19 Etapa 10: como ficou

- **Topo:**
  - À esquerda: velocidade, pausa e som.
  - No meio: o relógio da onda.
  - À direita: minério, energia (usada/total, em vermelho se faltar), trabalhadores (e quantos estão fora), tropas usadas/limite, mais as barras de moral (verde) e do núcleo (azul).
- **Barra de baixo:**
  - **Minimapa** (`src/ui/Minimap.tsx`, Canvas 2D a 4 Hz):
    - perímetro e raio de construção;
    - nós, muralha (com portões e entulho), prédios (cinza em obra);
    - uma amostra dos insetos, pessoas e tropas;
    - o retângulo da câmera.
    - Um toque leva a câmera para lá.
  - **Seleção:** o painel só com informação: nível, vida, obra, melhoria ou fila com barra de progresso, números das unidades e limite. Sem nada escolhido, mostra um resumo do posto (escondido no celular em pé, para caber).
  - **Grade 3×3** (`src/ui/CommandCard.tsx`): os contextos da §C.18. Com algo pendente, mostra Confirmar e Cancelar. Prédio escolhido também tem Demolir.
  - **Alarme:** botão grande em cima da grade, com o atalho de espaço.
- **Atalhos:**
  - Ficam no App (que não remonta) e leem as props mais novas por referência.
  - **Por que no App:** na primeira versão, um atalho apertado logo depois de trocar de contexto se perdia, porque o efeito do Preact espera um quadro.
- **Obra** (`buildLeft`):
  - Torre e gerador levam 8 s; refinaria, quartel e fábrica, 12 s.
  - Em obra o prédio não dá energia, não atira, não treina e não melhora (o teste novo confere).
  - Na tela: andaime amarelo, o corpo subindo e "Obra começou" / "pronta" nos avisos.
- **Estilo:**
  - Faixa laranja do time na base dos prédios, braçadeira nos soldados e faixa no peito dos robôs.
  - Marcador de ordem: anel verde ao mover e amarelo ao construir, que abre e some.
- **Medido no navegador do Mac:**
  - **Em pé (390×844):** o HUD ocupa 35% (topo de 89 px; grade + alarme de 208 px).
  - **Deitado (844×390):** a barra de três partes cabe, e a grade esconde as legendas pequenas.
  - **Teclado real:** Q, E, Esc, Esc, espaço e C funcionaram.
  - **Minimapa:** levou a câmera de (0, 0) a (81, −81).
- **Testes:** 40 no total. O novo cobre a obra; os antigos terminam as obras com `finishConstruction` quando precisam do prédio funcionando.
- **Pendências para a arte (Etapa 12):**
  - retratos e ícones de verdade na grade e na seleção;
  - seleção de unidades por toque e por caixa (hoje as tropas são comandadas em grupo);
  - animação de obra mais rica.

## C.20 Etapa 11: insetos que escalam e cavam (especificação)

Pedido em 2026-11-05 ("pode seguir"). O usuário confirmou que os modelos mais trabalhados (unidades, muralhas, inimigos) ficam para a última etapa, a 12 (arte e som). Esta etapa é o pilar do GDD §4: insetos que escalam muralhas, cavam túneis ou esmagam defesas. Esmagar já existe; faltam escalar e cavar. Também resolve a pendência da Etapa 6: as tropas atrás da muralha quase nunca apanham.

- **Escalar (pilha):**
  - Cada célula de muralha guarda uma pilha de 0 a 1.
  - Quando mais de 12 insetos se amontoam empurrando a mesma célula, a pilha cresce 0,02 por segundo para cada inseto acima de 12. Abaixo disso, desce 0,25 por segundo.
  - Com a pilha cheia, aquela célula e as vizinhas de muralha (3×3, para vencer os 2 m de espessura) ficam escaláveis: o enxame passa por cima, a 40% da velocidade.
  - O campo trata a célula escalável como passagem cara (custo ×6), então só vale onde a multidão já se juntou.
  - A muralha não cai: quando a multidão se dispersa (torres e tropas matando), a pilha desce e a passagem fecha.
  - **Na tela:** o inseto em cima da muralha anda à altura dela.
- **Cavar (túnel):**
  - A partir da onda 4, cada onda tem um grupo de escavadores: 3% dos insetos, no mínimo 6 e no máximo 60.
  - Eles nascem com a horda e vão até uma boca de túnel a 30 m da base (direção sorteada). Lá somem: debaixo da terra não levam tiro, não mordem e não aparecem.
  - Depois de 15 s, saem dentro da base, a 6 m do centro na mesma direção, e seguem como insetos normais.
  - **Aviso:** quando o primeiro entra, aparece o recado "Tremor! Túnel vindo do [lado]". Um monte de terra anda da boca até a saída, e o minimapa marca o caminho.
  - **Defesa:** soldados e atiradores dentro dos muros, ponto de reunião na saída e torres com alcance para dentro.
- **Determinismo:** tudo com o rand do mundo e as mesmas contas de antes. A altura do inseto só vale para desenhar.
- **Deve provar:**
  - multidão grande parada numa muralha consegue passar por cima sem derrubar;
  - pilha sem multidão desce;
  - túnel com aviso, sem levar tiro enquanto está embaixo, saindo dentro da base;
  - as tropas passam a apanhar e morrer de vez em quando;
  - o bot que melhora tudo ainda vai longe, mas sente.

## C.21 Etapa 11: como ficou

- **O que entrou:** tudo da §C.20, com os números ajustados pelo bot (`config.climb` e `config.tunnel`).
- **Pilha:**
  - **Regra:** ela cresce acima de 25 insetos empurrando a mesma célula, a 0,005 por segundo por inseto extra, e desce a 0,3 por segundo.
  - **Quando enche:** marca a área de 3×3 como escalável. O enxame passa por cima a 40% da velocidade, e o campo cobra ×6 por isso.
  - **Na tela:** o inseto em cima da muralha anda na altura dela, e quem empurra uma pilha crescendo sobe junto (efeito de monte). A altura vai num buffer à parte e é só visual.
- **Túnel:**
  - Começa na onda 6. São 2% dos insetos (de 4 a 40).
  - A boca fica a 30 m da base; a saída, a 9 m do centro, longe o bastante do núcleo para as tropas reagirem.
  - Os escavadores ficam 18 s embaixo, sem levar tiro.
  - **Avisos:** o recado com o lado e o tempo, um tremor no som, o monte de terra andando e a linha vermelha no minimapa.
- **Primeira versão, dura demais:** pilha a partir de 12 insetos e túnel desde a onda 4 derrubavam o bot que melhora tudo na onda 9–12. Antes ele passava da 25.
- **Bots com os números finais (2 sementes):**

  | Bot | Até onde chega |
  |---|---|
  | Sem construir | Cai nas ondas 5 e 6 |
  | Torres nível 1 e soldados, sem melhorar | Cai na onda 9 |
  | Melhorando as torres | Cai na onda 20 |

  - **Do que o bot morre:** pilhas e túneis (o núcleo leva dano de túnel nas ondas 6 e 7, mesmo sem brecha).
  - **Leitura:** um jogador que põe tropas na saída do túnel e muralha extra deve ir mais longe.
- **Visto no navegador do Mac** (semente 7, onda 7): o recado "Tremor! Túnel vindo do norte: saem dentro da base em 18 s" apareceu, e o monte de terra andou da boca até a base (captura em `reports/snap-etapa11-tunel.png`).
- **Testes:** 4 novos, 44 no total, cobrindo:
  - multidão escala sem derrubar a célula e entra;
  - a pilha some sem multidão;
  - o túnel avisa, quem está embaixo não leva tiro e sai dentro da base;
  - determinismo com pilhas e túneis.

## C.22 Etapa 12: arte e som (especificação)

Última etapa do roteiro. Escolhas do usuário em 2026-11-05, depois de ver as prévias da coleção:

1. **Modelos do KayKit local (CC0)**, no estilo fofinho da coleção:
   - **Personagens:**
     - Survivalist, para o trabalhador;
     - Space Ranger, para o soldado (já é laranja e branco, como o nosso time);
     - Marksman, para o atirador;
     - Combat Mech, para o robô.
   - **Prédios:** Space Base Bits.
   - **Muralhas:** Prototype Bits (a parede cinza com base amarela).
   - **Minério:** Resource Bits.
   - **Download:** só esses arquivos, com `git lfs pull --include`.
2. **Inseto próprio por código, mais detalhado:** carapaça em placas, mandíbulas, antenas e patas em três segmentos.
   - Tem três aparências: comum, grande (8%, mais escura e maior) e escavador (marrom, com garras).
   - A animação continua na GPU, para aguentar 8 mil.
3. **Som sintetizado** como no Vigília: tiros, metralhadora do robô, chiado do enxame, obra e entrega, sem arquivos.

**Personagens:**
- Os quatro usam o mesmo esqueleto (Rig_Medium, 23 ossos). As animações vêm do Character Animations 1.1 do KayKit:

  | Animação | Quem usa |
  |---|---|
  | Walking_A | andar |
  | Running_A | o pânico |
  | Pickaxing | coletar |
  | Idle_A | parado |
  | Ranged_2H_Aiming e Ranged_2H_Shooting | tropa atirando |
  | Death_A | queda |

- **Armas na mão:** fuzil, rifle de precisão e metralhadora. A mochila aparece no trabalhador quando ele carrega minério.

**Prédios:**

| Prédio | Modelo |
|---|---|
| Quartel | basemodule_A |
| Fábrica | basemodule_garage |
| Refinaria | drill_structure |
| Gerador | windturbine_tall |
| Depósito | cargodepot_A com contêineres |
| Torre | structure_low (as dos cantos, structure_tall), com a cabeça de canhão nossa em cima |

Também entram rochas do Space Base espalhadas pelo chão.

- **Muralha e portão:** a geometria da parede do Prototype entra instanciada, uma por célula. Os portões continuam com faixas pretas e amarelas.
- **Cópia para o projeto:** feita por `npm run art`, que lê um manifesto e só copia as extensões permitidas. Os créditos ficam em `LICENSES.md`.
- **Deve provar:**
  - o jogo fica mais bonito sem cair de 60 fps no iPhone com a horda grande;
  - as animações batem com o que cada um faz;
  - os modelos não brigam com a leitura (cor do time, seleção, obra).

## C.23 Etapa 12: como ficou

- **Arte KayKit:** 54 arquivos, 7 MB.
  - **Como chegou:** `git lfs pull --include` só dos arquivos escolhidos na coleção, depois cópia com `npm run art`.
  - **Validação na cópia:** só as extensões permitidas, recusa de ponteiro de LFS e de URI estranha nos .gltf.
  - **Personagens** (`src/render/chars.ts`): clones com esqueleto e mixer próprios.

    | Quem | Animações |
    |---|---|
    | Trabalhador | anda, corre em pânico, usa a picareta coletando, para, morre |
    | Tropas | correm, miram na fase de ataque, atiram, morrem |

    - As armas vão no osso da mão direita: fuzil do Space Ranger, rifle do Marksman, metralhadora do Combat Mech.
    - A mochila do Survivalist aparece nas costas do trabalhador quando ele carrega minério.
  - **Prédios:** os modelos do Space Base, ajustados ao tamanho da planta.
    - O andaime, as divisas e as luzes continuam.
    - A faixa laranja só fica nos prédios feitos em código, porque os do KayKit já têm a cor.
  - **Torres:** base `structure_low` (as dos cantos, `structure_tall`) com a cabeça de canhão nossa em cima.
  - **Muralha:** a parede do Prototype, instanciada uma por célula e virada pelo vizinho. O dano escurece a parede.
  - **Minério:** pedra perto, cobre no meio e ouro longe, encolhendo com o estoque.
  - **Rochas e depósito:** 46 rochas espalhadas e o depósito central com contêineres.
  - **Reserva:** se a arte não carregar, ou com `?semarte`, o jogo volta aos modelos em código.
- **Inseto novo** (`src/render/bugMesh.ts`):
  - **Formas:** abdômen em três gomos com placas, escudo no tórax, mandíbulas curvas que abrem no ataque, antenas e patas em três segmentos.
  - **Tons:** casco, placa clara com brilho e junta escura.
  - **Três aparências:** comum, grande (1 a cada 12, 1,35× maior, escuro arroxeado) e escavador (marrom).
  - **Três níveis ao mesmo tempo, pela distância da câmera** (cada um com o seu buffer):

    | Nível | Triângulos | Distância |
    |---|---|---|
    | Alto | 918 | até 26 m |
    | Médio | 401 | até 60 m |
    | Baixo | 144 | além de 60 m |

  - **Câmera padrão** (105 m): todos ficam no baixo. Com 8 mil insetos, são 1,15 milhão de triângulos, menos que os 1,6 milhão do teste no iPhone (8 mil × 204).
- **Som sintetizado:**
  - estalos de tiro conforme quantos atiram (torres, soldados e atiradores);
  - o "brrt" da metralhadora dos robôs;
  - o chiado do enxame, que sobe com quantos insetos estão vivos;
  - um sino quando a obra fica pronta.
- **Medido no Mac:** com 8 mil insetos na muralha, o quadro levou 0,8 ms de CPU e a simulação 0,8 ms por tick, sem erros no console. Os 44 testes passam.
- **Falta:**
  - jogar no iPhone: o tempo de carregar os 7 MB e os 60 fps com zoom perto da horda grande (é aí que entram os níveis alto e médio);
  - ícones e retratos de verdade na grade (a Etapa 10 deixou isso para a arte).

### Correções depois do teste no iPhone (2026-11-05)

- **Tremido** (o usuário viu os personagens dando "flicks" para a frente e para trás):
  - **Causa:** o 3D interpolava com um relógio que recomeçava quando o pedido saía para o worker, mas ainda usava o retrato velho até a resposta chegar. Por um instante o boneco voltava e depois pulava para a frente.
  - **Agora:** a sessão marca quando cada retrato chegou e quanto tempo ele cobre (`alpha`), e o tempo do jogo só anda para a frente. Cada pessoa e cada inseto vai da posição que estava na tela até a do retrato novo. Pulo de mais de 6 m (4 m nos insetos) teleporta em vez de arrastar.
  - **Animação:** só troca se o pedido durar 0,15 s; a morte troca na hora.
  - **Medido:** um trabalhador andando por 2 s (118 quadros) não deu nenhum passo para trás.
- **Arma na mão:**
  - **Causa:** as armas do KayKit vêm com o cano em +z, e no osso `handslot.r` com a animação Ranged_2H o cano apontava para o lado (produto com a frente = 0,02).
  - **Agora:** a arma gira um quarto de volta em y (`GRIP_TURN` em `src/render/chars.ts`). Medido no tiro, o produto deu 1 nos soldados e no robô (cano para a frente), e a foto confere.

## C.24 Etapa 13: acabamento da interface (como ficou)

Pedido em 2026-11-05 ("funcionou, pode seguir", depois de jogar a Etapa 12 no iPhone). Fecha as pendências que a Etapa 10 deixou para depois da arte (§C.19): seleção de unidades por toque e por caixa, e retratos e ícones de verdade.

- **Ordem por unidade** (`src/sim/units.ts`):
  - Cada unidade tem `order` (nulo: automático). `orderUnits(w, ids, p)` leva as escolhidas para `p` em formação; `holdUnits` faz cada uma ficar onde está; `orderUnits(w, ids, null)` devolve ao automático.
  - **Formação:** casas em anéis quadrados a partir do centro (só soma e produto). Com robôs e infantaria juntos, os robôs ficam na frente, do lado de fora (para longe do centro da base), e a infantaria logo atrás.
  - **Quem fica no automático** se redistribui pelos portões e brechas sem contar as que têm ordem.
  - `setRally` (o ponto de grupo antigo, usado pelos bots e testes) limpa as ordens do grupo.
  - **Comandos novos para o worker:** `order` e `hold`.
  - **Testes** (`tests/orders.test.ts`, 4 novos, 48 no total): só as escolhidas vão, cada uma numa casa; robôs na frente; Parar, Auto e o ponto de grupo; mesma semente e ordens dão o mesmo hash.
- **Escolher na tela** (`src/game/boot.tsx`, `src/render/rtsCamera.ts`):
  - O toque mira no que está desenhado: cada tropa é projetada na tela pela posição suavizada, no meio do corpo, com folga de 26 px (34 px no robô). Tropa vem antes de torre e prédio.
  - **Caixa:** segurar parado 0,3 s (sem mexer mais de 8 px) e arrastar. Antes disso, arrastar continua movendo a câmera. Segurar e soltar sem arrastar vale como toque. Um segundo dedo cancela a caixa. No iPhone, o CSS desliga a lupa e o menu do toque longo.
  - **Anéis verdes** embaixo das escolhidas (instanciados; o do robô é maior). Ficam a 0,16 m, acima do piso da base (que vai até 0,12 m e escondia o anel a 0,09 m).
  - Tropa que morre sai da escolha sozinha.
  - O modo "Mover" de grupo saiu: "Soldados" e "Robôs" na grade padrão escolhem o grupo, e o toque no chão manda.
- **Painel da seleção:**
  - **Uma tropa:** retrato, vida (verde, âmbar ou vermelha), dano, alcance, se está com ordem ou no automático, e o que está fazendo.
  - **Várias:** contagem por tipo e uma fileira de até 12 retratos com a vida embaixo; tocar num retrato fica só com ele.
  - A dica "Toque no chão para mandar" mora dentro do painel. No celular em pé, a dica solta ficava escondida atrás dele.
  - **Prédio e torre** também ganharam o retrato.
- **Retratos** (`src/render/portraits.ts`):
  - Na carga, cada tropa e prédio do KayKit é desenhado uma vez num canto do próprio canvas e copiado para uma imagem de 128 px. Assim não abre um segundo contexto WebGL (que pesa no iPhone).
  - **Personagens:** cabeça e peito, de três quartos, na pose de mira, com luz de recorte azulada.
  - **Prédios e torre:** inteiros, de cima em diagonal.
  - **Reserva:** se o canvas não tiver tamanho ou a arte não carregar (`?semarte`), tudo usa os desenhos de traço.
- **Ícones** (`src/ui/icons.tsx`): desenhos de traço próprios para as ações (construir, consertar, confirmar, cancelar, voltar, melhorar, máximo, auto, parar, todas, muralha, portão, demolir, coleta) e, sem arte, para tropas e prédios.
  - **Na grade:** ícone à esquerda e texto à direita; no celular deitado, o ícone fica em cima do nome.
  - A grade no Mac passou de 92 para 112 px por coluna.
- **Medido no navegador do Mac:**
  - clique numa tropa escolheu, e o clique no chão levou o soldado ao ponto com as outras no automático;
  - dois cliques escolheram os 5 soldados da tela; o clique direito mandou os 5 em formação;
  - segurar e arrastar escolheu as 7 tropas sem mexer a câmera;
  - "Parar" deixou as 5 com ordem no lugar; "Auto" zerou as ordens;
  - celular em pé (390×844) e deitado (844×390) cabem;
  - sem erros no console.
- **Não deu para testar no Mac:** a caixa por Ctrl + arrastar com a ferramenta do navegador (a tecla não chegou ao evento; o caminho de segurar foi testado com eventos de ponteiro direto no canvas). Os retratos foram vistos no Chromium do Mac; falta ver no Safari do iPhone.
- **Jogada pelo usuário no iPhone** em 2026-11-05: "ficou bom".

### Obra mais rica (2026-11-05, a terceira pendência da Etapa 10)

- **Canteiro** (`src/render/sites.ts`), para todo prédio em obra (a torre também, que antes só crescia):
  - **Guindaste** pequeno no canto, fora da planta. O braço vai e volta sobre a obra, o carrinho corre e o gancho sobe e desce, sem nunca entrar no que já subiu. Cada guindaste tem o seu ritmo.
  - **Faíscas de solda** em rajadas, saltando da borda de cima do que já subiu. São aditivas, do branco ao laranja, e caem com gravidade.
  - **Poeira baixa** em volta da planta.
  - **Barra de progresso** acima do braço. Ela vira para a câmera e cresce quando a câmera se afasta. É desenhada por cima de tudo: a parte amarela também é "transparente", senão o fundo semitransparente a cobria.
  - O andaime e o corpo subindo continuam como antes.
- **Entrega:** nuvem de poeira em anel, chuva de faíscas do topo e um "pulo" de 12% na altura do prédio (0,45 s), além do sino que já tocava.
- **Som:** uma batida metálica baixa de vez em quando enquanto há obra (mais obras, mais batidas, com teto).
- **Tempo:** tudo anda pelo tempo do jogo: para na pausa e acelera no 2× e no 4× (passo máximo de 0,1 s).
- **Custo:** dois `THREE.Points` com buffer fixo (384 faíscas e 256 de poeira), sem alocar por quadro. Sem obra e sem partícula viva, não fazem nada.
- **Medido no navegador do Mac:** com 3 obras ao mesmo tempo, umas 60–95 partículas vivas, sem erros no console. As fotos estão em `reports/snap-obra-meio.png` e `reports/snap-obra-entrega.png`.
- **Falta:** jogar no iPhone.

## C.25 Etapa 14: o fortim (especificação)

Escolhido pelo usuário em 2026-11-05 ("fortim"), a partir da ideia da §C.7, item 6. Vem de um prédio do StarCraft, mas só a mecânica entra: nome, forma e números são nossos.

- **O prédio:**
  - 3×3, 125 de minério, 12 s de obra, 2400 de vida.
  - **Vagas:** 4 no nível 1.
  - **Bônus de quem está dentro:** +50% de dano e +3 m de alcance.
  - O enxame morde o fortim como qualquer prédio: quando ele está no caminho, ou quando a multidão o cerca.
- **Quem entra:** só soldados e atiradores (o robô é grande demais).
  - **Para mandar entrar:** com tropas escolhidas, tocar no fortim (ou clique direito).
  - **Pelo painel do fortim:** "Chamar" traz as tropas livres mais perto até encher.
  - **O caminho:** elas andam até a porta e entram uma a uma. Se não houver vaga, ficam na porta.
- **Lá dentro:**
  - a tropa some do mapa e o enxame não a alcança;
  - atira do centro do fortim com o bônus;
  - o desenho mostra luzes de vaga no teto e os tiros saindo das seteiras.
- **Sair:** "Sair" no painel põe todas na porta, paradas ali (com ordem). Demolir também tira todas, sem dano.
- **Se o fortim cair:** quem estava dentro sai no entulho com 35% da vida a menos e volta ao automático.
- **Melhorias:**

  | Nível | Custo | Ganho |
  |---|---|---|
  | 2 | 120 | +2 vagas e +50% de vida |
  | 3 | 200 | +25% de dano e +2 m de alcance |

- **"Todas", "Soldados", toque e caixa** não pegam quem está dentro: o fortim guarda os seus.
- **Paleta de construção:** o Fortim entra no lugar de "Demolir".
  - **Para demolir muralha:** toque na muralha fora do modo construir. Ela vira uma escolha (vida, Demolir com a devolução, Consertar), com o fantasma vermelho do que sai.
  - Prédios continuam com Demolir no painel deles.
- **Modelo:** a Space Base do KayKit não tem nada parecido com um bunker, e os módulos octogonais já são o quartel e a fábrica. O fortim é feito por código:
  - baixo, de concreto como a muralha;
  - seteiras escuras, sacos de areia em volta, faixa do time;
  - uma luz por vaga no teto.
- **Prova:**
  - testes: entrar até lotar, sair, cair com dano, o bônus rendendo mais mortes que a mesma tropa parada no mesmo lugar, e o hash;
  - bots: um fortim com 4 soldados contra os mesmos 4 soldados soltos.

## C.26 Etapa 14: o fortim (como ficou)

- **Simulação** (`src/sim/fort.ts`; a saída fica em `ejectFort`, em `src/sim/build.ts`):
  - **Prédio:** novo tipo `fortim`, com HP. O enxame morde as células dele como as de qualquer prédio.
  - **Na unidade:** `inside` (o fortim onde está) e `enter` (o fortim para onde vai).
  - **Entrar:** `garrison(w, ids, fortim)` reserva as vagas para as mais perto da porta e manda irem até ela. Quem chega entra (`stepForts`, no começo de `stepUnits`).
  - **Sobrou gente ou deu errado:** aviso novo `notice` ("1 ficou de fora: o fortim tem 4 vagas", "Só soldados e atiradores entram", "O fortim ainda está em obra").
  - **Lá dentro:** fica no centro do prédio, fora das listas do automático, das ordens, da escolha e da mordida. Atira com dano × 1,5 e alcance + 3 m (`fortStats`, que soma as melhorias).
  - **Sair** (`leaveFort`): todos na porta, com ordem de ficar ali. Demolir faz o mesmo.
  - **Fortim que cai:** todos no entulho, com 35% da vida a menos (`build.fortFall`), de volta ao automático.
  - **Melhoria:** usa o mesmo caminho dos outros prédios. O nível 2 aumenta a vida cheia na mesma proporção (`buildingMaxHp`).
  - **Hash:** inclui `inside`.
- **Testes** (`tests/fort.test.ts`, 7 novos, 55 no total):
  - entrar até lotar, e ordem no chão não tira ninguém de dentro;
  - robô não entra, e fortim em obra não aceita ninguém;
  - Sair deixa todos na porta;
  - fortim derrubado tira todos feridos;
  - a melhoria dá vagas e vida;
  - dentro mata mais que parado na porta;
  - o hash.
- **Medido com bots** (scripts avulsos):
  - **Primeira onda sem torres, 4 soldados, 3 sementes:**

    | Onde | Mortes |
    |---|---|
    | No fortim perto do portão leste, por dentro | 123–159 |
    | Soltos no automático | 90–95 |
    | Parados na porta do fortim | 36–59 |
    | No fortim fora da muralha (só pega quem passa perto) | 49–64 |

  - **Várias ondas com torres, 6 sementes, bot que não constrói mais nada:** com os soldados soltos, o posto caiu nas ondas 5–6 e morreram 2 soldados no total. Com eles no fortim, caiu nas mesmas 5–6 (quase sempre na 6) e nenhum morreu. Ajuda sem desequilibrar.
- **Tela:**
  - **Modelo** (`src/render/fortModel.ts`): casamata octogonal de concreto, faixa de seteiras, teto com escotilha, faixa do time, porta em +x e sacos de areia em anel (abertos na porta). As luzes de vaga no teto acendem em verde por ocupante.
  - Quem está dentro some do mapa, e os traços de tiro saem das seteiras, do lado do alvo.
  - O canteiro de obra serve para o fortim também.
  - O fortim tem retrato próprio na interface.
- **Interface:**
  - **Paleta:** Muralha, Portão, Torre, **Fortim**, Gerador, Refinaria, Quartel, Fábrica e Voltar. Demolir saiu.
  - **Painel do fortim:** vagas com retrato e vida de cada ocupante (as livres tracejadas), o bônus e quem está a caminho.
  - **Grade do fortim:** Chamar (as tropas livres mais perto), Sair, Melhorar, Demolir e Fechar.
  - **Entrar:** com tropas escolhidas, tocar no fortim (ou clique direito). Um marcador aparece na porta.
  - **Fora das escolhas de grupo:** "Soldados", "Todas", a caixa e o toque não pegam quem está dentro.
  - **Toque pelo teto:** o raio desce pela altura de cada coisa (muralha 3,4 m, prédios pela altura deles, torres do posto). Tocar no teto acerta o prédio, e não o chão atrás dele. Isso melhorou também o toque nos prédios antigos.
  - **Muralha escolhida:** tocar numa muralha ou num portão mostra nome, vida e se é do posto. O fantasma vermelho mostra o que sai se demolir. A grade tem Consertar e Demolir (com a devolução; desligado no que é do posto).
  - Os avisos agora concordam em gênero ("Fortim pronto", "Gerador destruído").
- **Medido no navegador do Mac:**
  - o clique no teto do fortim, com 5 soldados escolhidos, mandou os 4 mais perto para dentro; o quinto ficou no automático e saiu da escolha;
  - as luzes acenderam, e os 4 atiraram de dentro no ataque;
  - o clique no topo da muralha escolheu o portão do posto (Demolir desligado);
  - numa muralha do jogador, o fantasma marcou 3 m e Demolir devolveu 3;
  - celular em pé (390×844) cabe, e não houve erros no console.
- **Falta:**
  - jogar no iPhone;
  - decidir se o fortim fora da muralha deveria ser mais atraente (hoje rende mais por dentro, perto de um portão).

## C.27 Etapa 15: IA do enxame (especificação)

Pedido do usuário em 2026-11-05, depois de jogar o fortim no iPhone: os inimigos não atacaram o fortim e foram direto para o portão, e chegam praticamente em fila, sem o caos de horda que ele imaginou.

- **Por que acontece:**
  - **Fila:** todos nascem num anel uniforme e andam no mesmo ritmo para cruzar o perímetro juntos. Depois seguem um único campo de caminhos até o núcleo, com 8 direções fixas, que converge para os 4 portões. Medido: 12 s depois da chegada, 80% dos insetos perto da base (16 a 50 m) ficam em 8 das 72 fatias de 5°.
  - **Fortim ignorado:** o inseto só morde o que bloqueia o próximo passo. O caminho até o núcleo contorna o prédio, então só leva mordida de raspão (perdeu cerca de 250 dos 2400 de vida numa onda de 1500).
- **Papéis:**
  - **Assalto:** a maioria vai ao núcleo como hoje.
  - **Caçadores** (30% na onda 1, +1 ponto por onda, até 50%): seguem um segundo campo de caminhos, que leva ao alvo mais perto entre o núcleo e os prédios do jogador (fortim, torres, gerador, refinaria, quartel, fábrica). Um prédio fora da muralha, do lado de onde vem a horda, vira alvo de verdade.
  - **Caçador perto de uma tropa no mapa** (até 7 m): vai nela. Quem está dentro do fortim não conta: o caçador morde o fortim.
- **Chegada em levas:**
  - **Bandos:** de 3 (horda pequena) a 10 (horda cheia), cada um vindo de uma direção com um leque próprio, mais 12% de avulsos espalhados.
  - **Primeira leva:** cruza o perímetro na hora da chegada (a sirene e o pânico não mudam).
  - **As outras:** chegam até 16 s depois, cada inseto com até 4 s de folga.
- **Andar caótico:**
  - **Desvio lateral próprio:** cada inseto tem um lado preferido e uma oscilação com fase e ritmo dele. O desvio é forte longe do alvo e some nos últimos metros, para não perderem o portão.
  - **Ritmo que oscila** ±25%: uns aceleram e outros freiam, como uma massa que se agita.
  - **Direção suavizada:** mistura as direções das 4 células em volta, em vez das 8 direções fixas de uma célula só.
  - **Oscilações** com uma onda feita de produtos e `floor`, sem seno. Continua determinístico.
- **Custo:** o segundo campo dobraria os 10 ms de cada recálculo. Por isso o Dijkstra troca o heap binário por baldes (os custos são inteiros), e os dois campos juntos devem custar menos que o de hoje sozinho.
- **Prova:**
  - medir de novo as fatias ocupadas e a concentração nas 8 fatias mais cheias;
  - o fortim fora da muralha tem que levar dano de verdade;
  - testes de fortim mordido, de chegada espalhada e do hash;
  - os bots, comparados com a progressão de hoje.

## C.28 Etapa 15: IA do enxame (como ficou)

O que mudou em relação à §C.27 veio dos bots. Caçar todos os prédios deixava o jogo bem mais difícil, e os bandos faziam a escalada aparecer cedo demais.

- **Papéis** (`config.ai`, `src/sim/swarm.ts`):
  - **Caçadores:** 20% na onda 1, +1 ponto por onda, até 35%. Seguem o campo dos alvos só quando há um a menos de 20 m pelo caminho (`ai.sense`); fora disso vão ao núcleo.
  - **Alvo:** só o fortim (`ai.targets`).
  - **Tropas no mapa:** o caçador vai nas que estiverem a até 7 m; quem está no fortim não conta.
  - **Torres e geradores:** continuam levando mordida quando estão no caminho, mas não são caçados.
- **Por que só o fortim:** com o bot que melhora tudo (2 sementes, até a onda 22):

  | Variante | Cai na onda |
  |---|---|
  | Como antes (anel, sem desvio, sem caçador) | 18 |
  | Caçando todos os prédios | 8–9 (derruba geradores e as torres ficam sem energia) |
  | Caçando fortim e torre | 11–13 |
  | Só fortim, escalada com 45 | 16–17 |

- **Chegada:**
  - de 5 a 14 bandos (um por 200 insetos), cada um com leque de 0,3 a 0,7;
  - 35% de avulsos espalhados;
  - levas até 12 s depois da primeira, e cada inseto com até 4 s de folga;
  - cada inseto anda devagar até a hora dele (`wake`), não mais todos até a chegada.
- **Andar:**
  - desvio lateral (lado preferido mais oscilação, ×0,6), cheio a mais de 25 m do centro e sumindo até 15 m, e também nos últimos 8 m do alvo;
  - ritmo ±25%;
  - direção suavizada nas 4 células em volta;
  - `wave()`, uma onda de produtos e `floor` no lugar do seno.
- **Escalada:** o limiar subiu de 25 para 45 insetos empurrando. Um bando inteiro contra um trecho da muralha formava pilha na onda 11–13; com o anel uniforme de antes, só na 16.
- **Campos:**
  - Dijkstra por baldes, com o custo de cada célula calculado uma vez para os dois campos;
  - os dois campos juntos levam 8,9 ms no M4, menos que o campo único de antes (9,9 ms), e o resultado é o mesmo.
- **Aviso novo:** "<prédio> sob ataque: metade da vida!" (uma vez, ao cair abaixo de 50%). O de fortim destruído diz quantos saíram feridos, e só se havia alguém dentro.
- **Medido** (4 sementes, onda de 1200, fortim fora da muralha a leste):

  | | Como antes | Agora |
  |---|---|---|
  | Vizinhos a menos de 1,5 m (entre 16 e 60 m do centro) | 5,2 | 1,8 |
  | Células de 2 m ocupadas por inseto | 0,45 | 0,69 |
  | Vida que o fortim perdeu no pior momento | 0% | 20% |

- **Progressão** (bots de sempre, 2 sementes):

  | Bot | Antes | Agora |
  |---|---|---|
  | Sem construir | 5–6 | 6 |
  | Torres e soldados, sem melhorar | 9 | 9–10 |
  | Melhorando tudo | 18–20 | 16–17 |

  Um pouco mais difícil no fim, por causa dos bandos.
- **Custo:** com 8 mil insetos, a simulação foi de 0,83 para 1,81 ms por tick no M4. Ela roda no worker, que tem 50 ms por tick no 1×; falta medir no iPhone.
- **Testes** (`tests/swarm-ai.test.ts`, 5 novos, 60 no total):
  - a onda periódica;
  - levas, com a primeira na hora;
  - a fração de caçadores;
  - fortim sem defensor perdendo mais de 20%;
  - o caçador vai na tropa e o de assalto segue para o núcleo;
  - o hash com bandos, caçadores e fortim.
- **Visto no navegador do Mac** (semente 5, onda 13):
  - bandos chegando de várias direções, espalhados;
  - no ataque, o fortim a leste cercado, perdendo 350 de vida em 18 s com os 4 soldados atirando de dentro;
  - perto da muralha ainda se formam correntes largas até os portões (o ponto fraco), mas não fila;
  - fotos em `reports/snap-ia-chegada.png` e `reports/snap-ia-ataque.png`.
- **Falta:**
  - jogar no iPhone;
  - decidir se as torres de fora também devem atrair caçadores (`ai.targets`), sabendo que isso pede compensar em outro lugar.

## C.29 Etapa 16: recolher com informação (especificação)

Pedido em 2026-11-05 ("ficou bom por enquanto. pode seguir"), depois da IA do enxame. São as três ideias da §C.7, item 5, que o protótipo levantou. É o coração do GDD (§2 e §3): decidir quem volta e quando, sabendo o risco de cada um.

- **Tempo de volta** (`returnTime`, em `src/sim/panic.ts`):
  - **Conta:** quanto o trabalhador levaria, andando (sem disparada), até passar o portão mais perto, se fosse chamado agora. É a mesma geometria do pânico, com a carga e a moral pesando na velocidade.
  - **Comparado com:** o tempo que falta para a horda cruzar o perímetro (`timeLeft`).
- **Rótulo sobre a cabeça** (troca o % de hoje na sirene):

  | Situação | Rótulo |
  |---|---|
  | Chega com folga | "12 s", verde |
  | Chega no limite (folga menor que 10 s) | "18 s", âmbar |
  | Não chega | "não chega · 45%", vermelho: a chance que ele teria na rolagem se fosse chamado agora (anda o que dá, depois dispara) |

  - **Na calma:** o rótulo só aparece para quem já está perto do limite ("chamar · 38 s"), para não poluir a tela.
- **Aviso de quem já não chega:**
  - **No relógio:** "· 2 não chegam" (na sirene) ou "· 2 em risco" (na calma), em vermelho.
  - **Na hora em que alguém passa do limite:** "Ana já não chega a tempo (precisa de 24 s, faltam 20 s)", uma vez por trabalhador por onda.
- **Chamar só quem está em risco:**
  - **Botão novo** ao lado do alarme, "Chamar em risco (N)", com o atalho R.
  - **Quem ele chama:** só os que estão fora e precisam de mais tempo que o que falta, menos 10 s de folga. Esses voltam e ficam dentro (`hold`); os outros seguem coletando.
  - **Até quando ficam dentro:** "Liberar saída" e o fim da onda soltam todo mundo.
  - **O alarme geral** continua chamando todos.
- **Prova:**
  - testes: o tempo de volta bate com o tempo real andando; quem é chamado volta e não sai de novo; os outros continuam; liberar solta; a chance projetada fica entre a de agora e 1;
  - bots: "chamar em risco" contra "alarme na sirene", comparando minério entregue e mortes.

## C.30 Etapa 16: recolher com informação (como ficou)

- **Simulação:**
  - **Funções** (`src/sim/panic.ts`):
    - `returnTime`: andando até passar o portão mais perto, com carga e moral;
    - `timeLeft`: quanto falta para a horda cruzar o perímetro;
    - `projectedChance`: anda o que der, depois dispara o resto, e entra na fórmula do pânico;
    - `atRisk`.
  - **Comandos** (`src/sim/commands.ts`):
    - `recallWorkers(ids)`: voltam e ficam dentro (`hold`);
    - `riskIds`: fora, sem `hold`, precisando de mais que o tempo que falta menos `recallMargin` (10 s). Inclui quem já está voltando, para não sair de novo depois de descarregar;
    - `recallAtRisk`.
  - **Quem solta o `hold`:** "Liberar saída" e o fim da onda.
  - **A estimativa é conservadora:** em 77 trabalhadores chamados, a volta real levou, na mediana, 94% do tempo estimado (o pior caso, 79%). O "não chega" nunca promete demais.
- **Tela:**
  - **Rótulos sobre a cabeça:**
    - "12 s" verde, "18 s" âmbar, "não chega · 60%" vermelho (com a chance projetada);
    - na calma, "chamar · 38 s" para quem já está perto do limite;
    - no pânico, a chance da rolagem, como antes.
  - **Relógio:** "· 2 em risco" na calma e "· 2 não chegam" na sirene, em vermelho.
  - **Botão "Chamar em risco"** ao lado do alarme, com a contagem e o atalho R. Desliga quando não há ninguém em risco ou com o alarme tocado.
  - **Avisos:**
    - "Ana já não chega a tempo (precisa de 24 s, faltam 20 s)", um por trabalhador por onda (agrupado se forem vários ao mesmo tempo);
    - "2 chamados de volta; os outros seguem coletando".
  - **Minimapa:** quem não chega fica vermelho e maior; em risco, amarelo. Faz falta porque o minério longe fica a 80–106 m, fora da câmera padrão.
- **Testes** (`tests/recall.test.ts`, 5 novos, 65 no total):
  - o tempo de volta contra o real;
  - chamado volta e fica dentro, os outros seguem, e liberar solta;
  - risco vazio no começo da calma e com os de longe perto da chegada;
  - a chance projetada entre a de agora e 1;
  - o fim da onda solta todo mundo.
- **Medido no navegador do Mac** (semente 4, onda 4, coleta longe):
  - **Com 40 s para a chegada:** "2 em risco" no relógio e "Chamar em risco · 2 trabalhadores" no botão. O clique chamou os dois, que entraram e ficaram; os outros seguiram coletando.
  - **Na sirene, com 17 s:** os rótulos "17 s", "7 s", "não chega · 60%", "não chega · 72%"; o relógio "8 trabalhadores fora dos muros · 2 não chegam"; e o aviso "2 trabalhadores já não chegam a tempo".
- **Balanceador** (`npm run balance -- --seeds 12 --waves 6 --warning 30`, política nova "em risco": chama a cada segundo, sem alarme geral):

  | Coleta | Na sirene: minério · mortes por onda | Em risco: minério · mortes por onda | Diferença de minério |
  |---|---|---|---|
  | Perto | 707 · 0,17 | 773 · 0,14 | +9% |
  | Médio | 976 · 0,10 | 1006 · 0,13 | +3% |
  | Longe | 1451 · 0,38 | 1310 · 0,14 | −10% |

  - **É o recolhimento mais seguro:** ninguém fora na chegada em nenhuma coleta.
  - **No longe rende menos:** ele chama as viagens longas cedo, e elas ficam dentro o resto da onda.
  - **O melhor arriscado continua sendo "longe · +10 s"** (1526, +5% sobre o melhor seguro), com 1,31 morte por onda. O botão é para quem quer segurança sem desperdiçar os de perto; o jogador ainda pode arriscar.
- **Ajustes depois da foto no celular:**
  - **Contagem:** em pé, a linha de baixo do relógio fica oculta. Agora a contagem curta ("2 não chegam") aparece ali.
  - **Botão:** o "Chamar em risco" ganhou fundo sólido; o âmbar transparente sumia sobre a areia.
- **Correção pedida no meio da etapa:** no celular, o painel de instruções passou da altura da tela, e o "Começar" ficava fora, sem rolar.
  - **Agora:** o texto rola dentro do painel e o botão fica fixo embaixo.
  - **Medido:** o botão fica à vista e responde em 390×664 (celular em pé com a barra do Safari), 375×560 e 844×390.

## C.31 Etapa 17: decisões de 2026-11-05 e o que entra (especificação)

**Respostas do usuário à lista da §C.7:**
1. **Nome:** ainda não decidido; fica o provisório.
2. **Janela de aviso:** baixa para 20 s.
3. **Fortim:** "precisa funcionar como posto avançado".
4. **Atenção da horda:** "qualquer construção fora da fortaleza deve chamar atenção pra ataque, de maneira equilibrada pra não focarem apenas numa torre ou fortim".
5. **Custo da IA no iPhone:** fica como está.

**Pedidos de implementação:**
- chamar um trabalhador;
- salvar a partida (à mão e a cada onda);
- mortes marcantes;
- continua sem objetivo final.

**Especificação:**
- **Aviso de 20 s** (`config.warning`).
- **Atenção a tudo que está fora:**
  - **Alvos dos caçadores:** todo prédio do jogador fora da muralha do posto, de qualquer tipo. O que está dentro só é mordido se o enxame entrar.
  - **Equilíbrio:** o campo dos caçadores dá a cada prédio uma "fila" que cresce com quantos insetos já o mordem (+2,5 m de caminho por inseto, até 40 m). Assim os caçadores se espalham entre os alvos perto, em vez de todos no mesmo. O campo é refeito a cada 0,5 s enquanto houver caçador mordendo.
  - **Compensação**, se os bots mostrarem que ficou difícil demais: "Consertar" passa a consertar também os prédios.
- **Fortim como posto avançado:**
  - **Fora da fortaleza:** blindado (a mordida tira 40% a menos) e com +3 m de alcance a mais (+6 m no total).
  - **Abrigo:** até 4 trabalhadores. Na hora do pânico, quem está fora corre para o refúgio mais perto, portão ou fortim pronto com vaga, e a rolagem usa essa distância.
  - **Quem se abriga** some do mapa e espera a onda acabar dentro do fortim; depois volta para casa com a carga.
  - **Se o fortim cair com gente abrigada:** os trabalhadores são devorados. É o risco do posto avançado.
  - **Chance projetada:** o "não chega · %" também passa a contar o fortim.
- **Chamar um trabalhador:**
  - **Toque nele:** painel com o nome, a carga, o que está fazendo, o tempo de volta e a chance.
  - **Grade:** "Voltar" (chama só ele e o segura dentro), "Liberar" (solta) e "Fechar".
- **Salvar:**
  - **Como:** botão "Salvar" no topo, que só funciona na calma. A partida também é salva sozinha no começo de cada calma.
  - **Onde fica:** no navegador (localStorage), com duas vagas, a manual e a automática.
  - **Tela de início:** "Continuar" com a onda de cada vaga.
  - **Formato:** o mundo inteiro menos as listas de rascunho do enxame. Grades grandes vão esparsas (só o que não é zero), em poucas dezenas de KB.
  - **Teste:** carregar e seguir dá o mesmo hash que nunca ter salvo.
- **Mortes marcantes** (só visual e som; nada muda na simulação):
  - **Bote:** 3 a 5 insetos saltam de lados diferentes sobre quem é pego, não mais 1. A vítima se debate um instante antes de cair.
  - **Na tela:** jato de líquido escuro no chão, que fica até o fim da onda, um anel vermelho que abre e um rótulo "✝ Ana" por 3 s.
  - **Som e câmera:** grito curto sintetizado com o estalo; a câmera treme de leve quando a morte é na tela.
  - **Aviso:** "Os insetos pegaram Ana" ganha um toque que leva a câmera até lá.
  - **Tropas:** soldados e robôs que caem também ganham o jato e o anel.

## C.32 Etapa 17: como ficou

- **Aviso de 20 s** (`config.warning`).
- **Chamar um trabalhador:**
  - **Toque nele:** a tela projeta cada trabalhador visível, e o toque pega o mais perto, com 26 px de folga, antes da tropa se ela estiver mais longe.
  - **Painel:** nome, o que está fazendo, carga, velocidade, ferido ou chamado, e "volta em X s · a horda chega em Y s" (em vermelho, com a chance, se não chega).
  - **Grade:** "Voltar" chama só ele (`recallWorkers`, que segura dentro); "Liberar" solta (`releaseWorkers`).
- **Salvar** (`src/sim/save.ts`, `src/game/saves.ts`):
  - **Como salva:** só na calma. O mundo vai em JSON, e as grades persistentes do enxame vão esparsas.
  - **Tamanho:** cerca de 13 KB por save no começo do jogo.
  - **Vagas:** a manual, pelo botão de disquete no topo, e a automática, no começo de cada calma (aviso "Salvo automaticamente").
  - **Tela de início:** "Continuar · onda N" para cada vaga, com quem salvou, trabalhadores, minério e há quanto tempo. O botão principal vira "Novo jogo" (ou "Continuar", se a página já nasceu de um save).
  - **Ao carregar:** vale a configuração atual do jogo.
  - **Testes:** carregar e seguir dá o mesmo hash que nunca ter salvo; só salva na calma; o arquivo fica abaixo de 200 KB.
- **Atenção a tudo que está fora:**
  - **Campo dos caçadores:** as sementes são todos os prédios fora da muralha do posto, cada um com custo inicial de 2,5 m de caminho por inseto que o empurrou no último tick (até 40 m).
  - **Recálculo:** o campo dos caçadores é refeito sozinho a cada 0,5 s quando a fila muda. O do núcleo só quando o terreno muda.
  - **Medido** (onda de 900, fortim, torre e gerador fora; outro gerador dentro): os três de fora levam dano. O fortim blindado perdeu cerca de 300, a torre ficou com 212–439 de 600 e o gerador caiu; o de dentro ficou inteiro.
  - **"Consertar"** agora conserta também os prédios (`buildingMissing`), no mesmo preço por vida.
- **Fortim como posto avançado:**
  - **Fora da muralha:** blindado (−40% de mordida), com +3 m de alcance a mais (+6 m no total).
  - **Construção:** até 95 m do centro, contra 50 m dos outros prédios, para ficar perto do minério longe.
  - **Abrigo de 4 trabalhadores:**
    - na rolagem, cada um corre para o refúgio mais perto, portão ou fortim pronto com vaga, e a chance usa essa distância;
    - quem se salva no fortim fica abrigado (estado `sheltered`): some do mapa e acende uma luz âmbar no teto;
    - no fim da onda sai pela porta e volta para casa com a carga;
    - se o fortim cair com gente dentro, eles são pegos; demolido, saem e voltam.
  - **Chance projetada:** o "não chega · %" também conta o fortim.
  - **Visto no navegador:** fortim a 55 m, perto do minério do meio. Sem alarme, Malu e Rafa se abrigaram ("se abrigou no fortim!") e o painel mostrou "abrigo 2/4".
- **Mortes marcantes** (só tela e som):
  - **Bote:** 4 insetos dão o bote em arco, de lados diferentes. A vítima se debate no último meio segundo.
  - **Na tela:** jato de líquido escuro (partículas pelo tempo do jogo), mancha irregular que fica até o fim da onda e anel vermelho.
  - **Som e rótulo:** grito sintetizado com o estalo e o rótulo "✝ Ana".
  - **Câmera:** treme de leve se a morte é na tela.
  - **Aviso:** "Os insetos pegaram Ana. Toque para ver." leva a câmera até lá.
  - **Tropas:** soldados e robôs que caem também ganham o jato e o anel.
- **Erro antigo corrigido:** o worker reenviava no começo de cada lote os eventos do último tick do lote anterior. Com o jogo normal, em lotes de 1 tick, um aviso podia sair duas vezes. Agora a lista é limpa antes dos comandos, e numa onda cada evento chegou uma vez só.
- **Testes:** 73 no total.
  - `tests/save.test.ts`: 3.
  - `tests/outpost.test.ts`: 5 (alcance e blindagem, abrigo e volta com carga, 4 vagas, queda com gente dentro, hash).
  - `tests/swarm-ai.test.ts`: o teste dos caçadores agora confere que os três prédios de fora levam dano e o de dentro não.
- **Equilíbrio** (bots de sempre, 2 sementes, até a onda 22):

  | Bot | Antes desta etapa (aviso de 30 s) | Agora |
  |---|---|---|
  | Sem construir | 6 | 6 |
  | Torres e soldados, sem melhorar | 9–10 | 7–10 |
  | Melhorando tudo (geradores e quartel fora) | 16–17 | 10–13 |
  | Esperto (geradores e quartel dentro da muralha) | — | 10–11, sem perder prédio |

  - **O que pesa mais é o aviso de 20 s.** O bot esperto ia à onda 13–15 com 30 s e foi à 10–11 com 20 s, mesmo usando "Chamar em risco".
  - **Os caçadores pesam para quem deixa a economia fora.** Com 20% de caçadores e percepção de 25 m, o bot simples caía na 8–9; ficaram 15% (até 30%) e 20 m.
  - **O jogo ficou mais difícil:** a decisão de compensar (mais minério por viagem, horda crescendo mais devagar ou calma mais longa) fica com o usuário.

## C.33 Etapa 18: o visual do forte

**Pedido (2026-11-06):** o usuário mandou uma imagem de referência de uma base militar no deserto e pediu um forte mais detalhado, com peças do KayKit local ou modelos de licença permissiva da internet (projeto de hobby, sem fim comercial).

**O que tinha no KayKit local:** nada de muralha de concreto, guarita ou portão blindado; o Space Base tem estilo de brinquedo (branco e laranja). Do KayKit vieram só enfeites: caixas, barris de combustível, pallet e cargas (Resource Bits e Space Base, com os .bin baixados por `git lfs pull` da coleção). O resto é feito por código, com texturas pintadas em canvas. Nada foi baixado da internet.

**O que mudou na tela (`src/render/fortress.ts`, `src/render/yard.ts`, `src/render/stage.ts`):**
- **Muralha por célula**, como antes (o dano aparece célula a célula): corpo de concreto moldado (furos de forma, escorridos, poeira no pé), capa mais larga no alto e painéis escuros com grade entre as colunas.
- **Colunas:** no anel fixo, uma no meio de cada lance e os batentes dos portões; nas muralhas do jogador, nas pontas, ao lado de portões e a cada 5 células. Cobrem as duas fileiras do anel e somem se uma das células cair.
- **Portões:** chapa nervurada com faixa de perigo que desce no chão (aberto, fica a laje listrada). Batentes listrados com luz âmbar com o portão aberto e vermelha com ele fechando ou fechado.
- **Escombros:** pedaços de concreto no lugar das células caídas (antes era a caixa achatada).
- **Torres:** baluarte octogonal de concreto nos cantos (faixa de perigo, laje e parapeito) e casamata menor nas torres construídas; canhão com anel, carcaça blindada, chapa inclinada e um, dois ou três canos pelo nível. O retrato da torre usa a casamata.
- **Pátio:** areia batida com trilhas de pneu até os portões e terra junto da muralha; laje de concreto escuro com cantoneiras listradas embaixo do depósito e de cada prédio.
- **Enfeites:** pilhas de caixas, barris, pallet e cargas junto da muralha, longe das trilhas e dos lugares de espera; quatro holofotes junto dos baluartes. Um grupo some se o jogador construir um prédio por cima.
- **Dunas só no sombreado:** o chão do jogo continua plano (a horda e as pessoas andam em y = 0), mas o shader do chão desenha cristas e vales e, de perto, ondinhas de vento. Tudo some perto da base.

**Custo:** instâncias e geometrias juntadas (caixas com só dois grupos, parapeito numa malha só). O quadro no Mac ficou em ~0,4 ms de CPU com a base inteira na tela. Os 73 testes passam (a mudança é só de tela).

**Falta:** jogar no iPhone e ver se o desempenho segue igual.

## C.34 Direção de arte: decisão de 2026-11-06

**Pedidos do usuário:**
- Bioma aleatório a cada partida nova (deserto, floresta, gelo).
- Inimigos com mais detalhe e variações; pode usar itch.io ou modelos abertos se o KayKit local não tiver.
- Um tema mais adulto e sombrio para o jogo de horda e defesa.

**O que foi visto:**
- **KayKit local:** não há insetos nem criaturas. O Forest Nature Pack tem árvores, pedras e capim em 8 cores.
- **Internet:** nenhum pacote aberto de insetos alienígenas animados combina com o jogo e aguenta milhares de cópias. Os candidatos:
  - Quaternius Ultimate Monsters (CC0): monstros fofos.
  - "Alien Bug Animated" do OpenGameArt (CC0): um único bicho de pernas compridas, perto demais do inseto do filme.
  - Uma formiga CC0 só em .blend.
- **Teste de noite escura** (`?clima=noite`): o usuário não gostou, porque o jogador perderia os detalhes do enxame. O teste foi removido.

**Decisão:** 3D sombrio (sem 2.5D), com o tom pesado vindo da paleta, sem escuridão: o enxame tem que aparecer. Os inimigos mais detalhados e variados ficam para a próxima etapa.

## C.35 Etapa 19: biomas e tom sombrio (como ficou)

- **Bioma por partida** (`src/render/biome.ts`): sai da semente do mundo (resto da divisão por 3), então um save volta no mesmo bioma. A tela de início mostra "Planeta desta partida". Teste: `?bioma=deserto|floresta|gelo`. Não muda a simulação.
  - **Deserto:** fim de tarde sujo de poeira, sol baixo amarelado, dunas e poeira soprada; pedras do Space Base e árvores secas; insetos marrom-escuros.
  - **Floresta:** mata úmida e cinzenta, manchas de musgo e terra no chão, pinheiros (só as coníferas do pacote; as copas redondas e cúbicas têm cara de brinquedo), moitas, pedras e capim, esporos no ar; insetos âmbar (aparecem no verde).
  - **Gelo:** nevasca cinza, montes e marcas de vento na neve, pinheiros azul-petróleo, árvores secas e pedras com neve nas faces de cima (shader), neve caindo; insetos quase pretos (ótima leitura na neve).
- **Grade de cor** (`src/render/grade.ts`): menos saturação, tom do bioma e curva ACES, sem passo extra de pós-processamento (vai no tone mapping do three; o enxame usa o mesmo no shader dele). Vinheta leve nas bordas (CSS).
- **Muralha e pátio:** concreto mais gasto (ferrugem e fuligem), poeira do pé e piso do pátio na cor do bioma.
- **Personagens:** a cabeça do KayKit a 60% (osso `head`, depois da animação). Saem da cara de cabeçudo.
- **Flora** (`src/render/flora.ts`): instanciada, até ~330 mil triângulos (floresta); nada nasce a menos de ~30 m da base, perto das jazidas ou no caminho até elas; some embaixo de prédios e perto de jazidas novas. Partículas no ar (`src/render/ambient.ts`) na GPU, presas ao mundo em volta da câmera.
- **Custo no Mac:** ~0,6–0,9 ms de CPU por quadro na floresta. Falta medir no iPhone.
- **Testes:** 76 (3 novos do bioma) na época.

**Próximo:** inimigos com mais detalhe e variações (§C.36).

## C.36 Etapa 20: espécies do enxame

**Pedido (2026-11-06):** inimigos com mais detalhe e variações. Nada aberto na internet serviu, e o usuário perguntou se podia usar modelos do StarCraft (de um mod do StarCraft II, `ClassicModFile4.SC2Mod`, com 206 modelos .m3 do Brood War). A resposta foi não: a arte é da Blizzard, só pode ser usada dentro do StarCraft II, e o projeto não usa personagem nem visual de outro jogo, mesmo em repositório privado. As espécies são desenhos nossos, inspirados em insetos de verdade.

**As espécies** (`src/sim/config.ts` → `species`, malhas em `src/render/bugMesh.ts`):

| Espécie | Inspiração | Vida | Velocidade | Mordida | Desde a onda | Papel |
|---|---|---|---|---|---|---|
| Corredor | formiga | 1× | 1× | 1× | 1 | o grosso da horda; o escavador é corredor |
| Besouro couraçado | besouro-rinoceronte | 3× | 0,55× | 1,6× | 3 | casco em domo, chifre; aguenta tiro e abre brecha |
| Saltador | gafanhoto | 0,6× | 1,3× | 0,8× | 2 | bote nas tropas a até 6 m; pula a muralha quando a pilha encostada passa de 60% |
| Cuspidor | besouro-bombardeiro | 1,3× | 0,75× | 0,5× | 4 | bolsas verdes acesas; para a até 8 m e cospe ácido (1,2/s) na muralha, portão fechado ou prédio |

- **Frações:** cada espécie começa numa fração e cresce por onda até um teto: besouro até 12%, saltador até 18%, cuspidor até 9%. O resto é corredor. Na onda 10, com cerca de 900 insetos, vieram uns 75 besouros, 99 saltadores e 75 cuspidores.
- **Tela:**
  - quatro espécies × três níveis de detalhe (12 chamadas de desenho);
  - olhos cor de brasa e bolsas de ácido com brilho próprio;
  - besouro maior e lustroso, saltador mais claro, cuspidor oliva;
  - o cuspe é um arco de bolhas verdes com respingo no alvo;
  - o saltador sobe em arco no bote e no pulo da muralha;
  - os quatro insetos do bote das mortes marcantes agora são saltadores.
- **Simulação:**
  - espécie, relógio do pulo e alvo por inseto (`sp`, `leap`, `aim`);
  - a mordida de cada espécie multiplica a mordida em muralha, prédio, tropa e núcleo;
  - o cuspidor procura alvo pelo caminho a cada tick, até 8 células.
- **Tela de início:** um parágrafo explica as espécies e sugere derrubar os cuspidores primeiro.
- **Custo:**
  - de perto, 700 a 980 triângulos por inseto; de longe, 116 a 180;
  - no Mac, 4000 insetos com a floresta custam ~1,1 ms de CPU por quadro;
  - falta medir no iPhone.
- **Testes:** 80 (4 novos).

**Equilíbrio** (bots com 6 sementes, onda média em que caem):

| Variante | Torres e soldados | Melhorando tudo |
|---|---|---|
| Sem espécies novas | 7,7 | 8,7 |
| Espécies na primeira versão (besouro 5×, cuspe 2,5/s, pulo a 40%) | 6,7 | 7,2 |
| Ajustadas (valores acima) e horda crescendo 8% menos | 8,8 | 9,2 |

Ficaram as ajustadas: o jogo fica um pouco mais fácil que antes das espécies (cerca de meia onda a uma onda), o que compensa em parte a dificuldade do aviso de 20 s (§C.32). O bot esperto (economia dentro da muralha e "Chamar em risco") cai na onda 10–12; antes caía na 10–11.

## C.37 Etapa 21: tiros com efeitos do pixelfx

**Pedido (2026-11-06):** usar efeitos do pixelfx (https://patch-gg.github.io/pixelfx) no jogo: "SMG burst" nas torres no lugar da linha que representava os tiros e "Pistol shot" nos soldados e robôs.

**O que é o pixelfx:** biblioteca com 244 efeitos em pixel art (github.com/patch-gg/pixelfx), cada um um arquivo JS que desenha os quadros por código, sem imagens. Dá para usar o código direto num jogo de navegador ou exportar folhas de quadros (PNG e JSON) com uma ferramenta em node. Tem também uma skill do Claude Code para criar efeitos.
- **Licença:** MIT, no código e nos efeitos. Pode usar em qualquer projeto, inclusive comercial, mantendo o aviso de copyright. Partes adaptam o muzzle-flash do Sprite Fusion (Hugo Duprez, também MIT). A fonte da galeria não entra na licença, mas não usamos.
- **Os dois efeitos:** são clarões de cano, não rastros de bala.
  - "SMG burst" (`projectiles/muzzle-smg`): laço de 1 s, 12 tiros por segundo, com clarão, faíscas, fumaça e cápsulas.
  - "Pistol shot" (`projectiles/muzzle-pistol`): tiro único de 1,8 s, com clarão, faíscas, uma volta de fumaça e a cápsula.

**Como entrou:**
- **Download:** com o OK do usuário, baixei só 19 arquivos (~150 KB, commit a841596) para uma pasta temporária, fora do repositório. Li o código antes de rodar: só imports locais e `node:zlib`, nada de rede ou disco.
- **Folha de quadros:** `tools/bake-fx.ts` (`npm run fx -- <pasta do pixelfx>`) roda os dois efeitos uma vez no node e grava uma folha só, `public/assets/fx/tiros.png` (1022×290, 70 KB), com as medidas em `src/render/shotSheet.ts` (gerado). O jogo não leva código do pixelfx.
- **Recorte (nossa única mudança):** os efeitos têm um chão 26 px abaixo do cano. A folha vai só até 12 px abaixo do cano, então a cápsula cai para fora do quadro em vez de quicar no ar, e somem as faíscas no piso e o brilho do chão. O tiro de pistola termina no último quadro com fumaça (49 quadros).

**Na tela (`src/render/shotFx.ts`):**
- Cada tiro é um quadrado virado para a câmera, com o cano no ponto de saída e girado na tela para o lado do alvo. Com o alvo à esquerda ele espelha, para a fumaça continuar subindo.
- Tudo numa malha instanciada só: uma textura e uma chamada de desenho, a mesma conta de antes (sai a linha, entra o clarão). Os buffers são fixos e nada é alocado por tiro.
- A animação anda pelo tempo de jogo: congela na pausa e acelera no 2× e no 4×.
- **Torres:** um lugar fixo por torre (até 64), com o "SMG burst" em laço na ponta do cano enquanto a torre tem alvo. Some em 0,3 s quando ela para; se pegar outro alvo nesse meio-tempo, o laço continua sem piscar.
- **Tropas:** anel de 512 lugares para o "Pistol shot". A simulação dá dano contínuo (dps), então a cadência é só enfeite: soldado a cada ~0,32 s, atirador a cada ~1,1 s e robô (metralhadora) a cada ~0,16 s, com um pouco de sorteio.
- **De onde sai o tiro das tropas:**
  - boneco do KayKit: da ponta do cano da arma. `CharView.muzzle` fica na face +z da caixa da arma, presa nela, então acompanha a animação;
  - modelo simples (`?semarte`): de um ponto à frente do corpo;
  - fortim: da seteira, como antes.
- **Tamanho:** de perto, cada px do efeito tem 5 cm na torre, 2,6 cm no soldado, 3,4 cm no atirador e 3,6 cm no robô. De longe, cada px ocupa pelo menos 1/560 da altura visível, até 3× o tamanho de perto. Sem isso, no zoom padrão o clarão virava um ponto.
- **Cor:** a folha sai como o pixelfx desenha, sem a grade de cor e sem névoa (como as outras partículas). Pixel nítido (filtro "nearest", sem mipmaps) e 1 px vazio em volta de cada quadro.

**Visto no Mac (onda 10):** as quatro torres piscam bem visíveis no zoom padrão. De perto, o clarão sai da ponta do canhão e do cano da metralhadora do robô, com faíscas e fumaça. A ponta da arma do soldado ficou a 0,8 m de altura e 0,85 m à frente do boneco.

**Custo:** uma chamada de desenho no lugar da linha. São até 576 instâncias de 4 vértices; as que não têm tiro saem da tela já no shader de vértices. Por quadro, só sobe o buffer de instâncias (~23 KB) quando algum tiro muda. A textura tem 1,2 MB na GPU. Os testes continuam 80 (a mudança é só de tela).

**Falta:** jogar no iPhone e ver o custo de pixel com o exército inteiro atirando. Se pesar, dá para encurtar o tiro de pistola (a fumaça depois de ~1 s é fraca) ou espaçar a cadência.
