/* Chordwise UI: course list, lesson player, practice checking. Depends on Theory, Detect, Audio2. */
(function () {
  'use strict';
  const T = window.Theory, D = window.Detect, A = window.Audio2;
  const $app = document.getElementById('app');
  const PC_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const HOLD_MS = 220;

  // ---------- storage (best effort) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('chordwise:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('chordwise:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  const S = {
    courses: [],
    view: 'home',
    course: null,
    lessonIdx: 0,
    stepIdx: 0,
    input: store.get('input', 'mic'),
    tol: store.get('tol', 'normal'),
    showKeys: store.get('showKeys', true),
    progress: store.get('progress', {}),
    micState: 'off', // off | starting | on | error
    micError: '',
    midiState: 'off',
    finished: false
  };
  let listener = null;
  let P = null; // practice runtime for the current step

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function md(text) {
    return String(text || '').split(/\n\n+/).map(p =>
      '<p>' + esc(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') + '</p>').join('');
  }
  const pretty = s => T.prettyName(s);
  const fnLabel = f => (T.FUNCTIONS[f] ? T.FUNCTIONS[f].label : '');
  const lesson = () => S.course.lessons[S.lessonIdx];
  const step = () => lesson().steps[S.stepIdx];
  const lessonKey = () => step().key || lesson().key || S.course.defaultKey || 'C';
  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
  };

  function chordChip(c, extra) {
    const f = c.function || 'none';
    return '<span class="chip ' + f + ' ' + (extra || '') + '">' +
      '<b>' + esc(c.romanDisplay || c.symbol) + '</b>' +
      (c.romanDisplay ? '<small>' + esc(c.symbol) + '</small>' : (c.function ? '<small>' + esc(fnLabel(c.function)) + '</small>' : '')) +
      '</span>';
  }
  const resolveList = (list, key) => (list || []).map(x => T.resolveChord(x, key));

  function playChords(chords, onEach) {
    const vl = T.voiceLead(chords);
    const dur = 1.05;
    A.Synth.playSequence(vl.map(v => ({ notes: [v.bass, ...v.upper], dur })));
    if (onEach) chords.forEach((c, i) => setTimeout(() => onEach(i), i * dur * 1000));
    if (onEach) setTimeout(() => onEach(-1), chords.length * dur * 1000);
  }

  // ---------- loading ----------
  async function loadCourses() {
    if (window.__COURSES__) return window.__COURSES__;
    const idx = await fetch('courses/index.json').then(r => r.json());
    return Promise.all(idx.courses.map(f => fetch('courses/' + f).then(r => r.json())));
  }

  // ---------- views ----------
  function render() {
    if (S.view === 'home') renderHome();
    else if (S.view === 'course') renderCourse();
    else renderLesson();
  }

  function doneCount(course) {
    const p = S.progress[course.id] || {};
    return course.lessons.filter(l => p[l.id]).length;
  }

  function renderHome() {
    $app.innerHTML =
      '<header class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="brand-name">Chordwise</span></header>' +
      '<section class="hero"><h1>Hear why chords move the way they do.</h1>' +
      '<p>Short lessons on chord progressions. Read a little, hear it, then play it on your piano while the app listens through your microphone.</p>' +
      '<div class="fn-legend"><span class="fn-tag tonic">Tonic · home</span><span class="fn-tag predominant">Subdominant · away</span><span class="fn-tag dominant">Dominant · tension</span></div></section>' +
      '<div class="stack">' + S.courses.map((c, i) => {
        const done = doneCount(c), total = c.lessons.length;
        return '<button class="course-card" data-course="' + i + '">' +
          '<span class="eyebrow">Course · ' + total + ' lessons</span>' +
          '<h2>' + esc(c.title) + '</h2><p class="muted">' + esc(c.description) + '</p>' +
          '<span class="progress-track"><span style="width:' + Math.round(100 * done / total) + '%"></span></span>' +
          '<span class="muted" style="font-size:.85rem">' + (done ? done + ' of ' + total + ' done' : 'Not started') + '</span></button>';
      }).join('') + '</div>' +
      '<section class="backup step-card"><h3>Your progress</h3>' +
      '<p class="muted" style="font-size:.88rem">Progress is saved on this device only. Save it to a file to keep a backup or move it to another phone or computer, then load that file there.</p>' +
      '<div class="row"><button class="btn small" data-export>Save progress file</button>' +
      '<button class="btn small" data-import>Load progress file</button>' +
      '<input type="file" accept=".json,application/json" data-import-file hidden></div>' +
      '<p class="backup-msg muted" data-backup-msg aria-live="polite"></p></section>' +
      '<p class="footer-note">Works best with a real piano or keyboard nearby. No piano? Switch to Tap keys in any lesson.</p>';
    $app.querySelectorAll('[data-course]').forEach(b => b.onclick = () => { S.course = S.courses[+b.dataset.course]; S.view = 'course'; render(); window.scrollTo(0, 0); });
    bindBackup();
  }

  // ---------- progress export / import ----------
  const BACKUP_KEYS = ['progress', 'input', 'tol', 'showKeys'];
  function bindBackup() {
    const msg = $app.querySelector('[data-backup-msg]');
    const file = $app.querySelector('[data-import-file]');
    $app.querySelector('[data-export]').onclick = () => {
      const data = { app: 'chordwise', version: 1, exported: new Date().toISOString(), data: {} };
      BACKUP_KEYS.forEach(k => { const v = store.get(k, undefined); if (v !== undefined) data.data[k] = v; });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'chordwise-progress-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      msg.textContent = 'Progress file saved.';
    };
    $app.querySelector('[data-import]').onclick = () => file.click();
    file.onchange = () => {
      const f = file.files && file.files[0];
      if (!f) return;
      f.text().then(txt => {
        const obj = JSON.parse(txt);
        if (!obj || obj.app !== 'chordwise' || typeof obj.data !== 'object' || typeof (obj.data.progress || {}) !== 'object') throw new Error('bad');
        if (!confirm('Replace the progress on this device with the progress from this file?')) return;
        BACKUP_KEYS.forEach(k => { if (k in obj.data) store.set(k, obj.data[k]); });
        S.progress = store.get('progress', {}); S.input = store.get('input', 'mic');
        S.tol = store.get('tol', 'normal'); S.showKeys = store.get('showKeys', true);
        render();
        const m = $app.querySelector('[data-backup-msg]'); if (m) m.textContent = 'Progress loaded.';
      }).catch(() => { msg.textContent = 'That file is not a Chordwise progress file.'; file.value = ''; });
    };
  }

  function renderCourse() {
    const c = S.course;
    const p = S.progress[c.id] || {};
    let html = '<div class="topbar"><button class="icon-btn" data-back aria-label="All courses">' + ICON.back + '</button>' +
      '<div class="title"><span class="eyebrow">Course</span><h2>' + esc(c.title) + '</h2></div></div>' +
      '<p class="muted" style="margin-bottom:16px">' + esc(c.subtitle || '') + '</p>' +
      '<div class="settings step-card" style="margin-bottom:20px"><div class="row" style="justify-content:space-between"><div><h3>Listening strictness</h3><p class="muted" style="font-size:.88rem">Forgiving accepts a missing fifth and ignores which note is lowest.</p></div>' +
      '<div class="seg" role="group" aria-label="Listening strictness">' + ['forgiving', 'normal', 'strict'].map(t => '<button data-tol="' + t + '" class="' + (S.tol === t ? 'on' : '') + '">' + t[0].toUpperCase() + t.slice(1) + '</button>').join('') + '</div></div></div>';
    let lastPart = null;
    html += '<div class="stack">';
    c.lessons.forEach((l, i) => {
      if (l.part !== lastPart) {
        if (lastPart !== null) html += '</ol>';
        html += '<h3 class="part-title eyebrow">' + esc(l.part || '') + '</h3><ol class="lesson-list">';
        lastPart = l.part;
      }
      html += '<li><button class="lesson-item ' + (p[l.id] ? 'done' : '') + '" data-lesson="' + i + '">' +
        '<span class="lesson-num">' + (p[l.id] ? '✓' : i + 1) + '</span>' +
        '<span class="lesson-text"><h3>' + esc(l.title) + '</h3><p>' + esc(l.summary || '') + '</p></span><span class="muted">›</span></button></li>';
    });
    html += '</ol></div>';
    $app.innerHTML = html;
    $app.querySelector('[data-back]').onclick = () => { S.view = 'home'; render(); };
    $app.querySelectorAll('[data-tol]').forEach(b => b.onclick = () => { S.tol = b.dataset.tol; store.set('tol', S.tol); render(); });
    $app.querySelectorAll('[data-lesson]').forEach(b => b.onclick = () => openLesson(+b.dataset.lesson));
  }

  function openLesson(i) {
    S.lessonIdx = i; S.stepIdx = 0; S.view = 'lesson'; S.finished = false;
    render(); window.scrollTo(0, 0);
  }

  function leaveLesson() {
    S.view = 'course';
    P = null;
    if (listener) { listener.stop(); listener = null; S.micState = 'off'; }
    render();
  }

  function renderLesson() {
    const l = lesson();
    const head = '<div class="lesson-head"><div class="topbar" style="padding:0"><button class="icon-btn" data-back aria-label="Back to lessons">' + ICON.back + '</button>' +
      '<div class="title"><span class="eyebrow">Lesson ' + (S.lessonIdx + 1) + ' · ' + esc(l.part || '') + '</span><h3>' + esc(l.title) + '</h3></div></div>' +
      '<div class="step-dots">' + l.steps.map((_, i) => '<span class="' + (i <= S.stepIdx || S.finished ? 'on' : '') + '"></span>').join('') + '</div></div>';
    if (S.finished) {
      const next = S.course.lessons[S.lessonIdx + 1];
      $app.innerHTML = head + '<div class="step-card"><span class="eyebrow">Lesson complete</span><h2>Nice work.</h2><p>' + esc(l.summary || '') + '</p>' +
        (next ? '<p class="muted">Up next: <strong>' + esc(next.title) + '</strong></p>' : '<p class="muted">That was the last lesson in this course.</p>') +
        '<div class="step-nav"><button class="btn" data-list>All lessons</button>' + (next ? '<button class="btn primary" data-next-lesson>Next lesson</button>' : '') + '</div></div>';
      $app.querySelector('[data-back]').onclick = leaveLesson;
      $app.querySelector('[data-list]').onclick = leaveLesson;
      const nb = $app.querySelector('[data-next-lesson]');
      if (nb) nb.onclick = () => openLesson(S.lessonIdx + 1);
      return;
    }
    const s = step();
    const body = renderStep(s);
    const last = S.stepIdx === l.steps.length - 1;
    $app.innerHTML = head + '<div class="stack">' + body +
      '<div class="step-nav"><button class="btn" data-prev ' + (S.stepIdx === 0 ? 'disabled' : '') + '>Back</button>' +
      '<button class="btn primary" data-next>' + (last ? 'Finish lesson' : (isPractice(s) && !(P && P.done) ? 'Skip' : 'Next')) + '</button></div></div>';
    $app.querySelector('[data-back]').onclick = leaveLesson;
    $app.querySelector('[data-prev]').onclick = () => { if (S.stepIdx > 0) { S.stepIdx--; render(); } };
    $app.querySelector('[data-next]').onclick = () => {
      if (last) {
        S.progress[S.course.id] = S.progress[S.course.id] || {};
        S.progress[S.course.id][l.id] = true;
        store.set('progress', S.progress);
        S.finished = true; P = null; render();
      } else { S.stepIdx++; render(); }
      window.scrollTo(0, 0);
    };
    bindStep(s);
  }

  const isPractice = s => s.type === 'play-note' || s.type === 'play-chord' || s.type === 'play-progression';

  // ---------- steps ----------
  function renderExamples(examples, key) {
    if (!examples || !examples.length) return '';
    return '<div class="examples">' + examples.map((ex, i) => {
      const chords = resolveList(ex.progression || ex.chords, ex.key || key);
      return '<div class="example" data-example="' + i + '"><button class="icon-btn" aria-label="Play ' + esc(ex.label || '') + '">' + ICON.play + '</button>' +
        '<div class="chips">' + chords.map(c => chordChip(c)).join('') + '</div></div>' +
        (ex.label ? '' : '');
    }).join('') + '</div>' + '<p class="example-label">Tap ▶ to hear an example.</p>';
  }

  function renderStep(s) {
    const key = lessonKey();
    if (s.type === 'text') {
      return '<div class="step-card"><h2>' + esc(s.title || '') + '</h2><div class="prose">' + md(s.body) + '</div>' + renderExamples(s.examples, key) + '</div>';
    }
    if (s.type === 'quiz' || s.type === 'listen') {
      let listenHtml = '';
      if (s.type === 'listen') {
        if (s.playOptions) listenHtml = '<div class="row">' + s.playOptions.map((_, i) => '<button class="btn" data-play-opt="' + i + '">' + ICON.play + ' Play ' + (i + 1) + '</button>').join('') + '</div>';
        else listenHtml = '<div class="row"><button class="btn" data-play-listen>' + ICON.play + ' Play</button></div>';
      }
      return '<div class="step-card"><span class="eyebrow">' + (s.type === 'listen' ? 'Ear training' : 'Quick check') + '</span><h2>' + esc(s.question) + '</h2>' + listenHtml +
        '<div class="options">' + s.options.map((o, i) => '<button class="option" data-opt="' + i + '">' + esc(o) + '</button>').join('') + '</div>' +
        '<div data-explain></div></div>';
    }
    // practice steps
    setupPractice(s, key);
    let targetHtml = '';
    if (s.type === 'play-note') {
      const n = T.parseNoteName(s.note);
      targetHtml = '<div class="target"><span class="target-big">' + esc(pretty(n.name)) + '</span><span class="target-notes">any octave</span></div>';
    } else if (s.type === 'play-chord') {
      const c = P.seq[0].chord;
      targetHtml = '<div class="target"><span class="target-big">' + esc(c.symbol) + '</span>' + (c.romanDisplay ? '<span class="target-roman">' + esc(c.romanDisplay) + ' in ' + esc(T.parseKey(key).label) + '</span>' : '') + '</div>' +
        '<div class="row">' + (c.function ? '<span class="fn-tag ' + c.function + '">' + esc(fnLabel(c.function)) + '</span><span class="muted" style="font-size:.9rem">' + esc(T.FUNCTIONS[c.function].blurb) + '</span>' : '') + '</div>' +
        '<p class="target-notes">Notes: ' + c.notes.map(n => esc(pretty(n.name))).join(' · ') + (s.checkBass ? ' · lowest note ' + esc(pretty(c.notes.find(n => n.pc === c.bassPc).name)) : '') + '</p>';
    } else {
      targetHtml = '<div class="row"><span class="muted">Key of ' + esc(T.parseKey(key).label) + '</span></div><div class="chips" data-seq>' +
        P.seq.map((t, i) => chordChip(t.chord, i === 0 ? 'current' : '')).join('') + '</div>' +
        '<p class="target-notes" data-seq-notes></p>';
    }
    return '<div class="step-card"><span class="eyebrow">Your turn</span><h2>' + esc(s.prompt || '') + '</h2>' + targetHtml +
      (s.type !== 'play-note' ? '<div class="row"><button class="btn small" data-hear>' + ICON.play + ' Hear it</button></div>' : '') +
      '<div class="feedback" data-feedback></div><div data-success></div>' +
      renderPracticePanel(s) + '</div>';
  }

  function renderPracticePanel(s) {
    const tabs = [['mic', 'Microphone'], ['keys', 'Tap keys'], ['midi', 'MIDI']];
    let html = '<div class="practice"><div class="input-tabs" role="tablist">' + tabs.map(([k, label]) => '<button role="tab" data-input="' + k + '" class="' + (S.input === k ? 'on' : '') + '">' + label + '</button>').join('') + '</div>';
    if (S.input === 'mic') {
      if (S.micState === 'on') {
        html += '<div class="listen-row">' + ICON.mic + '<div class="meter"><span data-meter></span></div><button class="btn small ghost" data-mic-stop>Stop</button></div>' +
          '<div class="chroma" data-chroma>' + PC_NAMES.map((n, i) => '<div><i data-c="' + i + '"></i><span data-cl="' + i + '">' + n + '</span></div>').join('') + '</div>' +
          '<p class="status-line" data-status>Listening. Play when you\'re ready.</p>';
      } else {
        html += '<div class="row"><button class="btn primary" data-mic-start>' + ICON.mic + (S.micState === 'starting' ? ' Starting…' : ' Start listening') + '</button></div>' +
          (S.micState === 'error' ? '<p class="notice">' + esc(S.micError) + '</p>' : '<p class="status-line">Put your phone on the music stand, then tap Start. Your audio stays on this device.</p>');
      }
    } else if (S.input === 'midi') {
      html += S.midiState === 'on' ? '<p class="status-line">MIDI keyboard connected. Play when you\'re ready.</p>' :
        '<div class="row"><button class="btn primary" data-midi-start>Connect MIDI keyboard</button></div>' +
        (S.midiState === 'error' ? '<p class="notice">' + esc(S.midiError) + '</p>' : '<p class="status-line">Plug a USB MIDI keyboard into your phone or computer. Works in Chrome and Edge.</p>');
    } else {
      html += '<p class="status-line">' + (s.type === 'play-note' ? 'Tap the key.' : 'Tap each note of the chord. Tap again to release it.') + '</p>';
    }
    html += '<div class="keyboard-wrap"><div class="keyboard" data-keyboard></div></div>' +
      '<div class="row" style="justify-content:space-between"><label class="row" style="font-size:.88rem;gap:6px"><input type="checkbox" id="show-keys" ' + (S.showKeys ? 'checked' : '') + '> Show me the keys</label>' +
      (S.input === 'keys' && s.type !== 'play-note' ? '<button class="btn small ghost" data-clear>Clear</button>' : '') + '</div></div>';
    return html;
  }

  // ---------- practice runtime ----------
  function setupPractice(s, key) {
    if (P && P.stepRef === s) return;
    let seq;
    if (s.type === 'play-note') {
      const n = T.parseNoteName(s.note);
      seq = [{ kind: 'note', pc: n.pc, midi: n.midi, name: n.name }];
    } else if (s.type === 'play-chord') {
      const c = T.resolveChord(s, key);
      seq = [{ kind: 'chord', chord: c, pcs: c.pcs, bassPc: c.bassPc, checkBass: !!s.checkBass }];
    } else {
      seq = s.progression.map(item => {
        const c = T.resolveChord(item, key);
        return { kind: 'chord', chord: c, pcs: c.pcs, bassPc: c.bassPc, checkBass: !!(item && item.checkBass) };
      });
    }
    P = { stepRef: s, seq, idx: 0, done: false, armed: false, okSince: null, tryingSince: null, held: new Set(), lastHint: 0 };
  }
  const current = () => P && !P.done ? P.seq[P.idx] : null;

  function targetMidis(t) {
    if (!t) return [];
    if (t.kind === 'note') return [60 + t.pc];
    return T.voicing(t.chord, 60);
  }

  function renderKeyboard() {
    const kb = $app.querySelector('[data-keyboard]');
    if (!kb) return;
    const lo = 60, hi = 83;
    const whites = [];
    for (let m = lo; m <= hi; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
    const w = 100 / whites.length;
    let html = '';
    whites.forEach((m, i) => {
      html += '<button class="key white" data-midi="' + m + '" style="left:' + (i * w) + '%;width:' + w + '%" aria-label="' + T.midiToName(m) + '"><span class="lbl"></span></button>';
    });
    for (let m = lo; m <= hi; m++) {
      if (![1, 3, 6, 8, 10].includes(m % 12)) continue;
      const wi = whites.indexOf(m - 1);
      html += '<button class="key black" data-midi="' + m + '" style="left:' + ((wi + 1) * w - w * 0.3) + '%;width:' + (w * 0.6) + '%" aria-label="' + T.midiToName(m) + '"><span class="lbl"></span></button>';
    }
    kb.innerHTML = html;
    kb.querySelectorAll('.key').forEach(k => {
      k.addEventListener('pointerdown', e => { e.preventDefault(); onKeyTap(+k.dataset.midi); });
    });
    paintKeyboard();
  }

  function paintKeyboard(downSet) {
    const kb = $app.querySelector('[data-keyboard]');
    if (!kb) return;
    const t = current() || (P && P.done ? P.seq[P.seq.length - 1] : null);
    const hint = new Set(S.showKeys ? targetMidis(t) : []);
    const names = {};
    if (t && t.kind === 'chord') t.chord.notes.forEach(n => { names[n.pc] = pretty(n.name); });
    else if (t) names[t.pc] = pretty(t.name);
    const down = downSet || (S.input === 'keys' && P ? P.held : S.input === 'midi' ? A.Midi.held : new Set());
    kb.querySelectorAll('.key').forEach(k => {
      const m = +k.dataset.midi;
      const isHint = hint.has(m);
      k.classList.toggle('hint', isHint);
      const isDown = down.has(m) || (S.input !== 'keys' && [...down].some(d => (d < 60 || d > 83) && d % 12 === m % 12));
      k.classList.toggle('down', isDown);
      const lbl = k.querySelector('.lbl');
      lbl.textContent = isHint ? names[m % 12] || '' : (m % 12 === 0 ? 'C' + (Math.floor(m / 12) - 1) : '');
    });
  }

  function updateSeqUi() {
    const seqEl = $app.querySelector('[data-seq]');
    if (seqEl) {
      [...seqEl.children].forEach((chip, i) => {
        chip.classList.toggle('current', !P.done && i === P.idx);
        chip.classList.toggle('passed', i < P.idx || P.done);
      });
      const notesEl = $app.querySelector('[data-seq-notes]');
      const t = current();
      if (notesEl) notesEl.textContent = t ? 'Now: ' + t.chord.symbol + ' (' + t.chord.notes.map(n => pretty(n.name)).join(' · ') + ')' + (t.checkBass ? ', lowest note ' + pretty(t.chord.notes.find(n => n.pc === t.bassPc).name) : '') + (t.chord.function ? ' · ' + fnLabel(t.chord.function) : '') : '';
    }
    paintKeyboard();
  }

  function setFeedback(text, cls) {
    const el = $app.querySelector('[data-feedback]');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'feedback ' + (cls || '');
  }

  function hit() {
    const s = P.stepRef;
    P.okSince = null; P.tryingSince = null; P.armed = false;
    if (P.idx < P.seq.length - 1) {
      P.idx++;
      const praise = ['Yes!', 'Got it.', 'Nice.', 'Good.'][P.idx % 4];
      setFeedback(praise + ' Now ' + current().chord.symbol + '.', 'good');
      if (S.input === 'keys') P.held.clear();
      updateSeqUi();
      return;
    }
    P.done = true;
    if (S.input === 'keys') setTimeout(() => { if (P && P.done) { P.held.clear(); paintKeyboard(); } }, 600);
    setFeedback('', '');
    const succ = $app.querySelector('[data-success]');
    if (succ) succ.innerHTML = '<div class="success"><span>' + esc(s.explain || 'Correct!') + '</span></div>';
    const nb = $app.querySelector('[data-next]');
    if (nb && nb.textContent === 'Skip') nb.textContent = 'Next';
    updateSeqUi();
  }

  function describeMiss(res, t) {
    const parts = [];
    if (res.missing && res.missing.length) parts.push('Missing ' + res.missing.map(pc => pretty(nameForPc(pc, t))).join(', '));
    if (res.extra && res.extra.length) parts.push('extra ' + res.extra.map(pc => PC_NAMES[pc]).join(', '));
    if (!parts.length && res.bassOk === false) parts.push('Right notes. Now put ' + pretty(nameForPc(t.bassPc, t)) + ' at the bottom');
    return parts.join(', ');
  }
  function nameForPc(pc, t) {
    const n = t.chord && t.chord.notes.find(x => x.pc === pc);
    return n ? n.name : PC_NAMES[pc];
  }

  // keyboard / MIDI: exact checks
  function checkHeld(notes) {
    const t = current();
    if (!t) return;
    if (t.kind === 'note') {
      if (!notes.length) return;
      const last = notes[notes.length - 1];
      if (last % 12 === t.pc) hit();
      else setFeedback('That was ' + PC_NAMES[last % 12] + '. Try again.', 'bad');
      return;
    }
    const res = D.matchHeld(notes, t);
    if (res.ok) hit();
    else if (notes.length >= t.pcs.length) setFeedback(describeMiss(res, t), 'bad');
    else setFeedback('', '');
  }

  function onKeyTap(m) {
    A.Synth.playNotes([m], { dur: 0.9 });
    if (S.input !== 'keys' || !P || P.done) return;
    const t = current();
    if (t.kind === 'note') { checkHeld([m]); return; }
    if (P.held.has(m)) P.held.delete(m); else P.held.add(m);
    paintKeyboard();
    checkHeld([...P.held]);
  }

  // microphone frames
  function onFrame(fr) {
    const meter = $app.querySelector('[data-meter]');
    if (meter) meter.style.width = Math.round(fr.level * 100) + '%';
    const t = current();
    const chromaEl = $app.querySelector('[data-chroma]');
    if (chromaEl) {
      const want = new Set(t ? (t.kind === 'note' ? [t.pc] : t.pcs) : []);
      const tol = D.TOLERANCE[S.tol];
      for (let i = 0; i < 12; i++) {
        const v = fr.chroma ? fr.chroma[i] : 0;
        const bar = chromaEl.querySelector('[data-c="' + i + '"]');
        bar.style.height = Math.max(4, Math.round(v * 100)) + '%';
        bar.className = want.has(i) ? (v >= tol.present && fr.sounding ? 'hit' : 'want') : '';
        chromaEl.querySelector('[data-cl="' + i + '"]').className = want.has(i) ? 'want' : '';
      }
    }
    const status = $app.querySelector('[data-status]');
    if (fr.warm) { if (status) status.textContent = 'Measuring room noise… stay quiet for a moment.'; return; }
    if (fr.muted) { if (status) status.textContent = 'Playing example…'; P && (P.armed = false); return; }
    if (!t) return;
    const now = performance.now();
    if (!fr.sounding) {
      P.armed = true; P.okSince = null; P.tryingSince = null;
      if (status) status.textContent = 'Listening. Play when you\'re ready.';
      return;
    }
    if (fr.onset) P.armed = true;
    if (!P.armed) { if (status) status.textContent = 'Let the last chord fade, or strike the next one.'; return; }

    let ok = false, res = null, heard = '';
    if (t.kind === 'note') {
      let midiF = fr.pitch ? fr.pitch.midiF : null;
      if (midiF === null && fr.chroma) {
        let best = 0; for (let i = 1; i < 12; i++) if (fr.chroma[i] > fr.chroma[best]) best = i;
        midiF = 60 + best;
      }
      res = D.matchNote(midiF, t.pc, t.midi, S.tol);
      ok = res.ok;
      heard = res.nearest !== undefined ? 'Hearing ' + PC_NAMES[((res.nearest % 12) + 12) % 12] : '';
    } else if (fr.chroma) {
      res = D.matchChord(fr.chroma, t, S.tol, fr.bassPc);
      ok = res.ok;
      const top = fr.chroma.map((v, i) => [v, i]).filter(x => x[0] > 0.35).sort((a, b) => b[0] - a[0]).slice(0, 5).map(x => PC_NAMES[x[1]]);
      heard = top.length ? 'Hearing ' + top.join(' ') : '';
    }
    if (status) status.textContent = heard || 'Listening…';
    if (ok) {
      P.tryingSince = null;
      if (!P.okSince) P.okSince = now;
      if (now - P.okSince >= HOLD_MS) hit();
    } else {
      P.okSince = null;
      if (!P.tryingSince) P.tryingSince = now;
      if (now - P.tryingSince > 1400 && now - P.lastHint > 1200 && res) {
        P.lastHint = now;
        if (t.kind === 'note') setFeedback('Not quite. Looking for ' + pretty(t.name) + '.', 'bad');
        else setFeedback(describeMiss(res, t) || 'Not quite yet. Try striking all the notes together.', 'bad');
      }
    }
  }

  async function startMic() {
    S.micState = 'starting'; render();
    try {
      listener = new A.Listener(onFrame);
      await listener.start();
      S.micState = 'on';
    } catch (e) {
      listener = null;
      S.micState = 'error';
      S.micError = e && e.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow the microphone for this site in your browser settings, or switch to Tap keys. (Inside a preview window the microphone is usually blocked; open the app at its own web address instead.)'
        : 'Could not start the microphone: ' + (e && e.message ? e.message : e) + '. Try Tap keys instead.';
    }
    render();
  }

  async function startMidi() {
    try {
      const n = await A.Midi.connect((notes, ev) => {
        if (S.input !== 'midi' || !P || P.done) { paintKeyboard(); return; }
        paintKeyboard();
        if (ev.on !== undefined) {
          if (current() && current().kind === 'note') checkHeld([ev.on]);
          else checkHeld(notes);
        }
      });
      S.midiState = 'on';
      if (!n) { S.midiState = 'error'; S.midiError = 'No MIDI keyboard found. Plug it in, then tap Connect again.'; }
    } catch (e) {
      S.midiState = 'error';
      S.midiError = (e && e.message) || 'MIDI is not available in this browser.';
    }
    render();
  }

  // ---------- binding ----------
  function bindStep(s) {
    const key = lessonKey();
    $app.querySelectorAll('[data-example]').forEach(el => {
      const ex = s.examples[+el.dataset.example];
      const chords = resolveList(ex.progression || ex.chords, ex.key || key);
      el.querySelector('button').onclick = () => {
        const chips = el.querySelectorAll('.chip');
        playChords(chords, i => chips.forEach((c, j) => c.classList.toggle('playing', j === i)));
      };
    });
    if (s.type === 'quiz' || s.type === 'listen') {
      const pl = $app.querySelector('[data-play-listen]');
      if (pl) pl.onclick = () => playChords(resolveList(s.play, key));
      $app.querySelectorAll('[data-play-opt]').forEach(b => b.onclick = () => playChords(resolveList(s.playOptions[+b.dataset.playOpt], key)));
      $app.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => {
        const i = +b.dataset.opt;
        const right = i === s.answer;
        b.classList.add(right ? 'right' : 'wrong');
        if (right) $app.querySelector('[data-opt="' + s.answer + '"]').classList.add('right');
        $app.querySelector('[data-explain]').innerHTML = right
          ? '<div class="success"><span>' + esc(s.explain || 'Correct!') + '</span></div>'
          : '<p class="feedback bad">Not quite. Try another answer.</p>';
      });
      return;
    }
    if (!isPractice(s)) return;
    renderKeyboard();
    updateSeqUi();
    if (P.done) {
      const succ = $app.querySelector('[data-success]');
      if (succ) succ.innerHTML = '<div class="success"><span>' + esc(s.explain || 'Correct!') + '</span></div>';
    }
    const hear = $app.querySelector('[data-hear]');
    if (hear) hear.onclick = () => {
      const chips = $app.querySelectorAll('[data-seq] .chip');
      playChords(P.seq.map(t => t.chord), chips.length ? (i => chips.forEach((c, j) => c.classList.toggle('playing', j === i))) : null);
    };
    $app.querySelectorAll('[data-input]').forEach(b => b.onclick = () => {
      S.input = b.dataset.input; store.set('input', S.input);
      P.held.clear(); P.armed = false;
      render();
    });
    const ms = $app.querySelector('[data-mic-start]');
    if (ms) ms.onclick = startMic;
    const mst = $app.querySelector('[data-mic-stop]');
    if (mst) mst.onclick = () => { if (listener) listener.stop(); listener = null; S.micState = 'off'; render(); };
    const midiBtn = $app.querySelector('[data-midi-start]');
    if (midiBtn) midiBtn.onclick = startMidi;
    const clr = $app.querySelector('[data-clear]');
    if (clr) clr.onclick = () => { P.held.clear(); setFeedback('', ''); paintKeyboard(); };
    const sk = $app.querySelector('#show-keys');
    if (sk) sk.onchange = () => { S.showKeys = sk.checked; store.set('showKeys', S.showKeys); paintKeyboard(); };
  }

  // ---------- boot ----------
  loadCourses().then(cs => {
    S.courses = cs;
    if (cs.length === 1) { S.course = cs[0]; }
    render();
  }).catch(e => {
    $app.innerHTML = '<div class="step-card"><h2>Could not load the courses</h2><p class="muted">' + esc(e.message || e) + '</p></div>';
  });

  // expose for debugging/tests
  window.Chordwise = { S, get P() { return P; }, onFrame, onKeyTap, render, openLesson };
})();
