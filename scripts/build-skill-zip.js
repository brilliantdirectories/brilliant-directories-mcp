#!/usr/bin/env node
// Builds bd-skill-content/bd-skill-content.zip from bd-skill-content/ source.
//
// Output: bd-skill-content/bd-skill-content.zip - uploadable to claude.ai ->
// Settings -> Customize -> Skills, and committed to the public repo so
// customers can grab it directly without opening a Release page.
//
// Usage:
//   node scripts/build-skill-zip.js
//
// Notes:
// - The zip's root entry is the bd-skill-content/ folder (matches claude.ai's
//   "SKILL.md must be at top-level folder" rule; the folder counts as
//   the top level, not the zip itself).
// - The script SKIPS any .zip file when walking the source folder, so the
//   zip never bundles itself recursively.
// - Pure Node, no shell-out beyond `python` for the zipfile module.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'bd-skill-content');
const outFile = path.join(srcDir, 'bd-skill-content.zip');

if (!fs.existsSync(srcDir)) {
  console.error(`ERROR: source folder not found: ${srcDir}`);
  process.exit(1);
}

if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

// Tempfile Python script lives next to the build script (not inside srcDir,
// or os.walk would pick it up). repoRoot is fine - it's outside srcDir.
const pyScript = path.join(repoRoot, '.build-zip.py');
fs.writeFileSync(
  pyScript,
  `import zipfile, os, sys
src = sys.argv[1]
dst = sys.argv[2]
src_parent = os.path.dirname(src)
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src):
        for f in files:
            if f.lower().endswith('.zip'):
                continue
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
console.log(`           ->  claude.ai -> Settings -> Customize -> Skills -> Upload Skill`);
