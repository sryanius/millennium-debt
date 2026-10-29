/**
 * 칩튠 음악·효과음(WebAudio 합성, 파일 없음). 16비트 RPG 풍: 펄스파 멜로디 + 삼각파 베이스 + 잡음 타악.
 * 브라우저 정책상 첫 터치/클릭 뒤에 소리가 난다. 켜고 끄기는 시스템 창, 설정은 localStorage(기기별 편의).
 */
type Song = { bpm: number; lead: string; bass: string; drums?: string; leadVol?: number; bassVol?: number; duty?: number };

// 8분음표 한 칸 = 한 글자 묶음. '.' 앞 음 유지, '-' 쉼. 마디 구분 '|' 는 읽을 때 무시.
const SONGS: Record<string, Song> = {
  // 지도: D 도리안, 느긋한 행군
  field: {
    bpm: 100, duty: 0.25, leadVol: 0.07, bassVol: 0.11,
    lead: 'D5 . F5 . A5 . G5 F5 | E5 . C5 . D5 . . . | F5 . A5 . C6 . B5 A5 | G5 . E5 . A5 . . . | A5 . G5 F5 E5 . D5 . | C5 . E5 . G5 . F5 E5 | D5 . E5 F5 E5 . C5 . | D5 . . . - - - - |'
      + ' A4 . D5 . F5 . E5 D5 | C5 . E5 . G5 . . . | B4 . D5 . F5 . E5 D5 | C5 . A4 . G4 . . . | F4 . A4 . D5 . C5 D5 | E5 . G5 . F5 . E5 C5 | D5 . A4 . C5 . E5 . | D5 . . . - - - - |',
    bass: 'D3 . A3 . D3 . A3 . | C3 . G3 . C3 . G3 . | F3 . C4 . F3 . C4 . | C3 . G3 . A3 . E3 . | A2 . E3 . A2 . E3 . | C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | D3 . A3 . D3 . . . |'
      + ' D3 . A3 . D3 . A3 . | C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | A2 . E3 . A2 . E3 . | D3 . A3 . D3 . A3 . | C3 . G3 . C3 . G3 . | A2 . E3 . A2 . E3 . | D3 . A3 . D3 . . . |',
    drums: '- h - h - h - h |',
  },
  // 전투: A 단조, 빠른 돌격
  battle: {
    bpm: 152, duty: 0.125, leadVol: 0.065, bassVol: 0.12,
    lead: 'A4 A4 C5 A4 E5 A4 D5 C5 | B4 B4 D5 B4 E5 . G#4 . | A4 A4 C5 A4 E5 A4 G5 F5 | E5 D5 C5 B4 A4 . . . | F5 . E5 . D5 . C5 . | D5 . C5 . B4 . G#4 . | A4 C5 E5 A5 G5 F5 E5 D5 | E5 . . . E4 . . . |',
    bass: 'A2 A3 A2 A3 A2 A3 A2 A3 | E2 E3 E2 E3 E2 E3 E2 E3 | A2 A3 A2 A3 A2 A3 A2 A3 | E2 E3 E2 E3 A2 A3 A2 A3 | F2 F3 F2 F3 F2 F3 F2 F3 | E2 E3 E2 E3 E2 E3 E2 E3 | A2 A3 A2 A3 C3 C4 D3 D4 | E2 E3 E2 E3 E2 . . . |',
    drums: 'k h s h k k s h |',
  },
  // 엔딩: C 장조, 느리게
  ending: {
    bpm: 72, duty: 0.5, leadVol: 0.06, bassVol: 0.1,
    lead: 'E5 . . . D5 . C5 . | D5 . . . G4 . . . | C5 . . . E5 . G5 . | A5 . . . G5 . . . | F5 . . . E5 . D5 . | E5 . . . C5 . A4 . | D5 . . . G4 . B4 . | C5 . . . . . . . |',
    bass: 'C3 . G3 . E3 . G3 . | G2 . D3 . B2 . D3 . | A2 . E3 . C3 . E3 . | F2 . C3 . A2 . C3 . | D3 . A3 . F3 . A3 . | A2 . E3 . C3 . E3 . | G2 . D3 . B2 . D3 . | C3 . G3 . C3 . . . |',
  },
};

const NOTE: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function freq(n: string): number { const m = /^([A-G]#?)(\d)$/.exec(n); if (!m) return 0; const midi = 12 * (+m[2] + 1) + NOTE[m[1]]; return 440 * Math.pow(2, (midi - 69) / 12); }
function parse(s: string): string[] { return s.split(/\s+/).filter(t => t && t !== '|'); }

export class ChipAudio {
  private ctx: BaseAudioContext | null = null;
  private master!: GainNode; private musicBus!: GainNode; private sfxBus!: GainNode;
  private waves = new Map<number, PeriodicWave>();
  private noise!: AudioBuffer;
  private song: string | null = null; private want: string | null = null;
  private step = 0; private nextTime = 0; private timer: number | null = null;
  musicOn = true; sfxOn = true;

  constructor(headless = false) {
    if (headless) return;
    try { const s = JSON.parse(localStorage.getItem('mercenary.audio') || '{}'); if (s.music === false) this.musicOn = false; if (s.sfx === false) this.sfxOn = false; } catch { /* 저장소를 못 쓰면 기본값 */ }
    const unlock = () => { this.init(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => { const c = this.ctx as AudioContext | null; if (!c) return; if (document.hidden) c.suspend(); else c.resume(); });
  }
  private save(): void { try { localStorage.setItem('mercenary.audio', JSON.stringify({ music: this.musicOn, sfx: this.sfxOn })); } catch { /* ignore */ } }
  private init(): void {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    this.setup(new AC());
    this.timer = window.setInterval(() => this.pump(), 25);
  }
  private setup(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 1 : 0; this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = this.sfxOn ? 1 : 0; this.sfxBus.connect(this.master);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  /** 듀티비 펄스파(푸리에 급수) */
  private pulse(duty: number): PeriodicWave {
    let w = this.waves.get(duty); if (w) return w;
    const N = 32, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    w = this.ctx!.createPeriodicWave(re, im); this.waves.set(duty, w); return w;
  }
  private tone(t: number, f: number, dur: number, vol: number, kind: 'pulse' | 'tri', duty = 0.25, bus = this.musicBus, slide = 0): void {
    const c = this.ctx!; const o = c.createOscillator(); const g = c.createGain();
    if (kind === 'tri') o.type = 'triangle'; else o.setPeriodicWave(this.pulse(duty));
    o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.04)); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  private hit(t: number, kind: string, bus = this.musicBus, vol = 1): void {
    const c = this.ctx!;
    if (kind === 'k') { this.tone(t, 140, 0.12, 0.22 * vol, 'tri', 0, bus, 0.35); return; }
    const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); const g = c.createGain();
    f.type = kind === 'h' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'h' ? 7000 : 1800;
    const dur = kind === 'h' ? 0.04 : 0.12; g.gain.setValueAtTime((kind === 'h' ? 0.05 : 0.12) * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(bus); s.start(t); s.stop(t + dur + 0.01);
  }
  /** 앞으로 0.15초 분량을 미리 예약한다 */
  private pump(horizon = 0.15): void {
    const c = this.ctx; if (!c) return;
    if (this.want !== this.song) { this.song = this.want; this.step = 0; this.nextTime = c.currentTime + 0.08; }
    const def = this.song ? SONGS[this.song] : null; if (!def) return;
    const lead = parse(def.lead), bass = parse(def.bass), drums = def.drums ? parse(def.drums) : [];
    const sp = 60 / def.bpm / 2; // 8분음표 길이
    while (this.nextTime < c.currentTime + horizon) {
      const t = this.nextTime, i = this.step;
      const play = (seq: string[], vol: number, kind: 'pulse' | 'tri', duty: number) => {
        const n = seq[i % seq.length]; if (!n || n === '.' || n === '-') return;
        let len = 1; while (seq[(i + len) % seq.length] === '.' && len < 8) len++;
        this.tone(t, freq(n), sp * len * 0.95, vol, kind, duty);
      };
      play(lead, def.leadVol ?? 0.07, 'pulse', def.duty ?? 0.25);
      play(bass, def.bassVol ?? 0.11, 'tri', 0);
      // 화음 보조(멜로디 3도 아래, 아주 작게) — 지도 곡만
      if (this.song === 'field' && i % 4 === 0) { const n = lead[i % lead.length]; if (n && n !== '.' && n !== '-') this.tone(t, freq(n) * 0.84, sp * 1.8, 0.025, 'pulse', 0.5); }
      if (drums.length) { const d = drums[i % drums.length]; if (d && d !== '-' && d !== '.') this.hit(t, d); }
      this.step++; this.nextTime += sp;
    }
  }
  play(song: string | null): void { this.want = song; }
  setMusic(on: boolean): void { this.musicOn = on; this.save(); if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05); }
  setSfx(on: boolean): void { this.sfxOn = on; this.save(); if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05); }

  private last: Record<string, number> = {};
  /** 효과음. 같은 소리는 짧은 간격으로 겹치지 않게 */
  sfx(name: 'click' | 'coin' | 'pay' | 'hit' | 'shoot' | 'win' | 'lose' | 'bell' | 'event' | 'deny' | 'march', gap = 0.05): void {
    const c = this.ctx; if (!c || !this.sfxOn) return;
    const now = c.currentTime; if ((this.last[name] ?? -1) + gap > now) return; this.last[name] = now;
    const b = this.sfxBus, T = (f: number, dt: number, d: number, v: number, duty = 0.5, slide = 0) => this.tone(now + dt, f, d, v, 'pulse', duty, b, slide);
    switch (name) {
      case 'click': T(1320, 0, 0.03, 0.05, 0.25); break;
      case 'deny': T(220, 0, 0.08, 0.06, 0.5); T(180, 0.07, 0.1, 0.06, 0.5); break;
      case 'coin': T(1568, 0, 0.05, 0.06, 0.25); T(2093, 0.05, 0.12, 0.06, 0.25); break;
      case 'pay': T(784, 0, 0.06, 0.05); T(659, 0.06, 0.06, 0.05); T(523, 0.12, 0.14, 0.05); break;
      case 'hit': this.hit(now, 's', b, 0.9); T(160, 0, 0.06, 0.05, 0.5, 0.5); break;
      case 'shoot': T(1800, 0, 0.06, 0.03, 0.125, 0.4); break;
      case 'march': this.hit(now, 'k', b, 0.4); break;
      case 'bell': for (const [f, dt] of [[1047, 0], [1319, 0.18], [1047, 0.36]] as const) T(f, dt, 0.3, 0.045, 0.125); break;
      case 'event': for (const [f, dt] of [[523, 0], [659, 0.08], [784, 0.16], [1047, 0.24]] as const) T(f, dt, 0.12, 0.045, 0.25); break;
      case 'win': for (const [f, dt, d] of [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.45], [784, 0.42, 0.1], [1047, 0.55, 0.5]] as const) T(f, dt, d, 0.06, 0.25); break;
      case 'lose': for (const [f, dt, d] of [[440, 0, 0.25], [415, 0.25, 0.25], [392, 0.5, 0.25], [370, 0.75, 0.6]] as const) T(f, dt, d, 0.06, 0.5); break;
    }
  }
}

export const AUDIO = new ChipAudio();

/** 곡 하나를 WAV 로 뽑는다(들어 보기·공유용). 브라우저에서만. */
export async function renderSongWav(song: string, seconds = 40): Promise<Blob> {
  const rate = 44100; const off = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
  const a = new ChipAudio(true); (a as any).setup(off); (a as any).want = song; (a as any).pump(seconds);
  const buf = await off.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length; const out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
