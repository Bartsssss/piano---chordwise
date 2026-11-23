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
| `play-notes` | `prompt`, `notes: [...]` played one after another (e.g. `"C4"`, or `["C4", "C3"]` for two hands together), optional `hand` (`rh`, `lh`, `both`), `fingers`, `fingersLH` (one number per note), `reps` (rounds the app counts), `practice` (practice goal text), `hidden: true` (play-it-back by ear: notes stay hidden, the app says higher/lower), `hearSpeed` (seconds per note for Hear it), `explain` |
| `play-progression` | `prompt`, `progression: [...]`, optional `key`, `explain` |
| `quiz` | `question`, `options: [...]`, `answer` (index from 0), `explain` |
| `listen` | like `quiz`, plus `play: [...]` (one Play button) or `playOptions: [[...], [...]]` (one button per sequence). For melodies use `melody: ["C4", ...]` or `melodyOptions: [[...], [...]]` |

Notes in `play-notes` need an octave (`C4` = middle C). Same note name in both hands counts as one note for
the microphone; two different names are checked together (keep that for mirror/contrary motion).
