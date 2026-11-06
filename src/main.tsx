import './ui/style.css';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

if (params.has('bench')) {
  const { startBench } = await import('./bench/bench.ts');
  startBench(canvas, ui);
} else {
  const { startGame } = await import('./game/boot.tsx');
  startGame(canvas, ui, document.getElementById('labels')!);
}
