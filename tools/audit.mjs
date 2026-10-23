// Audits a PDF on disk. Run it with `npm run audit -- <file.pdf>`.
//
// It exits 1 if there are findings and 2 if the file is outside the subset this
// repository reads. Those are different outcomes and they are reported
// differently: a refusal is not a clean result, and a tool that returns zero
// findings for a file it could not read is worse than no tool.

import { readFileSync } from 'node:fs'
import { audit, UnsupportedPdf } from '../lib/audit.mjs'
import { CATALOGUE_BY_ID } from '../lib/catalogue.mjs'

const [path, ...flags] = process.argv.slice(2)
const verbose = flags.includes('--why')

if (!path) {
  process.stderr.write('usage: node tools/audit.mjs <file.pdf> [--why]\n')
  process.exit(64)
}

let findings
try {
  findings = audit(readFileSync(path)).findings
} catch (error) {
  if (error instanceof UnsupportedPdf) {
    process.stdout.write('REFUSED ' + path + '\n')
    process.stdout.write('  ' + error.message + '\n')
    process.stdout.write('  This is not a clean result. The file is outside the uncompressed subset this\n')
    process.stdout.write('  repository reads, so nothing about it has been checked.\n')
    process.exit(2)
  }
  throw error
}

if (findings.length === 0) {
  process.stdout.write('no findings in ' + path + '\n')
  process.stdout.write('A clean result means the structural facts this repository checks are in order.\n')
  process.stdout.write('It is not a conformance claim: see the limits in README.md.\n')
  process.exit(0)
}

const grouped = new Map()
for (const finding of findings) {
  if (!grouped.has(finding.id)) grouped.set(finding.id, [])
  grouped.get(finding.id).push(finding.where)
}

const plural = (count, word) => count + ' ' + word + (count === 1 ? '' : 's')
process.stdout.write(plural(findings.length, 'finding') + ' in ' + path + ', under '
  + grouped.size + ' of the ' + CATALOGUE_BY_ID.size + ' catalogued reasons\n\n')

for (const [id, places] of grouped) {
  const entry = CATALOGUE_BY_ID.get(id)
  process.stdout.write(id + '\n')
  process.stdout.write('  ' + entry.title + '\n')
  for (const place of places.slice(0, 6)) process.stdout.write('  at ' + place + '\n')
  if (places.length > 6) process.stdout.write('  and ' + (places.length - 6) + ' more\n')
  if (verbose) {
    process.stdout.write('  why: ' + entry.why + '\n')
    process.stdout.write('  fix: ' + entry.fix + '\n')
    process.stdout.write('  cannot establish: ' + entry.limit + '\n')
  }
  process.stdout.write('\n')
}

process.exit(1)
