// The repository's own verifier. Run it with `npm run verify`.
//
// It makes one assertion per fact, counts them, and then asserts that the
// README states that same number. The total includes that last comparison, so
// the figure printed beside the command is the figure a reader gets when they
// run it.
//
// `--write` regenerates CATALOGUE.md and then makes every assertion anyway,
// including the generated file comparison. A tool with two modes that makes
// different assertions in each is how a repository with nothing wrong with it
// goes red in CI: that happened on another repository on this account, where
// write mode skipped two assertions and the self referential count disagreed
// with the README in write mode only.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { trackedFiles } from './tracked.mjs'
import { CATALOGUE, FINDING_IDS, NEEDS_SOURCE_IDS, duplicateIds } from '../lib/catalogue.mjs'
import { RULES } from '../lib/rules/index.mjs'
import { LIMITS, LIMIT_IDS, HEURISTIC_IDS } from '../lib/limits.mjs'
import { PAIRS } from '../examples/pairs.mjs'
import { FIXTURES } from '../fixtures/index.mjs'
import { build } from '../lib/writer/document.mjs'
import { findingIds } from '../lib/audit.mjs'
import { buildCatalogue, catalogueOnDisk, CATALOGUE_PATH } from './build-catalogue.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const write = process.argv.includes('--write')

// Needles assembled from code points, because a check that fails on its own
// source is a check somebody switches off. The dash rule and the institution
// rule both cover this file.
const EM_DASH = String.fromCharCode(0x2014)
const EN_DASH = String.fromCharCode(0x2013)
const INSTITUTION = [70, 65, 83, 84].map((code) => String.fromCharCode(code)).join('')
  + String.fromCharCode(45) + [78, 85, 67, 69, 83].map((code) => String.fromCharCode(code)).join('')

let made = 0
const failures = []
function check (ok, message) {
  made++
  if (!ok) failures.push(message)
}

const files = trackedFiles(root)
const readText = (relativePath) => readFileSync(join(root, relativePath), 'utf8')

// 1. The catalogue itself.
check(duplicateIds().length === 0, 'the catalogue has duplicate finding ids: ' + duplicateIds().join(', '))
check(CATALOGUE.length > 0, 'the catalogue is empty')
for (const entry of CATALOGUE) {
  check(/^[a-z][a-z.-]*[a-z]$/.test(entry.id), 'finding id is not lower case dotted: ' + entry.id)
  check(typeof entry.title === 'string' && entry.title.length > 10, 'finding has no title: ' + entry.id)
  check(typeof entry.why === 'string' && entry.why.length > 60, 'finding does not say what it costs a reader: ' + entry.id)
  check(typeof entry.fix === 'string' && entry.fix.length > 30, 'finding has no fix: ' + entry.id)
  check(typeof entry.limit === 'string' && entry.limit.length > 40, 'finding does not say what it cannot establish: ' + entry.id)
  check(RULES.some((rule) => rule.id === entry.rule), 'finding belongs to no rule: ' + entry.id)
}
for (const rule of RULES) {
  check(typeof rule.check === 'function', 'rule has no check function: ' + rule.id)
  check(Object.keys(rule.findings).length > 0, 'rule declares no findings: ' + rule.id)
  check(typeof rule.title === 'string' && rule.title.length > 20, 'rule has no title: ' + rule.id)
}

// 2. Every pair's residual set, in both directions.
const reachedByPairs = new Set()
for (const pair of PAIRS) {
  const failing = findingIds(build(pair.fail))
  const corrected = findingIds(build(pair.pass))
  check(failing.length > 0, 'the failing side of pair ' + pair.id + ' produces no findings at all')
  for (const id of failing) reachedByPairs.add(id)
  const declared = [...pair.residual].sort()
  check(JSON.stringify(corrected) === JSON.stringify(declared),
    'pair ' + pair.id + ' declares a residual set of [' + declared.join(' ') + '] and its corrected side produces [' + corrected.join(' ') + ']')
  for (const id of pair.residual) {
    check(FINDING_IDS.includes(id), 'pair ' + pair.id + ' declares a residual finding that is not in the catalogue: ' + id)
  }
  check(typeof pair.note === 'string' && pair.note.length > 60, 'pair ' + pair.id + ' has no note explaining what it demonstrates')
}

// 3. Every fixture reaches exactly what it claims.
const reachedByFixtures = new Set()
for (const fixture of FIXTURES) {
  const produced = findingIds(build(fixture.spec))
  const declared = [...fixture.reaches].sort()
  check(JSON.stringify(produced) === JSON.stringify(declared),
    'fixture ' + fixture.id + ' claims [' + declared.join(' ') + '] and produces [' + produced.join(' ') + ']')
  for (const id of produced) reachedByFixtures.add(id)
  check(typeof fixture.note === 'string' && fixture.note.length > 60, 'fixture ' + fixture.id + ' has no note')
}

// 4. The catalogue and the corpus agree, both ways.
const reached = new Set([...reachedByPairs, ...reachedByFixtures])
for (const id of FINDING_IDS) {
  check(reached.has(id), 'no example or fixture reaches ' + id + ', so it has never been observed to fire')
}
for (const id of reached) {
  check(FINDING_IDS.includes(id), 'the corpus produces ' + id + ', which is not in the catalogue')
}

// 5. The limits.
check(LIMITS.length >= 4, 'fewer than four limits are declared')
for (const limit of LIMITS) {
  check(limit.claim.length > 80, 'limit ' + limit.id + ' has no claim')
  check(limit.consequence.length > 80, 'limit ' + limit.id + ' does not say what follows from it')
}
check(LIMITS.filter((limit) => limit.assertedBothWays).length >= 4,
  'fewer than four limits are asserted in both directions')
check(new Set(LIMIT_IDS).size === LIMIT_IDS.length, 'two limits share an id')
for (const id of HEURISTIC_IDS) {
  check(FINDING_IDS.includes(id), 'a heuristic is declared for a finding that is not in the catalogue: ' + id)
}
for (const id of NEEDS_SOURCE_IDS) {
  check(FINDING_IDS.includes(id), 'a source only finding is declared that is not in the catalogue: ' + id)
}
check(NEEDS_SOURCE_IDS.length === 3, 'the number of findings whose fix is outside the PDF has changed from three to ' + NEEDS_SOURCE_IDS.length)

// 6. Prose rules, over every tracked text file.
for (const file of files) {
  const text = readText(file)
  check(!text.includes(EM_DASH) && !text.includes(EN_DASH), 'long dashes are not used in this repository: ' + file)
  check(!text.includes(INSTITUTION), 'the institution name does not appear in this repository: ' + file)
}

// 7. Purity. A rule judges a parsed object graph and never sees the spec that
// produced it, so no rule may reach the writer or the corpus.
for (const file of files.filter((candidate) => candidate.startsWith('lib/rules/'))) {
  const text = readText(file)
  check(!/from '.*writer/.test(text), 'a rule imports the writer, so it could read the author intent: ' + file)
  check(!/from '.*(examples|fixtures)/.test(text), 'a rule imports the corpus: ' + file)
}
for (const file of files.filter((candidate) => candidate.startsWith('lib/'))) {
  const text = readText(file)
  check(!/from '\.\.\/\.\.\/(examples|fixtures)/.test(text), 'the library imports the corpus: ' + file)
}
// The parser must not import a rule, or the judging and the collecting stop
// being separable and a rule can change what was collected.
for (const file of files.filter((candidate) => candidate.startsWith('lib/parser/'))) {
  check(!/from '.*rules/.test(readText(file)), 'the parser imports a rule: ' + file)
}

// 8. The engines floor is a promise, so it has to be a version that was tested.
// A floor of >=20 with a CI job named '20' is not tested, because
// actions/setup-node resolves a bare major to the newest release of that line.
const manifest = JSON.parse(readText('package.json'))
const floor = (manifest.engines && manifest.engines.node) || ''
const exact = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(floor)
check(exact !== null, 'the engines floor has to be an exact three part version, and it is "' + floor + '"')
check(manifest.license === 'MIT', 'the licence is not MIT')
check(typeof manifest.scripts.test === 'string', 'there is no test script')
check(typeof manifest.scripts.verify === 'string', 'there is no verify script')
const workflow = readText('.github/workflows/ci.yml')
if (exact) {
  check(!new RegExp("node-version:\\s*\\['?" + exact[1] + "'?[,\\]]").test(workflow.replace(/\s+/g, ' ')),
    'the CI matrix names Node ' + exact[1] + ' bare, which resolves to the newest release of that line rather than the declared floor')
  check(workflow.includes(exact[1] + '.' + exact[2] + '.' + exact[3]),
    'the CI matrix does not run the exact engines floor ' + exact[1] + '.' + exact[2] + '.' + exact[3])
}
check(!/npm run \S+ >/.test(workflow),
  'a CI step redirects the output of npm run, which captures npm own banner lines into the file')

// 9. The generated catalogue, compared against its builder rather than
// regenerated by its checker.
const generated = buildCatalogue()
if (write) writeFileSync(CATALOGUE_PATH, generated)
check(existsSync(CATALOGUE_PATH), 'CATALOGUE.md does not exist: run npm run catalogue')
check(existsSync(CATALOGUE_PATH) && catalogueOnDisk() === generated,
  'CATALOGUE.md differs from what tools/build-catalogue.mjs produces: run npm run catalogue')

// 10. The README. Every relative link has to resolve, and the two
// self referential figures have to appear as whole lines.
const readme = readText('README.md')
const links = [...new Set([...readme.matchAll(/\]\((?!https?:|#)([^)\s]+)\)/g)].map((match) => match[1]))]
for (const link of links) {
  const target = link.split('#')[0]
  check(existsSync(join(root, target)), 'the README links to a file that does not exist: ' + target)
}
check(readme.includes('## Verifying'), 'the README has no Verifying section')
const findingPhrase = FINDING_IDS.length + ' catalogued findings'
const findingLines = readme.split('\n').filter((line) => line.includes(findingPhrase)).length
check(findingLines >= 2, 'the README states "' + findingPhrase + '" on ' + findingLines + ' lines, and at least 2 are required')
const otherCounts = [...readme.matchAll(/(\d+) catalogued findings/g)]
  .map((match) => Number(match[1]))
  .filter((value) => value !== FINDING_IDS.length)
check(otherCounts.length === 0, 'the README states a different finding count: ' + otherCounts.join(', '))

// The last assertion, and it counts itself, so the number printed here is the
// number a reader gets when they run this.
const total = made + 1
const assertionPhrase = total + ' repository assertions'
const assertionLines = readme.split('\n').filter((line) => line.includes(assertionPhrase)).length
const otherAssertions = [...readme.matchAll(/(\d+) repository assertions/g)]
  .map((match) => Number(match[1]))
  .filter((value) => value !== total)
check(assertionLines >= 2 && otherAssertions.length === 0,
  'the README has to state "' + assertionPhrase + '" on at least 2 lines and no other figure, and it states it on '
  + assertionLines + ' with ' + (otherAssertions.length ? 'also ' + otherAssertions.join(', ') : 'no other figure'))

process.stdout.write(total + ' repository assertions over ' + files.length + ' tracked files, '
  + FINDING_IDS.length + ' catalogued findings, ' + PAIRS.length + ' example pairs and ' + FIXTURES.length + ' fixtures\n')
if (failures.length > 0) {
  for (const failure of failures) process.stdout.write('  FAILED: ' + failure + '\n')
  process.stdout.write(failures.length + ' of ' + total + ' assertions failed\n')
  process.exit(1)
}
process.stdout.write('all ' + total + ' assertions hold\n')
