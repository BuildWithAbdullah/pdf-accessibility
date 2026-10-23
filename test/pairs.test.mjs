import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAIRS } from '../examples/pairs.mjs'
import { build } from '../lib/writer/document.mjs'
import { findingIds, audit } from '../lib/audit.mjs'
import { FINDING_IDS } from '../lib/catalogue.mjs'

for (const pair of PAIRS) {
  test('pair ' + pair.id + ': the failing side produces findings', () => {
    const produced = findingIds(build(pair.fail))
    assert.ok(produced.length > 0, 'the failing side of ' + pair.id + ' is clean, so the pair demonstrates nothing')
    for (const id of produced) assert.ok(FINDING_IDS.includes(id), id)
  })

  test('pair ' + pair.id + ': the corrected side produces exactly its declared residual set', () => {
    // Both directions. Every id declared has to still fire, and nothing
    // outside the declaration may fire. A residual set asserted only one way
    // is a comment.
    const produced = findingIds(build(pair.pass))
    assert.deepEqual(produced, [...pair.residual].sort())
  })

  test('pair ' + pair.id + ': the correction clears something', () => {
    const failing = new Set(findingIds(build(pair.fail)))
    const corrected = new Set(findingIds(build(pair.pass)))
    const cleared = [...failing].filter((id) => !corrected.has(id))
    assert.ok(cleared.length > 0, 'the corrected side of ' + pair.id + ' clears nothing')
  })

  test('pair ' + pair.id + ': the correction introduces nothing new', () => {
    const failing = new Set(findingIds(build(pair.fail)))
    const introduced = findingIds(build(pair.pass)).filter((id) => !failing.has(id))
    assert.deepEqual(introduced, [], 'the corrected side of ' + pair.id + ' introduces findings the failing side did not have')
  })

  test('pair ' + pair.id + ': both sides parse and model without raising', () => {
    for (const side of ['fail', 'pass']) {
      const { model } = audit(build(pair[side]))
      assert.ok(model.pages.length >= 1, pair.id + ' ' + side)
    }
  })
}

test('the pair ids are unique and ordered', () => {
  const ids = PAIRS.map((pair) => pair.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(ids, [...ids].sort())
})
