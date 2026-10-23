// The limits in lib/limits.mjs, asserted.
//
// A limit written as a paragraph is a claim about the repository. A limit
// written as an assertion is a fact about it, and four of the five here are
// asserted in both directions, so the sentence fails the build if it stops
// being true as well as if it was never true.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIMITS, LIMIT_IDS, HEURISTIC_IDS, CLEAN_AND_WRONG, ORDER_CASES, treeAgreesWithPage } from '../lib/limits.mjs'
import { NEEDS_SOURCE_IDS } from '../lib/catalogue.mjs'
import { build } from '../lib/writer/document.mjs'
import { audit, findingIds, UnsupportedPdf } from '../lib/audit.mjs'
import { PAIRS } from '../examples/pairs.mjs'
import { FIXTURES } from '../fixtures/index.mjs'
import { parse } from '../lib/parser/parse.mjs'
import { ObjectTable, dict, name, stream, ref } from '../lib/writer/objects.mjs'

const limit = (id) => {
  const found = LIMITS.find((entry) => entry.id === id)
  assert.ok(found, 'no limit declared with id ' + id)
  return found
}

test('every declared limit has an assertion in this file', () => {
  // The names below are the test names in this file. If a limit is added to
  // lib/limits.mjs and not asserted here, this fails.
  const asserted = new Set(['subset', 'clean-is-not-conforming', 'orders-are-independent',
    'heuristics-report-correct-documents', 'some-fixes-are-not-in-the-pdf'])
  for (const id of LIMIT_IDS) assert.ok(asserted.has(id), 'limit ' + id + ' is declared and not asserted')
  for (const id of asserted) assert.ok(LIMIT_IDS.includes(id), 'an assertion exists for a limit that is not declared: ' + id)
})

// Limit 1: subset. Both directions.
test('subset: the parser refuses what it cannot read rather than reading around it', () => {
  assert.ok(limit('subset').assertedBothWays)
  const cases = [
    [stream({ Filter: name('FlateDecode') }, 'z'), /filtered stream/],
    [stream({ Type: name('ObjStm'), N: 1, First: 0 }, ''), /object streams/]
  ]
  for (const [object, expected] of cases) {
    const table = new ObjectTable()
    const pages = table.reserve()
    const page = table.add(dict({ Type: name('Page'), Parent: ref(pages), MediaBox: [0, 0, 10, 10] }))
    table.put(pages, dict({ Type: name('Pages'), Kids: [page], Count: 1 }))
    const catalog = table.add(dict({ Type: name('Catalog'), Pages: ref(pages) }))
    const extra = table.add(object)
    const file = parse(table.render({ Root: catalog }))
    assert.throws(() => file.get(extra.value), expected)
  }
})

test('subset: and it reads every document in the corpus without raising', () => {
  // The other direction. A parser that refuses everything would satisfy the
  // assertion above and be useless.
  let read = 0
  for (const pair of PAIRS) {
    for (const side of ['fail', 'pass']) { audit(build(pair[side])); read++ }
  }
  for (const fixture of FIXTURES) { audit(build(fixture.spec)); read++ }
  assert.equal(read, PAIRS.length * 2 + FIXTURES.length)
  assert.ok(read > 40)
})

test('subset: an unreadable file raises the named error rather than returning no findings', () => {
  assert.throws(() => audit(Buffer.from('%PDF-1.7\nnothing\n')), UnsupportedPdf)
})

// Limit 2: a clean report is not a conforming document.
test('clean-is-not-conforming: a document with no findings can still be wrong', () => {
  // The description is fluent, specific, well formed, and about a different
  // image. Nothing in the file can say so, and nothing here pretends to.
  assert.deepEqual(findingIds(build(CLEAN_AND_WRONG)), [])
})

// Limit 3: the orders are independent. All four combinations.
test('orders-are-independent: all four combinations of the two verdicts are reached', () => {
  assert.ok(limit('orders-are-independent').assertedBothWays)
  const seen = new Map()
  for (const [id, spec] of Object.entries(ORDER_CASES)) {
    const { findings, model } = audit(build(spec))
    const reported = findings.some((finding) => finding.id === 'order.structure.diverges')
    const matchesPage = treeAgreesWithPage(model)
    seen.set(id, { reported, matchesPage })
    const others = findings.filter((finding) => finding.id !== 'order.structure.diverges')
    assert.deepEqual(others, [], 'order case ' + id + ' produces unrelated findings: '
      + others.map((finding) => finding.id).join(' '))
  }

  assert.deepEqual(seen.get('agree-and-right'), { reported: false, matchesPage: true })
  assert.deepEqual(seen.get('agree-and-wrong'), { reported: false, matchesPage: false })
  assert.deepEqual(seen.get('diverge-and-tree-right'), { reported: true, matchesPage: true })
  assert.deepEqual(seen.get('diverge-and-tree-wrong'), { reported: true, matchesPage: false })
})

test('orders-are-independent: the reported verdict is not even weak evidence about the page', () => {
  // The sharp form. For each value of the verdict this repository reports,
  // both values of the verdict it does not report occur. So knowing one tells
  // you nothing at all about the other, which is a stronger statement than
  // saying the check misses something.
  const grid = new Map()
  for (const spec of Object.values(ORDER_CASES)) {
    const { findings, model } = audit(build(spec))
    const reported = findings.some((finding) => finding.id === 'order.structure.diverges')
    const matchesPage = treeAgreesWithPage(model)
    grid.set(reported + ':' + matchesPage, (grid.get(reported + ':' + matchesPage) || 0) + 1)
  }
  for (const key of ['true:true', 'true:false', 'false:true', 'false:false']) {
    assert.equal(grid.get(key), 1, 'the combination ' + key + ' is not reached')
  }
})

test('orders-are-independent: the clean and wrong case is the one that matters', () => {
  // A two column layout exported straight from a page layout tool: the tree
  // and the content stream agree with each other and both disagree with the
  // page. This repository reports nothing, and the document is misordered for
  // every reader including a tagged one.
  const { findings, model } = audit(build(ORDER_CASES['agree-and-wrong']))
  assert.deepEqual(findings, [])
  assert.equal(treeAgreesWithPage(model), false)
})

// Limit 4: the heuristics report correct documents. One construction each.
const CORRECT_BY_INTENT = {
  'title.filename': {
    note: 'A guide whose subject is a named file, so the title legitimately ends in a file extension.',
    spec: {
      lang: 'en-US', title: 'How to read catchment_2024.pdf', displayDocTitle: true,
      elements: [{ type: 'H1', text: 'How to read the 2024 export' }]
    }
  },
  'headings.visual.only': {
    note: 'A pull quote set large, correctly tagged as a paragraph because it is not a section heading.',
    spec: {
      lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
      elements: [
        { type: 'H1', text: 'Catchment survey' },
        { type: 'P', text: 'Nitrate fell in every reach measured.', size: 11 },
        { type: 'P', text: 'Every reach improved.', size: 24 },
        { type: 'P', text: 'Sampling ran monthly throughout.', size: 11 }
      ]
    }
  },
  'figures.alt.placeholder': {
    note: 'A complex diagram given a short identification in /Alt with the full description in the body text, which is the recommended practice for exactly this case.',
    spec: {
      lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
      elements: [
        { type: 'H1', text: 'Catchment survey' },
        { type: 'Figure', alt: 'Diagram 4' },
        { type: 'P', text: 'Diagram 4 shows the eleven sampling points and the three gauging weirs between them.', size: 11 }
      ]
    }
  },
  'figures.alt.verbose': {
    note: 'A diagram that genuinely needs a long description and has nowhere else to put it.',
    spec: {
      lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
      elements: [
        { type: 'H1', text: 'Catchment survey' },
        { type: 'Figure', alt: 'The catchment runs from the gauging weir at the top left to the tidal limit at the bottom right. Eleven sampling points are marked along it, numbered upstream to downstream. Three tributaries join from the north between points 4 and 9, and the sewage treatment outfall sits between points 7 and 8.' }
      ]
    }
  },
  'lists.visual.only': {
    note: 'Two consecutive paragraphs that happen to open with a minus sign and a number, because the measurements are negative.',
    spec: {
      lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
      elements: [
        { type: 'H1', text: 'Catchment survey' },
        { type: 'P', text: '- 2.1 degrees was the mean overnight minimum in January.', size: 11 },
        { type: 'P', text: '- 0.4 degrees was the mean overnight minimum in February.', size: 11 }
      ]
    }
  },
  'tables.layout.single.column': {
    note: 'A genuine table of one variable: the identifiers of the stations sampled, with a header.',
    spec: {
      lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
      elements: [
        { type: 'H1', text: 'Catchment survey' },
        {
          type: 'Table',
          rows: [
            { header: true, cells: [{ text: 'Station', scope: 'Column' }] },
            { cells: [{ text: 'LC-01' }] },
            { cells: [{ text: 'LC-02' }] }
          ]
        }
      ]
    }
  },
  'links.text.is.url': {
    note: 'A document written to be printed, where the URL is deliberately spelled out because a paper reader cannot click anything.',
    spec: {
      lang: 'en-US', title: 'Catchment survey', displayDocTitle: true, tabs: 'S',
      elements: [
        { type: 'H1', text: 'Catchment survey' },
        { type: 'Link', text: 'https://example.invalid/catchment', uri: 'https://example.invalid/catchment', contents: 'The catchment data' }
      ]
    }
  }
}

test('heuristics-report-correct-documents: every heuristic is named, and no others', () => {
  assert.ok(limit('heuristics-report-correct-documents').assertedBothWays)
  assert.deepEqual([...HEURISTIC_IDS].sort(), Object.keys(CORRECT_BY_INTENT).sort())
})

for (const [id, { spec }] of Object.entries(CORRECT_BY_INTENT)) {
  test('heuristics-report-correct-documents: ' + id + ' reports a document that is correct by intent', () => {
    assert.ok(HEURISTIC_IDS.includes(id), id + ' is asserted here and not declared as a heuristic')
    assert.ok(findingIds(build(spec)).includes(id),
      id + ' no longer fires on the document constructed to show it misreading one')
  })
}

test('heuristics-report-correct-documents: the structural findings do not behave this way', () => {
  // The other direction, and the reason the distinction is worth drawing. A
  // document with a complete structure tree produces none of the findings that
  // read a structural fact, so those are not heuristics and are not listed as
  // such.
  const sound = {
    lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
    elements: [
      { type: 'H1', text: 'Catchment survey' },
      { type: 'P', text: 'Nitrate fell in every reach measured.', size: 11 }
    ]
  }
  assert.deepEqual(findingIds(build(sound)), [])
})

// Limit 5: some fixes are not in the PDF. Both directions.
test('some-fixes-are-not-in-the-pdf: the three are reached by a fixture and by no pair', () => {
  assert.ok(limit('some-fixes-are-not-in-the-pdf').assertedBothWays)
  const byPairs = new Set()
  for (const pair of PAIRS) for (const id of findingIds(build(pair.fail))) byPairs.add(id)
  const byFixtures = new Set()
  for (const fixture of FIXTURES) for (const id of findingIds(build(fixture.spec))) byFixtures.add(id)

  for (const id of NEEDS_SOURCE_IDS) {
    assert.ok(byFixtures.has(id), id + ' is declared as needing the source document and is reached by nothing')
    assert.ok(!byPairs.has(id),
      id + ' appears in an example pair, which implies a corrected version exists in the PDF. '
      + 'If that is now true, the finding should not be marked as needing the source document.')
  }
})

test('some-fixes-are-not-in-the-pdf: every other finding does have a correction somewhere', () => {
  // The other direction. If a finding is not marked as needing the source
  // document then something in the corpus has to show it being cleared, or the
  // marking is wrong.
  const cleared = new Set()
  for (const pair of PAIRS) {
    const failing = new Set(findingIds(build(pair.fail)))
    const corrected = new Set(findingIds(build(pair.pass)))
    for (const id of failing) if (!corrected.has(id)) cleared.add(id)
  }
  for (const id of NEEDS_SOURCE_IDS) assert.ok(!cleared.has(id), id)
  assert.ok(cleared.size >= 20, 'only ' + cleared.size + ' findings are shown being cleared by a correction')
})
