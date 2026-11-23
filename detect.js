/* Pure detection functions (no browser APIs), so they can be unit tested in Node.
   - yin(): single-note pitch from a time-domain buffer
   - spectrumPeaks() / chromaFromPeaks(): pitch-class energy from an FFT magnitude spectrum
   - matchChord() / matchNote(): forgiving comparisons against a target */
(function (root) {
  'use strict';

  const mod = (n, m) => ((n % m) + m) % m;

  // YIN pitch detector. Returns { freq, clarity } or null.
  function yin(buf, sampleRate, opts) {
    opts = opts || {};
    const minF = opts.minFreq || 60, maxF = opts.maxFreq || 2200;
    const threshold = opts.threshold || 0.15;
    const tauMin = Math.floor(sampleRate / maxF);
    const tauMax = Math.min(Math.floor(sampleRate / minF), Math.floor(buf.length / 2));
    const W = buf.length - tauMax;
    if (W < 64) return null;
    const d = new Float32Array(tauMax + 1);
    for (let tau = tauMin; tau <= tauMax; tau++) {
      let sum = 0;
      for (let i = 0; i < W; i++) {
        const diff = buf[i] - buf[i + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }
    // cumulative mean normalized difference
    let running = 0;
    const cmnd = new Float32Array(tauMax + 1).fill(1);
    for (let tau = 1; tau <= tauMax; tau++) {
      if (tau < tauMin) { running += d[tau]; continue; }
      running += d[tau];
      cmnd[tau] = running > 0 ? d[tau] * tau / running : 1;
    }
    let tau = -1;
    for (let t = tauMin + 1; t < tauMax; t++) {
      if (cmnd[t] < threshold) {
        while (t + 1 < tauMax && cmnd[t + 1] < cmnd[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return null;
    // parabolic interpolation
    const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
    const denom = a + c - 2 * b;
    const shift = denom !== 0 ? 0.5 * (a - c) / denom : 0;
    const freq = sampleRate / (tau + shift);
    return { freq, clarity: 1 - b };
  }

  // Find spectral peaks in a dB spectrum (as from AnalyserNode.getFloatFrequencyData).
  function spectrumPeaks(db, sampleRate, fftSize, opts) {
    opts = opts || {};
    const minF = opts.minFreq || 60, maxF = opts.maxFreq || 2500;
    const binHz = sampleRate / fftSize;
    const lo = Math.max(2, Math.floor(minF / binHz)), hi = Math.min(db.length - 2, Math.ceil(maxF / binHz));
    let maxDb = -Infinity;
    for (let i = lo; i <= hi; i++) if (db[i] > maxDb) maxDb = db[i];
    const floor = maxDb - (opts.rangeDb || 30);
    const peaks = [];
    for (let i = lo; i <= hi; i++) {
      const v = db[i];
      if (v < floor || v <= db[i - 1] || v < db[i + 1]) continue;
      const a = db[i - 1], b = v, c = db[i + 1];
      const denom = a - 2 * b + c;
      const p = denom !== 0 ? 0.5 * (a - c) / denom : 0;
      const freq = (i + p) * binHz;
      const midiF = 69 + 12 * Math.log2(freq / 440);
      const mag = Math.pow(10, (b - maxDb) / 20); // 0..1 relative amplitude
      peaks.push({ freq, midiF, mag });
    }
    return peaks;
  }

  // Pitch-class energy (12 bins, normalized to max 1) plus a bass estimate.
  function chromaFromPeaks(peaks, opts) {
    opts = opts || {};
    const chroma = new Array(12).fill(0);
    let bass = null;
    for (const pk of peaks) {
      const nearest = Math.round(pk.midiF);
      const cents = Math.abs(pk.midiF - nearest);
      if (cents > 0.4) continue; // not a clean note partial
      // de-emphasise the high end, where harmonics pile up
      const weight = pk.freq < 1000 ? 1 : 1000 / pk.freq;
      chroma[mod(nearest, 12)] += pk.mag * weight;
      if (pk.mag > (opts.bassMinMag || 0.18) && (bass === null || nearest < bass)) bass = nearest;
    }
    const max = Math.max(...chroma);
    if (max > 0) for (let i = 0; i < 12; i++) chroma[i] /= max;
    return { chroma, bassMidi: bass, bassPc: bass === null ? null : mod(bass, 12) };
  }

  // present: min chroma for a chord tone to count as played (real notes measure ~0.7-1,
  //          overtones ~0.2-0.3). extraMax: how many strong non-chord notes are tolerated.
  const TOLERANCE = {
    strict:    { present: 0.50, score: 0.70, allowMissing: 0, extraMax: 0, checkBass: true },
    normal:    { present: 0.40, score: 0.60, allowMissing: 0, extraMax: 0, checkBass: true },
    forgiving: { present: 0.30, score: 0.50, allowMissing: 1, extraMax: 1, checkBass: false }
  };
  const EXTRA_LEVEL = 0.6;

  // Compare a chroma vector against the expected pitch classes.
  // Returns { ok, score, missing: [pc], extra: [pc], bassOk }
  function matchChord(chroma, target, level, bassPc) {
    const tol = TOLERANCE[level] || TOLERANCE.normal;
    const want = new Set(target.pcs);
    let inside = 0, total = 0;
    for (let pc = 0; pc < 12; pc++) {
      total += chroma[pc];
      if (want.has(pc)) inside += chroma[pc];
    }
    const score = total > 0 ? inside / total : 0;
    const missing = target.pcs.filter(pc => chroma[pc] < tol.present);
    // Only the fifth may be dropped (forgiving mode); the root and 3rd/sus note define the chord.
    const fifthPc = target.pcs[2];
    const missingOk = missing.length === 0 || (missing.length <= tol.allowMissing && missing.every(pc => pc === fifthPc));
    const extra = [];
    for (let pc = 0; pc < 12; pc++) if (!want.has(pc) && chroma[pc] > EXTRA_LEVEL) extra.push(pc);
    const extraOk = extra.length <= (missing.length ? 0 : tol.extraMax);
    let bassOk = true;
    if (target.checkBass && bassPc !== null && bassPc !== undefined) bassOk = bassPc === target.bassPc;
    const ok = missingOk && extraOk && score >= tol.score && (bassOk || !tol.checkBass);
    return { ok, score, missing, extra, bassOk };
  }

  // Exact comparison for keyboard / MIDI input (a set of MIDI notes).
  function matchHeld(midiNotes, target) {
    const pcs = new Set(midiNotes.map(n => mod(n, 12)));
    const want = new Set(target.pcs);
    const missing = target.pcs.filter(pc => !pcs.has(pc));
    const extra = [...pcs].filter(pc => !want.has(pc));
    const lowest = midiNotes.length ? Math.min(...midiNotes) : null;
    const bassOk = !target.checkBass || lowest === null || mod(lowest, 12) === target.bassPc;
    return { ok: missing.length === 0 && extra.length === 0 && bassOk, missing, extra, bassOk, score: missing.length === 0 && extra.length === 0 ? 1 : 0 };
  }

  function matchNote(midiF, targetPc, targetMidi, level) {
    if (midiF === null || midiF === undefined) return { ok: false };
    const nearest = Math.round(midiF);
    const cents = Math.round((midiF - nearest) * 100);
    const pcOk = mod(nearest, 12) === targetPc;
    const octaveOk = targetMidi === null || targetMidi === undefined || nearest === targetMidi;
    const ok = pcOk && (level !== 'strict' || octaveOk);
    return { ok, nearest, cents, pcOk, octaveOk };
  }

  const api = { yin, spectrumPeaks, chromaFromPeaks, matchChord, matchHeld, matchNote, TOLERANCE };
  root.Detect = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
