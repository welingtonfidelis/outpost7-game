# Outpost 7

Estratégia em tempo real e sobrevivência em 3D no navegador. Os trabalhadores saem para buscar
minério longe da base; quando a sirene toca, milhares de insetos cruzam o perímetro, e o que
segura a horda são as muralhas, as torres, os soldados e os fortins que você ergueu na calma.

Feito em TypeScript com Three.js e Preact. A horda roda num Web Worker, com simulação
determinística a 20 ticks por segundo.

## Rodar

```bash
npm install
npm run dev
```

Outros comandos:

- `npm test`: os testes (Vitest).
- `npm run build`: checagem de tipos e build de produção em `dist/`.
- `npm run balance`: jogadores automáticos para medir o equilíbrio.

## Documentação

Tudo sobre o projeto (GDD, avaliação técnica, roteiro por etapas, estado e decisões) fica num
doc único: [docs/POSTO-AVANCADO.md](docs/POSTO-AVANCADO.md).

## Licenças

Modelos 3D do KayKit (Kay Lousberg, CC0). Detalhes em [LICENSES.md](LICENSES.md).
