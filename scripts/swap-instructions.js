// One-shot: swap the inline `instructions: [...].join("\n")` array in
// mcp/index.js with `instructions: INSTRUCTIONS,` referencing the constant
// loaded at the top of the file. Idempotent (checks if already swapped).

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "mcp", "index.js");
const src = fs.readFileSync(SRC, "utf8");
const lines = src.split("\n");

let startIdx = -1, endIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (startIdx === -1 && /instructions:\s*\[/.test(lines[i])) {
    startIdx = i;
  } else if (startIdx !== -1 && /^\s*\]\.join\(/.test(lines[i])) {
    endIdx = i;
    break;
  }
}

if (startIdx === -1 || endIdx === -1) {
  // Already swapped or structure changed
  console.error("Could not locate inline instructions array — already swapped? Aborting to avoid damage.");
  process.exit(1);
}

const before = lines.slice(0, startIdx);
const after = lines.slice(endIdx + 1);
const indent = lines[startIdx].match(/^\s*/)[0];
const replacement = [`${indent}instructions: INSTRUCTIONS,`];

const out = [...before, ...replacement, ...after].join("\n");
fs.writeFileSync(SRC, out, "utf8");

console.log(`Replaced ${endIdx - startIdx + 1} lines with 1 line.`);
console.log(`  before: line ${startIdx + 1} ... line ${endIdx + 1}`);
console.log(`  after:  line ${startIdx + 1} = "instructions: INSTRUCTIONS,"`);
console.log(`  new file line count: ${out.split("\n").length}`);
