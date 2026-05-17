#!/usr/bin/env node
// Builds dist/bd-skill-content.zip from bd-skill-content/ source.
//
// Output: dist/bd-skill-content.zip — uploadable to claude.ai →
// Settings → Customize → Skills.
//
// Usage:
//   node scripts/build-skill-zip.js
//
// Best-practice notes:
// - dist/ holds build artifacts (this zip), not committed source.
// - The zip's root entry is the bd-skill-content/ folder (matches claude.ai's
//   "SKILL.md must be at top-level folder" rule; the folder counts as
//   the top level, not the zip itself).
// - Pure Node, no shell-out, no external dependencies.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'bd-skill-content');
const distDir = path.join(repoRoot, 'dist');
const outFile = path.join(distDir, 'bd-skill-content.zip');

if (!fs.existsSync(srcDir)) {
  console.error(`ERROR: source folder not found: ${srcDir}`);
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

// Use Python's zipfile via a tempfile script to avoid Windows shell
// escaping issues with multi-line Python inline.
const pyScript = path.join(distDir, '.build-zip.py');
fs.writeFileSync(
  pyScript,
  `import zipfile, os, sys
src = sys.argv[1]
dst = sys.argv[2]
src_parent = os.path.dirname(src)
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            arc = os.path.relpath(full, src_parent)
            zf.write(full, arc)
print(f'Wrote {dst} ({os.path.getsize(dst)} bytes)')
`,
);

try {
  execFileSync('python', [pyScript, srcDir, outFile], { stdio: 'inherit' });
} catch (err) {
  console.error('Build failed:', err.message);
  process.exit(1);
} finally {
  fs.unlinkSync(pyScript);
}

if (!fs.existsSync(outFile)) {
  console.error('Build script ran but output zip not found:', outFile);
  process.exit(1);
}

console.log(`\nNext steps:`);
console.log(`  Upload  ->  ${outFile}`);
console.log(`           ->  claude.ai → Settings → Customize → Skills → Upload Skill`);
