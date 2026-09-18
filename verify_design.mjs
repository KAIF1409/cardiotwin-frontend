/** verify_design.mjs — post-codemod audit: emoji ban + stripped artifacts. */
import fs from 'node:fs'
import path from 'node:path'

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2900}-\u{297F}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/u

const CHECKS = [
  [/>\s*<\/button>/, 'empty button label'],
  [/title=""/, 'empty title attribute'],
  [/placeholder=""/, 'empty placeholder'],
  [/<span className="graph-ic"><\/span>/, 'orphan icon span'],
  [/<span className="[a-z-]*ic"><\/span>/, 'orphan icon span (generic)'],
  [/>\s{2,}[^<>{}\n]*\s{2,}</, 'collapsed jsx text'],
]

const files = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name)
    if (e.isDirectory()) walk(f)
    else if (/\.(jsx?|css)$/.test(e.name)) files.push(f)
  }
}
walk('src')

const emojiHits = []
const artifactHits = []

for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/)
  lines.forEach((l, i) => {
    if (EMOJI.test(l)) emojiHits.push(`${f}:${i + 1}: ${l.trim().slice(0, 90)}`)
    for (const [re, name] of CHECKS) {
      if (re.test(l)) artifactHits.push(`${name} :: ${f}:${i + 1} :: ${l.trim().slice(0, 95)}`)
    }
  })
}

const lines = []
lines.push('── EMOJI AUDIT ──')
lines.push(emojiHits.length ? emojiHits.join('\n') : 'clean — zero emoji in src/')
lines.push('')
lines.push('── ARTIFACT AUDIT ──')
lines.push(artifactHits.length ? artifactHits.join('\n') : 'clean — no strip artifacts')

const report = lines.join('\n')
console.log(report)
fs.writeFileSync('verify_report.txt', report, 'utf8')

// Hard gate: emoji are banned by the design system, artifacts are a hard fail.
if (emojiHits.length || artifactHits.length) {
  console.error(`\nDesign lint failed — ${emojiHits.length} emoji, ${artifactHits.length} artifact(s).`)
  process.exit(1)
}
console.log('\nDesign lint passed.')