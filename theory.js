/* Music theory helpers: note names, keys, chord symbols, Roman numerals.
   Plain script: attaches to window.Theory (and module.exports under Node). */
(function (root) {
  'use strict';

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const MINOR = [0, 2, 3, 5, 7, 8, 10];

  const mod = (n, m) => ((n % m) + m) % m;

  // ---- notes ---------------------------------------------------------
  function parseNoteName(name) {
    const m = /^([A-Ga-g])([#b]*)(-?\d)?$/.exec(String(name).trim());
    if (!m) throw new Error('Bad note name: ' + name);
    const letter = m[1].toUpperCase();
    let acc = 0;
    for (const ch of m[2]) acc += ch === '#' ? 1 : -1;
    const pc = mod(LETTER_PC[letter] + acc, 12);
    const octave = m[3] !== undefined ? parseInt(m[3], 10) : null;
    const midi = octave !== null ? (octave + 1) * 12 + LETTER_PC[letter] + acc : null;
    return { letter, acc, pc, octave, midi, name: letter + accStr(acc) };
  }
  function accStr(acc) {
    if (acc > 0) return '#'.repeat(acc);
    if (acc < 0) return 'b'.repeat(-acc);
    return '';
  }
  function prettyName(name) {
    return String(name).replace(/bb/g, '𝄫').replace(/b/g, '♭').replace(/#/g, '♯');
  }
  function midiToName(midi) {
    return SHARP_NAMES[mod(midi, 12)] + (Math.floor(midi / 12) - 1);
  }
  function freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Spell a note from a letter index (0..6, C..B) and a target pitch class.
  function spell(letterIdx, pc) {
    const letter = LETTERS[mod(letterIdx, 7)];
    let acc = mod(pc - LETTER_PC[letter], 12);
    if (acc > 6) acc -= 12;
    return { letter, acc, pc: mod(pc, 12), name: letter + accStr(acc) };
  }

  // ---- keys ----------------------------------------------------------
  // "C", "G", "Bb", "F#" are major keys; "Am", "C#m" are minor keys.
  function parseKey(key) {
    const m = /^([A-G][#b]?)(m|min|minor)?$/.exec(String(key).trim());
    if (!m) throw new Error('Bad key: ' + key);
    const tonic = parseNoteName(m[1]);
    const minor = !!m[2];
    const steps = minor ? MINOR : MAJOR;
    const tonicLetter = LETTERS.indexOf(tonic.letter);
    const scale = steps.map((st, i) => spell(tonicLetter + i, tonic.pc + st));
    return { name: tonic.name + (minor ? 'm' : ''), tonic, minor, scale, label: prettyName(tonic.name) + (minor ? ' minor' : ' major') };
  }

  // ---- chord qualities ---------------------------------------------
  // Each tone: [semitones above root, letter steps above root]
  const QUALITIES = {
    maj:   { tones: [[0, 0], [4, 2], [7, 4]], symbol: '', name: 'major triad' },
    min:   { tones: [[0, 0], [3, 2], [7, 4]], symbol: 'm', name: 'minor triad' },
    dim:   { tones: [[0, 0], [3, 2], [6, 4]], symbol: 'dim', name: 'diminished triad' },
    aug:   { tones: [[0, 0], [4, 2], [8, 4]], symbol: 'aug', name: 'augmented triad' },
    sus2:  { tones: [[0, 0], [2, 1], [7, 4]], symbol: 'sus2', name: 'suspended 2nd' },
    sus4:  { tones: [[0, 0], [5, 3], [7, 4]], symbol: 'sus4', name: 'suspended 4th' },
    dom7:  { tones: [[0, 0], [4, 2], [7, 4], [10, 6]], symbol: '7', name: 'dominant 7th' },
    maj7:  { tones: [[0, 0], [4, 2], [7, 4], [11, 6]], symbol: 'maj7', name: 'major 7th' },
    min7:  { tones: [[0, 0], [3, 2], [7, 4], [10, 6]], symbol: 'm7', name: 'minor 7th' },
    m7b5:  { tones: [[0, 0], [3, 2], [6, 4], [10, 6]], symbol: 'm7♭5', name: 'half-diminished 7th' },
    dim7:  { tones: [[0, 0], [3, 2], [6, 4], [9, 6]], symbol: 'dim7', name: 'diminished 7th' },
    '7sus4': { tones: [[0, 0], [5, 3], [7, 4], [10, 6]], symbol: '7sus4', name: 'dominant 7th sus4' },
    maj6:  { tones: [[0, 0], [4, 2], [7, 4], [9, 5]], symbol: '6', name: 'major 6th' },
    min6:  { tones: [[0, 0], [3, 2], [7, 4], [9, 5]], symbol: 'm6', name: 'minor 6th' },
    add9:  { tones: [[0, 0], [4, 2], [7, 4], [14, 1]], symbol: 'add9', name: 'major add 9' }
  };

  const SYMBOL_SUFFIX = [
    ['maj7', 'maj7'], ['M7', 'maj7'], ['m7b5', 'm7b5'], ['ø7', 'm7b5'], ['ø', 'm7b5'],
    ['dim7', 'dim7'], ['°7', 'dim7'], ['7sus4', '7sus4'], ['sus4', 'sus4'], ['sus2', 'sus2'], ['sus', 'sus4'],
    ['add9', 'add9'], ['m6', 'min6'], ['m7', 'min7'], ['min', 'min'], ['dim', 'dim'], ['°', 'dim'],
    ['aug', 'aug'], ['+', 'aug'], ['m', 'min'], ['7', 'dom7'], ['6', 'maj6'], ['', 'maj']
  ];

  function buildChord(rootSpelled, quality, opts) {
    opts = opts || {};
    const q = QUALITIES[quality];
    if (!q) throw new Error('Unknown chord quality: ' + quality);
    const rootLetter = LETTERS.indexOf(rootSpelled.letter);
    const notes = q.tones.map(([semi, steps]) => spell(rootLetter + steps, rootSpelled.pc + semi));
    let inversion = opts.inversion || 0;
    let bass = null;
    if (opts.bass) {
      bass = opts.bass;
      const idx = notes.findIndex(n => n.pc === bass.pc);
      if (idx > 0) inversion = idx;
    } else if (inversion > 0) {
      bass = notes[Math.min(inversion, notes.length - 1)];
    }
    const symbol = prettyName(rootSpelled.name) + q.symbol + (bass && bass.pc !== rootSpelled.pc ? '/' + prettyName(bass.name) : '');
    return {
      root: rootSpelled,
      quality,
      qualityName: q.name,
      notes,
      pcs: notes.map(n => n.pc),
      semis: q.tones.map(t => t[0]),
      inversion,
      bassPc: bass ? bass.pc : rootSpelled.pc,
      symbol
    };
  }

  // "C", "Am", "G7", "Fmaj7", "Bdim", "Gsus4", "C/E"
  function parseChordSymbol(sym) {
    const s = String(sym).trim();
    const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(s);
    if (!m) throw new Error('Bad chord symbol: ' + sym);
    const root = parseNoteName(m[1]);
    const suffix = m[2];
    const found = SYMBOL_SUFFIX.find(([suf]) => suf === suffix);
    if (!found) throw new Error('Unknown chord suffix "' + suffix + '" in ' + sym);
    const bass = m[3] ? parseNoteName(m[3]) : null;
    return buildChord(root, found[1], { bass });
  }

  // ---- Roman numerals ----------------------------------------------
  const ROMAN = ['VII', 'III', 'VI', 'IV', 'II', 'V', 'I']; // match longest first
  const ROMAN_DEG = { I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6 };

  // "I", "ii", "V7", "viio", "vii°", "iiø7", "IVmaj7", "bVII", "Vsus4", "iv"
  function parseRoman(roman, key, opts) {
    opts = opts || {};
    const k = typeof key === 'string' ? parseKey(key) : key;
    const m = /^([b#♭♯]?)([IViv]+)(.*)$/.exec(String(roman).trim());
    if (!m) throw new Error('Bad Roman numeral: ' + roman);
    const accidental = m[1] === 'b' || m[1] === '♭' ? -1 : m[1] === '#' || m[1] === '♯' ? 1 : 0;
    const numeral = m[2];
    const upper = numeral === numeral.toUpperCase();
    const deg = ROMAN_DEG[numeral.toUpperCase()];
    if (deg === undefined) throw new Error('Bad Roman numeral: ' + roman);
    let suffix = m[3];

    let quality;
    if (/^(o|°)7$/.test(suffix)) quality = 'dim7';
    else if (/^(ø|ø7|m7b5)$/.test(suffix)) quality = 'm7b5';
    else if (/^(o|°)$/.test(suffix)) quality = 'dim';
    else if (/^\+$/.test(suffix)) quality = 'aug';
    else if (suffix === 'maj7') quality = 'maj7';
    else if (suffix === '7') quality = upper ? 'dom7' : 'min7';
    else if (suffix === '6') quality = upper ? 'maj6' : 'min6';
    else if (suffix === 'sus4' || suffix === 'sus2' || suffix === '7sus4' || suffix === 'add9') quality = suffix;
    else if (suffix === '') quality = upper ? 'maj' : 'min';
    else throw new Error('Unknown Roman numeral suffix "' + suffix + '" in ' + roman);

    const degNote = k.scale[deg];
    const root = spell(LETTERS.indexOf(degNote.letter), degNote.pc + accidental);
    const chord = buildChord(root, quality, { inversion: opts.inversion || 0 });
    chord.roman = roman;
    chord.degree = deg + 1;
    chord.romanDisplay = romanDisplay(roman, chord.inversion, chord.semis.length);
    chord.defaultFunction = defaultFunction(roman, k);
    chord.key = k.name;
    return chord;
  }

  function romanDisplay(roman, inversion, size) {
    let r = String(roman).replace(/^b/, '♭').replace(/^#/, '♯').replace(/o(7?)$/, '°$1').replace('m7b5', 'ø7');
    if (!inversion) return r;
    const triad = size === 3;
    const figs = triad ? ['', '⁶', '⁶₄'] : ['', '⁶₅', '⁴₃', '⁴₂'];
    // 7th chords: drop the "7" and use figured bass
    if (!triad) r = r.replace(/(maj)?7$/, '$1').replace(/ø$/, 'ø');
    return r + (figs[inversion] || '');
  }

  // Harmonic function by scale degree (major-key defaults).
  function defaultFunction(roman, key) {
    const m = /^([b#♭♯]?)([IViv]+)/.exec(roman);
    if (!m) return null;
    if (m[1]) return 'color';
    const deg = ROMAN_DEG[m[2].toUpperCase()];
    const lower = m[2] === m[2].toLowerCase();
    if (key && key.minor) {
      return ['tonic', 'predominant', 'tonic', 'predominant', 'dominant', 'predominant', 'dominant'][deg];
    }
    if (deg === 3 && lower) return 'color'; // borrowed iv in major
    return ['tonic', 'predominant', 'tonic', 'predominant', 'dominant', 'tonic', 'dominant'][deg];
  }

  const FUNCTIONS = {
    tonic: { label: 'Tonic', short: 'T', blurb: 'Home. Stable, restful, sounds finished.' },
    predominant: { label: 'Subdominant', short: 'S', blurb: 'Moving away from home. Sets up the dominant.' },
    dominant: { label: 'Dominant', short: 'D', blurb: 'Tension. Wants to resolve back to the tonic.' },
    color: { label: 'Color', short: 'C', blurb: 'Borrowed or outside the key. Adds a surprising shade.' }
  };

  // Resolve a step's chord spec: { chord: "G7" } or { roman: "V7", key: "C", inversion: 1 }
  function resolveChord(spec, fallbackKey) {
    if (typeof spec === 'string') spec = /^[b#]?[IViv]/.test(spec) ? { roman: spec } : { chord: spec };
    if (spec.roman) {
      const c = parseRoman(spec.roman, spec.key || fallbackKey || 'C', { inversion: spec.inversion });
      c.function = spec.function || c.defaultFunction;
      return c;
    }
    const c = parseChordSymbol(spec.chord);
    if (spec.inversion) {
      const b = c.notes[Math.min(spec.inversion, c.notes.length - 1)];
      Object.assign(c, buildChord(c.root, c.quality, { bass: b }));
    }
    c.function = spec.function || null;
    if (spec.roman) c.roman = spec.roman;
    return c;
  }

  // ---- voicings ------------------------------------------------------
  // Close voicing in a comfortable right-hand range, honoring inversion.
  function voicing(chord, baseMidi) {
    baseMidi = baseMidi || 60;
    const rootMidi = baseMidi + chord.root.pc;
    let notes = chord.semis.map(s => rootMidi + (s > 12 ? s - 12 : s));
    notes.sort((a, b) => a - b);
    for (let i = 0; i < chord.inversion; i++) {
      notes.push(notes.shift() + 12);
    }
    while (notes[notes.length - 1] > 83) notes = notes.map(n => n - 12);
    return notes;
  }

  // Voice-led voicings for playback: each chord picks the inversion closest to the previous.
  function voiceLead(chords) {
    const out = [];
    let prev = null;
    for (const c of chords) {
      const pcs = c.semis.map(s => mod(c.root.pc + s, 12));
      let best = null, bestCost = Infinity;
      for (let base = 52; base <= 72; base++) {
        // candidate: all chord tones placed at or above base within an octave
        const notes = pcs.map(pc => base + mod(pc - base, 12)).sort((a, b) => a - b);
        const center = notes.reduce((a, b) => a + b, 0) / notes.length;
        let cost;
        if (!prev) cost = Math.abs(center - 64) + (notes[0] % 12 === c.root.pc ? 0 : 3);
        else {
          cost = 0;
          for (const n of notes) cost += Math.min(...prev.map(p => Math.abs(p - n)));
          cost += Math.abs(center - 64) * 0.15;
        }
        if (cost < bestCost) { bestCost = cost; best = notes; }
      }
      const bass = 36 + mod(c.bassPc - 0, 12) + (mod(c.bassPc, 12) < 4 ? 12 : 0);
      out.push({ upper: best, bass });
      prev = best;
    }
    return out;
  }

  const api = {
    LETTERS, SHARP_NAMES, FUNCTIONS, QUALITIES,
    mod, parseNoteName, prettyName, midiToName, freqToMidi, midiToFreq,
    parseKey, parseChordSymbol, parseRoman, resolveChord, voicing, voiceLead, romanDisplay
  };
  root.Theory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
