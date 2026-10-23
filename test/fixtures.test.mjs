import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FIXTURES } from '../fixtures/index.mjs'
import { PAIRS } from '../examples/pairs.mjs'
import { build } from '../lib/writer/document.mjs'
import { findingIds } from '../lib/audit.mjs'
import { FINDING_IDS } from '../lib/catalogue.mjs'

for (const fixture of FIXTURES) {
  test('fixture ' + fixture.id + ': reaches exactly what it claims', () => {
    assert.deepEqual(findingIds(build(fixture.spec)), [...fixture.reaches].sort())
  })
}

test('the fixture ids are unique', () => {
  const ids = FIXTURES.map((fixture) => fixture.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('every finding in the catalogue is reached by the corpus', () => {
  const reached = new Set()
  for (const pair of PAIRS) for (const id of findingIds(build(pair.fail))) reached.add(id)
  for (const fixture of FIXTURES) for (const id of findingIds(build(fixture.spec))) reached.add(id)
  const unreached = FINDING_IDS.filter((id) => !reached.has(id))
  assert.deepEqual(unreached, [], 'findings that have never been observed to fire')
})

test('the corpus produces nothing outside the catalogue', () => {
  const produced = new Set()
  for (const pair of PAIRS) {
    for (const side of ['fail', 'pass']) for (const id of findingIds(build(pair[side]))) produced.add(id)
  }
  for (const fixture of FIXTURES) for (const id of findingIds(build(fixture.spec))) produced.add(id)
  assert.deepEqual([...produced].filter((id) => !FINDING_IDS.includes(id)), [])
})

test('most of the catalogue is reached only by a fixture, which is why the fixtures exist', () => {
  // The eleven pairs reach fewer than half the findings. A verifier that
  // asserted only that every rule had a pair would be green over the rest, and
  // most of the defects found while building this repository were in exactly
  // those branches.
  const byPairs = new Set()
  for (const pair of PAIRS) for (const id of findingIds(build(pair.fail))) byPairs.add(id)
  const onlyFixtures = FINDING_IDS.filter((id) => !byPairs.has(id))
  assert.ok(onlyFixtures.length > byPairs.size,
    'the pairs reach ' + byPairs.size + ' findings and the fixtures add ' + onlyFixtures.length)
})
