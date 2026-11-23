// Validates every course JSON: parses each chord/numeral so typos fail fast.
// Usage: node tools/validate-course.js courses/*.json
const fs = require('fs');
const T = require('../theory.js');
let errors = 0;
for (const file of process.argv.slice(2)) {
  if (file.endsWith('index.json')) continue;
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const L of c.lessons) {
    const key = L.key || c.defaultKey || 'C';
    const show = (spec, k) => { const ch = T.resolveChord(spec, k); return (ch.romanDisplay || '') + '=' + ch.symbol + '[' + ch.notes.map(n => n.name).join(' ') + ']' + (ch.function ? ':' + ch.function : ''); };
    for (const s of L.steps) {
      const k = s.key || key;
      try {
        const out = [];
        if (s.type === 'play-chord') out.push(show(s, k));
        if (s.type === 'play-note') T.parseNoteName(s.note);
        if (s.progression) s.progression.forEach(p => out.push(show(p, k)));
        if (s.play) s.play.forEach(p => out.push(show(p, k)));
        if (s.playOptions) s.playOptions.forEach(seq => seq.forEach(p => out.push(show(p, k))));
        (s.examples || []).forEach(ex => (ex.progression || ex.chords || []).forEach(p => out.push(show(p, ex.key || k))));
        if (s.type === 'quiz' || s.type === 'listen') if (!(s.answer >= 0 && s.answer < s.options.length)) throw new Error('answer out of range');
        if (process.env.VERBOSE) console.log(L.id, s.type, out.join('  '));
      } catch (e) { errors++; console.error(file, L.id, s.type, e.message); }
    }
  }
  console.log(file + ': ' + c.lessons.length + ' lessons checked');
}
process.exit(errors ? 1 : 0);
