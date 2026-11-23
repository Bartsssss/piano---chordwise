# Course format

Courses are JSON files in `courses/`. To add one, drop a new file there and add its name to
`courses/index.json`. No code changes needed. Run `node tools/validate-course.js courses/*.json`
to catch typos in chord names.

```json
{
  "id": "chord-progressions",
  "title": "Chord Progressions",
  "subtitle": "One line under the title",
  "description": "Shown on the home screen",
  "defaultKey": "C",
  "lessons": [
    { "id": "tonic", "part": "Section heading", "title": "I: the home chord",
      "summary": "One line", "key": "C", "steps": [ ... ] }
  ]
}
```

## Chords

Anywhere a chord is expected you can write either:

- a **Roman numeral** (uses the step's or lesson's `key`): `I`, `ii`, `V7`, `Imaj7`, `ii7`, `viio`,
  `iiø7`, `Vsus4`, `bVII`, `iv`, `V6` (added sixth). Uppercase = major, lowercase = minor,
  `o`/`°` = diminished, `+` = augmented.
- a **chord symbol**: `C`, `Am`, `G7`, `Fmaj7`, `Bdim`, `Gsus4`, `Csus2`, `Dm7`, `C/E`.
- an **object** for extras: `{ "roman": "V", "inversion": 1, "checkBass": true, "function": "dominant" }`.

Keys: `"C"`, `"G"`, `"Bb"` (major) or `"Am"`, `"F#m"` (minor).
Functions: `tonic`, `predominant` (shown as Subdominant), `dominant`, `color`. Roman numerals get a
sensible default; chord symbols have none unless you set `function`.

## Step types

| type | fields |
| --- | --- |
| `text` | `title`, `body` (blank line = new paragraph, `**bold**`), optional `examples`: `[{ "label", "progression": [...] or "chords": [...], "key" }]` |
| `play-note` | `prompt`, `note` (e.g. `"G4"`; octave only checked in Strict), `explain` (shown on success) |
| `play-chord` | `prompt`, `roman` or `chord`, optional `key`, `inversion`, `checkBass`, `function`, `explain` |
| `play-progression` | `prompt`, `progression: [...]`, optional `key`, `explain` |
| `quiz` | `question`, `options: [...]`, `answer` (index from 0), `explain` |
| `listen` | like `quiz`, plus `play: [...]` (one Play button) or `playOptions: [[...], [...]]` (one button per sequence) |
