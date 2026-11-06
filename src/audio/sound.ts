/**
 * Som todo sintetizado em Web Audio (sem arquivos): sirene, buzina do alarme, portão
 * batendo, mordida e o "ufa" de quem se salvou. O contexto só nasce num toque do jogador.
 * No iPhone, a chave de silêncio pode calar o Web Audio; o aviso visual não depende do som.
 */
/** Quantos estalos por tique para tantos atiradores (cresce devagar). */
function shots0(n: number): number {
  return n <= 0 ? 0 : 1 + Math.log2(n);
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      // Safari 16.4+: pede a categoria "playback" (a confirmar no aparelho se fura a chave de silêncio).
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  private env(gain: GainNode, t0: number, peak: number, attack: number, hold: number, release: number): void {
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.setValueAtTime(peak, t0 + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  /** Sirene que sobe e desce (uns 6 s). */
  siren(seconds = 6): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 640;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.55;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(osc.frequency);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const g = c.createGain();
    this.env(g, t0, 0.32, 0.4, seconds - 1.2, 0.8);
    osc.connect(filter).connect(g).connect(this.master);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + seconds);
    lfo.stop(t0 + seconds);
  }

  /** Buzina de dois tons do alarme geral. */
  horn(): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t0 = c.currentTime;
    [0, 0.42].forEach((dt, i) => {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = i ? 392 : 523;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      const g = c.createGain();
      this.env(g, t0 + dt, 0.22, 0.02, 0.3, 0.08);
      o.connect(f).connect(g).connect(this.master!);
      o.start(t0 + dt);
      o.stop(t0 + dt + 0.45);
    });
  }

  private noise(seconds: number): AudioBufferSourceNode | null {
    const c = this.ctx;
    if (!c) return null;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource();
    s.buffer = buf;
    return s;
  }

  /** Portão batendo. */
  slam(): void {
    const c = this.ctx;
    const s = this.noise(0.6);
    if (!c || !s || !this.master) return;
    const t0 = c.currentTime;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260;
    const g = c.createGain();
    this.env(g, t0, 0.9, 0.005, 0.05, 0.45);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0);
  }

  private swarmGain: GainNode | null = null;
  private swarmSrc: AudioBufferSourceNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private sharedNoise(): AudioBuffer | null {
    const c = this.ctx;
    if (!c) return null;
    if (!this.noiseBuf) {
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  /**
   * Ambiente de combate, chamado umas 5 vezes por segundo: estalos de tiro (quantos
   * atiradores), metralhadora dos robôs e o chiado do enxame (quantos insetos vivos).
   */
  combat(shooters: number, robots: number, bugs: number): void {
    const c = this.ctx;
    const buf = this.sharedNoise();
    if (!c || !this.master || !buf) return;
    const t0 = c.currentTime;
    // Tiros: até 6 estalos espalhados nos próximos 0,2 s.
    const shots = Math.min(6, Math.ceil(shots0(shooters)));
    for (let i = 0; i < shots; i++) {
      const s = c.createBufferSource();
      s.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800 + Math.random() * 1600;
      f.Q.value = 0.9;
      const g = c.createGain();
      const at = t0 + Math.random() * 0.2;
      this.env(g, at, 0.12, 0.002, 0.01, 0.06);
      s.connect(f).connect(g).connect(this.master);
      s.start(at, Math.random() * 1.5, 0.1);
    }
    // Metralhadora: um "brrt" grave enquanto algum robô atira.
    if (robots > 0) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = 38;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      const g = c.createGain();
      this.env(g, t0, 0.07 * Math.min(2, robots), 0.01, 0.16, 0.04);
      o.connect(f).connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.24);
    }
    // Chiado do enxame: ruído agudo com tremor, mais alto com mais insetos.
    if (!this.swarmGain) {
      const s = c.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3600;
      f.Q.value = 2.5;
      const trem = c.createGain();
      const lfo = c.createOscillator();
      lfo.frequency.value = 17;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 0.5;
      lfo.connect(lfoGain).connect(trem.gain);
      const g = c.createGain();
      g.gain.value = 0;
      s.connect(f).connect(trem).connect(g).connect(this.master);
      s.start();
      lfo.start();
      this.swarmGain = g;
      this.swarmSrc = s;
    }
    const level = bugs > 0 ? Math.min(0.16, 0.025 * Math.log2(1 + bugs / 20)) : 0;
    this.swarmGain.gain.setTargetAtTime(level, t0, 0.4);
    void this.swarmSrc;
  }

  /** Batida metálica de obra (martelo em chapa): curta, baixa, com timbre que varia. */
  clank(): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t0 = c.currentTime + Math.random() * 0.15;
    const base = 900 + Math.random() * 700;
    [1, 2.76, 5.4].forEach((k, i) => {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = base * k;
      const g = c.createGain();
      this.env(g, t0, 0.05 / (i + 1), 0.002, 0.005, 0.12 - i * 0.03);
      o.connect(g).connect(this.master!);
      o.start(t0);
      o.stop(t0 + 0.2);
    });
  }

  /** Obra pronta. */
  done(): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t0 = c.currentTime;
    [523, 784].forEach((hz, i) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz;
      const g = c.createGain();
      this.env(g, t0 + i * 0.12, 0.14, 0.01, 0.08, 0.3);
      o.connect(g).connect(this.master!);
      o.start(t0 + i * 0.12);
      o.stop(t0 + i * 0.12 + 0.5);
    });
  }

  /** Tremor de túnel (grave e longo). */
  rumble(): void {
    const c = this.ctx;
    const s = this.noise(1.8);
    if (!c || !s || !this.master) return;
    const t0 = c.currentTime;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 110;
    const g = c.createGain();
    this.env(g, t0, 1.1, 0.3, 0.8, 0.7);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0);
  }

  /** Grito curto (mortes marcantes): duas vozes serrilhadas que caem, com formante. */
  scream(): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t0 = c.currentTime;
    const base = 520 + Math.random() * 180;
    [1, 1.5].forEach((k, i) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * k, t0);
      o.frequency.exponentialRampToValueAtTime(base * k * 0.45, t0 + 0.55);
      const vib = c.createOscillator();
      vib.frequency.value = 9;
      const vg = c.createGain();
      vg.gain.value = 18;
      vib.connect(vg).connect(o.frequency);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 3;
      const g = c.createGain();
      this.env(g, t0, i ? 0.07 : 0.12, 0.02, 0.18, 0.35);
      o.connect(f).connect(g).connect(this.master!);
      o.start(t0);
      vib.start(t0);
      o.stop(t0 + 0.6);
      vib.stop(t0 + 0.6);
    });
  }

  /** Mordida (curta e seca). */
  crunch(): void {
    const c = this.ctx;
    const s = this.noise(0.3);
    if (!c || !s || !this.master) return;
    const t0 = c.currentTime;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 1.2;
    const g = c.createGain();
    this.env(g, t0, 0.5, 0.005, 0.03, 0.2);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0);
  }

  /** Alguém passou o portão a tempo. */
  chime(): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t0 = c.currentTime;
    [660, 880].forEach((hz, i) => {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz;
      const g = c.createGain();
      this.env(g, t0 + i * 0.09, 0.16, 0.01, 0.05, 0.25);
      o.connect(g).connect(this.master!);
      o.start(t0 + i * 0.09);
      o.stop(t0 + i * 0.09 + 0.4);
    });
  }
}
