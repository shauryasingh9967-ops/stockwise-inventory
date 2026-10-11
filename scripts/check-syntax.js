// Runs `node --check` on every .js file (excluding node_modules and the browser script).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules' || f.startsWith('.')) continue;
    const p = path.join(dir, f);
    fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p);
  }
})(root);

let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log('OK  ', path.relative(root, f));
  } catch (e) {
    bad++;
    console.log('FAIL', path.relative(root, f), '\n', e.stderr.toString());
  }
}
process.exit(bad ? 1 : 0);
