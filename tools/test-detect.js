// Offline test of the detection pipeline with synthetic piano-like tones.
// Usage: node tools/test-detect.js
const T = require('../theory.js');
const D = require('../detect.js');
const SR = 48000, N = 8192;

function tone(midis, { noise = 0.01, seed = 1, detune = 0 } = {}) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
  const buf = new Float32Array(N);
  for (const m of midis) {
    const f0 = T.midiToFreq(m) * Math.pow(2, detune / 1200);
    // piano-ish partials with slight inharmonicity and decaying amplitudes
    for (let h = 1; h <= 8; h++) {
      const fh = f0 * h * Math.sqrt(1 + 0.0004 * h * h);
      const amp = (m < 48 && h === 1 ? 0.3 : 1) / Math.pow(h, 1.1);
      const ph = rnd() * 6.28;
      for (let i = 0; i < N; i++) buf[i] += 0.1 * amp * Math.sin(2 * Math.PI * fh * i / SR + ph);
    }
  }
  for (let i = 0; i < N; i++) buf[i] += noise * rnd();
  return buf;
}
function fftDb(buf) {
  // Blackman window + radix-2 FFT, like AnalyserNode
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { const a = 2 * Math.PI * i / N; re[i] = buf[i] * (0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a)); }
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len;
    for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
      re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi;
    }
  }
  const db = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++) db[i] = 20 * Math.log10(Math.hypot(re[i], im[i]) / N + 1e-12);
  return db;
}
function analyse(midis, opts) {
  const db = fftDb(tone(midis, opts));
  return D.chromaFromPeaks(D.spectrumPeaks(db, SR, N, { minFreq: 60, maxFreq: 2500, rangeDb: 32 }));
}

if (process.env.PEEK) {
  for (const [s, m] of [['C', [48, 60, 64, 67]], ['Am', [57, 60, 64]], ['F', [53, 57, 60]], ['Bb', [58, 62, 65]], ['G', [55, 59, 62]], ['Cmaj7', [60, 64, 67, 71]], ['C/E', [52, 55, 60]]]) {
    const { chroma, bassPc } = analyse(m, { detune: 8 });
    console.log(s.padEnd(6), chroma.map((v, i) => T.SHARP_NAMES[i] + ':' + v.toFixed(2)).filter((x, i) => chroma[i] > 0.05).join(' '), 'bass', T.SHARP_NAMES[bassPc]);
  }
  process.exit(0);
}
let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra || ''); } };

const cases = [
  ['C', [48, 60, 64, 67]], ['Am', [57, 60, 64]], ['F', [53, 57, 60]], ['G', [55, 59, 62]],
  ['G7', [55, 59, 62, 65]], ['Dm7', [50, 57, 60, 65]], ['Cmaj7', [60, 64, 67, 71]], ['Gsus4', [55, 60, 62]],
  ['Bb', [58, 62, 65]], ['E', [52, 56, 59, 64]], ['Fm', [53, 56, 60]], ['Bdim', [59, 62, 65]]
];
const all = cases.map(c => T.parseChordSymbol(c[0]));
for (const level of ['forgiving', 'normal', 'strict']) {
  for (const [sym, midis] of cases) {
    const { chroma, bassPc } = analyse(midis, { detune: 8 });
    for (const target of all) {
      const res = D.matchChord(chroma, target, level, bassPc);
      const shouldMatch = new Set(target.pcs).size === new Set(midis.map(m => m % 12)).size && target.pcs.every(pc => midis.some(m => m % 12 === pc));
      // In forgiving mode a triad may be accepted for its 7th chord (superset). Only flag real confusions.
      const superset = target.pcs.every(pc => midis.some(m => m % 12 === pc));
      if (shouldMatch) check(level + ' ' + sym + ' accepts ' + target.symbol, res.ok, JSON.stringify(res));
      else if (!superset) check(level + ' ' + sym + ' rejects ' + target.symbol, !res.ok, res.score.toFixed(2));
    }
  }
}
// Played G7 should not pass as plain G at normal (extra F) — informational
{
  const { chroma } = analyse([55, 59, 62, 65]);
  console.log('G7 played vs G target (normal):', D.matchChord(chroma, T.parseChordSymbol('G'), 'normal').score.toFixed(2));
}
// Triad without fifth in forgiving mode
{
  const { chroma, bassPc } = analyse([60, 64]);
  check('forgiving accepts C without G', D.matchChord(chroma, T.parseChordSymbol('C'), 'forgiving', bassPc).ok);
}
// Inversion bass detection
{
  const target = T.resolveChord({ chord: 'C', inversion: 1 });
  target.checkBass = true;
  const inv = analyse([52, 55, 60]);
  check('C/E bass detected', inv.bassPc === 4, inv.bassPc);
  check('normal accepts C/E', D.matchChord(inv.chroma, target, 'normal', inv.bassPc).ok);
  const root = analyse([48, 52, 55]);
  check('normal rejects root position for C/E', !D.matchChord(root.chroma, target, 'normal', root.bassPc).ok);
}
// Single notes with YIN
for (const m of [48, 55, 60, 64, 67, 72, 79]) {
  const p = D.yin(tone([m]).subarray(N - 3072), SR, { minFreq: 60, maxFreq: 2100, threshold: 0.18 });
  const got = p ? Math.round(T.freqToMidi(p.freq)) : null;
  check('yin ' + T.midiToName(m), got === m, got);
}
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
