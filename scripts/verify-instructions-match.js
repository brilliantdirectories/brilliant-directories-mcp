// Regression gate: confirm the extracted openapi/mcp-instructions.md matches
// byte-for-byte what the old inline array in mcp/index.js produced. If they
// match, the npm package behavior is unchanged post-refactor.
//
// Runs against git HEAD (i.e. the pre-refactor version of mcp/index.js) so
// the comparison survives even after the swap script has already run.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const refactored = fs.readFileSync(
  path.join(__dirname, "..", "openapi", "mcp-instructions.md"),
  "utf8"
);

const originalSrc = execSync("git show HEAD:mcp/index.js", {
  cwd: path.join(__dirname, ".."),
}).toString();

const lines = originalSrc.split("\n");
let s = -1, e = -1;
for (let i = 0; i < lines.length; i++) {
  if (s === -1 && /instructions:\s*\[/.test(lines[i])) s = i;
  else if (s !== -1 && /^\s*\]\.join\(/.test(lines[i])) { e = i; break; }
}

const snippet = lines.slice(s, e).join("\n");
const code = snippet.replace(/^\s*instructions:\s*/, "") + "].join('\\n')";
const original = eval(code);

console.log("original bytes  :", original.length);
console.log("refactored bytes:", refactored.length);
console.log("IDENTICAL       :", original === refactored);

if (original !== refactored) {
  for (let i = 0; i < Math.max(original.length, refactored.length); i++) {
    if (original[i] !== refactored[i]) {
      console.log("first diff at byte", i);
      console.log("  original :", JSON.stringify(original.slice(Math.max(0, i - 20), i + 50)));
      console.log("  refactor :", JSON.stringify(refactored.slice(Math.max(0, i - 20), i + 50)));
      break;
    }
  }
  process.exit(1);
}
