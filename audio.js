/* Browser audio: microphone listener, Web MIDI input, and a small piano-ish synth.
   Attaches to window.Audio2 (avoids clashing with the built-in Audio constructor). */
(function (root) {
  'use strict';
  const D = root.Detect;

  let sharedCtx = null;
  function ctx() {
    if (!sharedCtx) {
      const C = root.AudioContext || root.webkitAudioContext;
      sharedCtx = new C({ latencyHint: 'interactive' });
    }
    if (sharedCtx.state === 'suspended') sharedCtx.resume();
    return sharedCtx;
  }

  // ---- Synth ---------------------------------------------------------
  const Synth = {
    busyUntil: 0,
    playNotes(midis, { when = 0, dur = 1.2, vel = 0.22 } = {}) {
      const ac = ctx();
      const t0 = ac.currentTime + 0.03 + when;
      const out = ac.createGain();
      out.gain.value = 1;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4200, t0);
      lp.frequency.exponentialRampToValueAtTime(1400, t0 + dur);
      out.connect(lp).connect(ac.destination);
      const per = vel / Math.max(1, Math.sqrt(midis.length));
      for (const m of midis) {
        const f = 440 * Math.pow(2, (m - 69) / 12);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(per, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(per * 0.35, t0 + 0.35);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        g.connect(out);
        [['triangle', 1, 1], ['sine', 2, 0.35], ['sine', 3, 0.12]].forEach(([type, mult, amp]) => {
          const o = ac.createOscillator();
          const og = ac.createGain();
          o.type = type;
          o.frequency.value = f * mult;
          og.gain.value = amp;
          o.connect(og).connect(g);
          o.start(t0);
          o.stop(t0 + dur + 0.05);
        });
      }
      const endMs = performance.now() + (when + dur) * 1000 + 250;
      this.busyUntil = Math.max(this.busyUntil, endMs);
    },
    // sequence: [{ notes: [midi], dur }]
    playSequence(seq, gap = 0) {
      let t = 0;
      for (const item of seq) {
        this.playNotes(item.notes, { when: t, dur: item.dur || 1.1 });
        t += (item.dur || 1.1) + gap;
      }
      return t;
    }
  };

  // ---- Microphone listener ------------------------------------------
  class Listener {
    constructor(onFrame) {
      this.onFrame = onFrame;
      this.running = false;
      this.noise = 0.003;
      this.prevRms = [];
    }
    async start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw Object.assign(new Error('This browser does not give web pages microphone access.'), { code: 'unsupported' });
      }
      const ac = ctx();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      this.source = ac.createMediaStreamSource(this.stream);
      this.analyser = ac.createAnalyser();
      this.analyser.fftSize = 8192;
      this.analyser.smoothingTimeConstant = 0;
      this.source.connect(this.analyser);
      this.time = new Float32Array(this.analyser.fftSize);
      this.freq = new Float32Array(this.analyser.frequencyBinCount);
      this.running = true;
      this.startedAt = performance.now();
      this.loop();
    }
    stop() {
      this.running = false;
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this.source) this.source.disconnect();
      this.stream = null;
    }
    loop() {
      if (!this.running) return;
      this.tick();
      setTimeout(() => this.loop(), 40);
    }
    tick() {
      const ac = ctx();
      const sr = ac.sampleRate;
      this.analyser.getFloatTimeDomainData(this.time);
      const n = this.time.length;
      const recent = this.time.subarray(n - 2048);
      let sum = 0;
      for (let i = 0; i < recent.length; i++) sum += recent[i] * recent[i];
      const rms = Math.sqrt(sum / recent.length);

      // background noise estimate: learn quickly at first, then only from quiet frames
      const warm = performance.now() - this.startedAt < 800;
      if (warm) this.noise = Math.max(0.0015, 0.8 * this.noise + 0.2 * rms);
      else if (rms < this.noise * 1.6) this.noise = 0.97 * this.noise + 0.03 * rms;
      const gateLevel = Math.max(0.006, this.noise * 3);
      const sounding = !warm && rms > gateLevel;

      const avgPrev = this.prevRms.length ? this.prevRms.reduce((a, b) => a + b, 0) / this.prevRms.length : rms;
      const onset = sounding && rms > avgPrev * 1.5 && rms - avgPrev > gateLevel * 0.5;
      this.prevRms.push(rms);
      if (this.prevRms.length > 4) this.prevRms.shift();

      const muted = performance.now() < Synth.busyUntil;
      let pitch = null, chroma = null, bassPc = null;
      if (sounding && !muted) {
        const p = D.yin(this.time.subarray(n - 3072), sr, { minFreq: 60, maxFreq: 2100, threshold: 0.18 });
        if (p && p.clarity > 0.75) pitch = { freq: p.freq, midiF: 69 + 12 * Math.log2(p.freq / 440), clarity: p.clarity };
        this.analyser.getFloatFrequencyData(this.freq);
        const peaks = D.spectrumPeaks(this.freq, sr, this.analyser.fftSize, { minFreq: 60, maxFreq: 2500, rangeDb: 32 });
        const c = D.chromaFromPeaks(peaks);
        chroma = c.chroma;
        bassPc = c.bassPc;
      }
      this.onFrame({ rms, level: Math.min(1, rms / Math.max(gateLevel * 6, 0.05)), sounding: sounding && !muted, onset: onset && !muted, pitch, chroma, bassPc, warm, muted });
    }
  }

  // ---- Web MIDI ------------------------------------------------------
  const Midi = {
    held: new Set(),
    async connect(onChange) {
      if (!navigator.requestMIDIAccess) throw Object.assign(new Error('This browser does not support MIDI keyboards.'), { code: 'unsupported' });
      const access = await navigator.requestMIDIAccess();
      const bind = () => {
        let count = 0;
        access.inputs.forEach(input => {
          count++;
          input.onmidimessage = (e) => {
            const [st, note, vel] = e.data;
            const cmd = st & 0xf0;
            if (cmd === 0x90 && vel > 0) { this.held.add(note); onChange([...this.held], { on: note }); }
            else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) { this.held.delete(note); onChange([...this.held], { off: note }); }
          };
        });
        return count;
      };
      access.onstatechange = () => bind();
      return bind();
    }
  };

  root.Audio2 = { ctx, Synth, Listener, Midi };
})(window);
