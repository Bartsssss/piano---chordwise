// Builds dist/chordwise-preview.html: one self-contained page (CSS, JS and courses inlined)
// for previewing as a claude.ai Artifact. The real app is the folder itself (index.html + files).
// Usage: node tools/build-artifact.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const idx = JSON.parse(read('courses/index.json'));
const courses = idx.courses.map(f => JSON.parse(read('courses/' + f)));
const js = ['theory.js', 'detect.js', 'audio.js'].map(read).join('\n');
const out = [
  '<title>Chordwise</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Inter:wght@400;500;600&display=swap">',
  '<style>\n' + read('styles.css') + '\n</style>',
  '<div id="app" class="app" aria-live="polite"></div>',
  '<script>\nwindow.__COURSES__ = ' + JSON.stringify(courses) + ';\n</script>',
  '<script>\n' + js + '\n</script>',
  '<script>\n' + read('app.js') + '\n</script>'
].join('\n');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'chordwise-preview.html'), out.replace(/<\/script>(?=[\s\S]*<\/script>)/g, m => m));
console.log('wrote dist/chordwise-preview.html', Math.round(out.length / 1024) + ' KB');
