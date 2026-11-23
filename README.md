# Chordwise

A phone-friendly web app (PWA) for learning piano chord progressions. It listens through the
microphone and checks whether you played the right note or chord. No app store, no build step.

## Run it

- **On your computer:** `python3 -m http.server 8000` in this folder, then open http://localhost:8000
- **On your phone:** the microphone only works on `https://` addresses, so host the folder:
  - GitHub Pages: push this folder to a repo, then Settings → Pages → deploy from the main branch.
  - Or Netlify Drop: drag this folder onto https://app.netlify.com/drop.
  Then open the link on your phone and use "Add to Home Screen" to install it.

## How listening works

- **Single notes:** YIN pitch detection on the raw microphone signal (`detect.js`).
- **Chords:** an FFT spectrum is reduced to 12 pitch-class "chroma" values (peaks only, high
  harmonics de-weighted). Expected chord tones must be present and few strong notes outside the
  chord may sound. The lowest strong peak gives the bass note for inversion exercises.
- **Strictness:** Forgiving / Normal / Strict on the course page. Forgiving lets you leave out the
  fifth and ignores which note is lowest.
- Detection is paused while the app plays an example, so it does not grade itself.
- Other inputs: **Tap keys** (on-screen keyboard) and **MIDI** (USB keyboard, Chrome/Edge).

## Files

| File | What it does |
| --- | --- |
| `index.html`, `styles.css` | App shell and styling |
| `theory.js` | Note names, keys, chord symbols, Roman numerals, voicings |
| `detect.js` | Pure detection functions (pitch, chroma, matching), testable in Node |
| `audio.js` | Microphone listener, Web MIDI, small synth for "Hear it" |
| `app.js` | Course list, lesson player, practice checking |
| `courses/` | Course content as JSON. See `COURSE_FORMAT.md` |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable PWA + offline cache |
| `tools/` | `validate-course.js`, `test-detect.js`, `build-artifact.js` |

## Checks

```
node tools/validate-course.js courses/*.json   # every chord and numeral parses
node tools/test-detect.js                      # synthetic piano tones through the detector
node tools/build-artifact.js                   # single-file preview in dist/
```

When you change app files, bump `VERSION` in `sw.js` so installed phones pick up the update.
