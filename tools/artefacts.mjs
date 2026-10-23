// Renders every example and fixture to a real PDF under build/.
//
// The artefacts are generated rather than committed, so there is no binary in
// the history that can drift away from the spec that is supposed to describe
// it. Run this when you want to open the failing and corrected documents in a
// viewer or put them through somebody else's checker.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { build } from '../lib/writer/document.mjs'
import { PAIRS } from '../examples/pairs.mjs'
import { FIXTURES } from '../fixtures/index.mjs'
import { findingIds } from '../lib/audit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(resolve(here, '..'), 'build')

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'examples'), { recursive: true })
mkdirSync(join(out, 'fixtures'), { recursive: true })

const index = ['# Generated artefacts', '', 'Produced by `npm run artefacts`. Not committed.', '']

for (const pair of PAIRS) {
  for (const side of ['fail', 'pass']) {
    const bytes = build(pair[side])
    const name = pair.id + '-' + side + '.pdf'
    writeFileSync(join(out, 'examples', name), bytes)
    index.push('- `examples/' + name + '`: ' + (findingIds(bytes).join(', ') || 'no findings'))
  }
}

for (const fixture of FIXTURES) {
  const bytes = build(fixture.spec)
  const name = fixture.id + '.pdf'
  writeFileSync(join(out, 'fixtures', name), bytes)
  index.push('- `fixtures/' + name + '`: ' + findingIds(bytes).join(', '))
}

writeFileSync(join(out, 'README.md'), index.join('\n') + '\n')
process.stderr.write('wrote ' + (PAIRS.length * 2 + FIXTURES.length) + ' artefacts to build/\n')
