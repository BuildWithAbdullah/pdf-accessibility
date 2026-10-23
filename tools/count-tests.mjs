// Counts the tests by consuming the structured event stream from node:test,
// not by parsing the reporter output.
//
// Parsing the output does not work. Node 20 and 22 print TAP when the output
// is piped and Node 24 prints the spec reporter, so a verifier that greps for
// `# tests 357` passes on two of the three versions in the matrix and fails on
// the third with nothing wrong.
//
// There is a trap inside the fix. An object stream only flows once something
// reads it, and attaching named event listeners does not count as reading it,
// so `end` never fires and a check that runs at the end silently never runs.
// The `for await` below is what makes it flow, and the zero guard is what
// catches it if this is ever rewritten.

import { run } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { realpathSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

export async function countTests () {
  let passed = 0
  let failed = 0
  const failures = []
  // The files are enumerated rather than named by directory, because passing a
  // directory to run() is not the same as passing it to the command line
  // runner and resolves as a module path.
  const files = readdirSync(join(root, 'test'))
    .filter((entry) => entry.endsWith('.test.mjs'))
    .sort()
    .map((entry) => join(root, 'test', entry))
  if (files.length === 0) throw new Error('no test files were found, so this check would pass over nothing')
  const stream = run({ files, concurrency: 1 })
  for await (const event of stream) {
    if (event.type === 'test:pass') passed++
    if (event.type === 'test:fail') {
      failed++
      failures.push(event.data.name)
    }
  }
  if (passed + failed === 0) throw new Error('the test stream produced no results at all, so this check ran over nothing')
  return { passed, failed, failures }
}

// Every place the README states the test count, as a whole line match rather
// than a pattern, because a figure split across a line break is invisible to a
// pattern and reports as zero occurrences rather than as a wrong number.
export function readmeCounts (total) {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const phrase = total + ' tests'
  const occurrences = readme.split('\n').filter((line) => line.includes(phrase)).length
  const others = [...readme.matchAll(/(\d+) tests/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value !== total)
  return { occurrences, others }
}

if (realpathSync(process.argv[1] || '') === realpathSync(fileURLToPath(import.meta.url))) {
  const { passed, failed, failures } = await countTests()
  const total = passed + failed
  process.stderr.write('tests: ' + passed + ' passed, ' + failed + ' failed\n')
  if (failed > 0) {
    for (const name of failures) process.stderr.write('  failed: ' + name + '\n')
    process.exit(1)
  }
  const { occurrences, others } = readmeCounts(total)
  if (others.length > 0) {
    process.stderr.write('the README states a different test count: ' + others.join(', ') + ' against a live count of ' + total + '\n')
    process.exit(1)
  }
  if (occurrences < 2) {
    process.stderr.write('the README states "' + total + ' tests" on ' + occurrences + ' lines, and at least 2 are required so the figure cannot drift unnoticed\n')
    process.exit(1)
  }
  process.stderr.write('the README agrees with the live count on ' + occurrences + ' lines\n')
}
