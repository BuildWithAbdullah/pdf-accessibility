// Per rule tests, written branch by branch rather than document by document.
//
// Several of these are regression tests for defects that had shipped in this
// repository's own code while it was being built, and each of those says so.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../lib/writer/document.mjs'
import { findingIds, audit } from '../lib/audit.mjs'

const SOUND = () => ({
  lang: 'en-US',
  title: 'Catchment survey',
  displayDocTitle: true,
  tabs: 'S',
  elements: [
    { type: 'H1', text: 'Catchment survey' },
    { type: 'P', text: 'Nitrate fell in every reach measured.', size: 11 }
  ]
})
const withElements = (extra, overrides = {}) => {
  const base = SOUND()
  return { ...base, ...overrides, elements: [...base.elements, ...extra] }
}
const ids = (spec) => findingIds(build(spec))
const has = (spec, id) => ids(spec).includes(id)

test('a sound document produces no findings at all', () => {
  assert.deepEqual(ids(SOUND()), [])
})

// tagging

test('an untagged document reports the missing declaration and nothing about its content', () => {
  const produced = ids({ ...SOUND(), marked: 'absent', structTreeRoot: false })
  assert.deepEqual(produced, ['tagging.markinfo.absent'])
})

test('the rules that need a structure tree stay silent when there is none', () => {
  // Otherwise an untagged file produces fifty findings that all say the same
  // thing, and the one that matters is lost in them.
  const produced = ids({ ...SOUND(), marked: 'absent', structTreeRoot: false, elements: [{ type: 'Raw', text: 'x' }] })
  assert.ok(!produced.some((id) => id.startsWith('coverage.')))
  assert.ok(!produced.some((id) => id.startsWith('headings.')))
})

// language

test('an underscore separator is not a language tag', () => {
  assert.ok(has({ ...SOUND(), lang: 'en_US' }, 'language.malformed'))
})

test('a plain two letter tag and a region tag are both accepted', () => {
  assert.deepEqual(ids({ ...SOUND(), lang: 'en' }), [])
  assert.deepEqual(ids({ ...SOUND(), lang: 'pt-BR' }), [])
  assert.deepEqual(ids({ ...SOUND(), lang: 'zh-Hant-TW' }), [])
})

// title

test('a file extension in any case is recognised', () => {
  assert.ok(has({ ...SOUND(), title: 'Catchment survey.PDF' }, 'title.filename'))
  assert.ok(has({ ...SOUND(), title: 'catchment.docx' }, 'title.filename'))
})

test('a whitespace only title is empty rather than present', () => {
  assert.ok(has({ ...SOUND(), title: '\t  ' }, 'title.empty'))
})

test('an empty title does not also report as a filename, because the fix is one edit', () => {
  const produced = ids({ ...SOUND(), title: '' })
  assert.deepEqual(produced, ['title.empty'])
})

// coverage, and the separation of the two unreachable cases

test('a tagged sequence with no MCID is not also reported as untagged content', () => {
  // Regression. The content scanner originally attributed content inside a
  // tagged sequence with no MCID to a synthetic untagged mark as well, so one
  // span of bytes was reported under two ids with two different fixes. That is
  // precisely what a catalogue of one entry per reason exists to prevent.
  const produced = ids(withElements([{ type: 'NoMcid', text: 'x' }]))
  assert.deepEqual(produced, ['coverage.marked.without.mcid'])
})

test('content painted with no marked content wrapper at all is untagged content', () => {
  const produced = ids(withElements([{ type: 'Raw', text: 'x' }]))
  assert.deepEqual(produced, ['coverage.untagged.content'])
})

test('content marked as an artifact is neither untagged nor orphaned', () => {
  assert.deepEqual(ids(withElements([{ type: 'Artifact', text: 'page 1' }])), [])
  assert.deepEqual(ids(withElements([{ type: 'Artifact', rule: true }])), [])
})

test('a decorative image marked as an artifact needs no description', () => {
  assert.deepEqual(ids(withElements([{ type: 'DecorativeImage', asArtifact: true }])), [])
  assert.ok(has(withElements([{ type: 'DecorativeImage' }]), 'figures.alt.absent'))
})

// reading order, and the page offset defect

test('a correctly ordered document across two pages reports no divergence', () => {
  // Regression, and it was found by the corrected side of an example pair.
  // Paint positions were compared as indexes within a page, and each page
  // numbers its marks from zero, so every multi page document was reported as
  // misordered.
  const spec = {
    lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
    pages: [
      { elements: [{ type: 'H1', text: 'Catchment survey' }, { type: 'P', text: 'One.', size: 11 }] },
      { elements: [{ type: 'H2', text: 'Method' }, { type: 'P', text: 'Two.', size: 11 }] }
    ]
  }
  assert.deepEqual(ids(spec), [])
})

test('a divergence inside the second page is still found', () => {
  // The other direction of the same fix: the offsets must not hide a real
  // divergence that happens after the first page.
  const spec = {
    lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
    pages: [
      { elements: [{ type: 'H1', text: 'Catchment survey' }, { type: 'P', text: 'One.', size: 11 }] },
      { elements: [{ type: 'H2', text: 'Method' }, { type: 'P', text: 'Two.', size: 11 }], contentOrder: [1, 0] }
    ]
  }
  assert.ok(ids(spec).includes('order.structure.diverges'))
})

// text layer

test('a standard font with no mapping table is not reported, because a reader can map it', () => {
  assert.deepEqual(ids(withElements([{ type: 'P', text: 'x', size: 11 }])), [])
})

test('a page with an image and text is not reported as having no text layer', () => {
  assert.deepEqual(ids(withElements([{ type: 'Figure', alt: 'A map of the eleven sampling points.' }])), [])
})

test('a figure that paints paths is not reported as text drawn as paths', () => {
  // A diagram is supposed to be paths. The element type is what separates it
  // from a heading converted to outlines.
  assert.deepEqual(ids(withElements([{ type: 'Outline', text: 'x', tag: 'Figure' }])),
    ['figures.alt.absent'])
})

test('an element carrying /ActualText is not reported as text drawn as paths', () => {
  const produced = ids(withElements([{ type: 'P', text: 'x', actualText: 'Catchment' }]))
  assert.deepEqual(produced, [])
})

// artifacts

test('a header whose text differs between pages is not reported as a running header', () => {
  const spec = {
    lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
    pages: [
      { elements: [{ type: 'H1', text: 'Catchment survey' }, { type: 'P', text: 'Page one of two', size: 9 }] },
      { elements: [{ type: 'H2', text: 'Method' }, { type: 'P', text: 'Page two of two', size: 9 }] }
    ]
  }
  assert.ok(!ids(spec).includes('artifacts.running.tagged'))
})

test('a single page document never reports a running header', () => {
  assert.ok(!ids(withElements([{ type: 'P', text: 'Catchment survey', size: 9 }])).includes('artifacts.running.tagged'))
})

// headings

test('returning to a shallower level is correct and is not reported', () => {
  const spec = {
    ...SOUND(),
    elements: [
      { type: 'H1', text: 'Catchment survey' },
      { type: 'H2', text: 'Method' },
      { type: 'H3', text: 'Sampling' },
      { type: 'H2', text: 'Results' }
    ]
  }
  assert.deepEqual(ids(spec), [])
})

test('the skipped level is reported once rather than once per heading after it', () => {
  const spec = {
    ...SOUND(),
    elements: [
      { type: 'H1', text: 'Catchment survey' },
      { type: 'H3', text: 'Method' },
      { type: 'H5', text: 'Sampling' }
    ]
  }
  const { findings } = audit(build(spec))
  assert.equal(findings.filter((finding) => finding.id === 'headings.level.skipped').length, 1)
})

test('body text at the most common size is not read as a heading', () => {
  const spec = {
    ...SOUND(),
    elements: [
      { type: 'H1', text: 'Catchment survey' },
      { type: 'P', text: 'One.', size: 11 },
      { type: 'P', text: 'Two.', size: 11 },
      { type: 'P', text: 'Three.', size: 12 }
    ]
  }
  assert.deepEqual(ids(spec), [])
})

// lists

test('a properly tagged list is not reported', () => {
  assert.deepEqual(ids(withElements([{ type: 'L', items: ['Reach 1', 'Reach 2', 'Reach 3'] }])), [])
})

test('one paragraph beginning with a marker is not a list', () => {
  const bullet = String.fromCharCode(0x2022)
  assert.ok(!ids(withElements([{ type: 'L', asParagraphs: true, items: [bullet + ' Reach 1'] }]))
    .includes('lists.visual.only'))
})

// figures

test('a description that merely contains a placeholder word is not reported', () => {
  const spec = withElements([{ type: 'Figure', alt: 'A chart of nitrate by reach, falling throughout.' }])
  assert.deepEqual(ids(spec), [])
})

test('a description differing from the caption only in punctuation is still a repeat', () => {
  const spec = withElements([
    { type: 'Figure', alt: 'Nitrate by reach 2019 to 2025' },
    { type: 'Caption', text: 'Nitrate by reach, 2019 to 2025.', size: 11 }
  ])
  assert.ok(has(spec, 'figures.alt.repeats.caption'))
})

test('a description at the length threshold is not reported', () => {
  const alt = 'a'.repeat(250)
  assert.ok(!ids(withElements([{ type: 'Figure', alt }])).includes('figures.alt.verbose'))
  assert.ok(ids(withElements([{ type: 'Figure', alt: alt + 'b' }])).includes('figures.alt.verbose'))
})

// tables

test('a declared column span explains a short row', () => {
  const spec = withElements([{
    type: 'Table',
    rows: [
      { header: true, cells: [{ text: 'Reach', scope: 'Column' }, { text: '2024', scope: 'Column' }, { text: '2025', scope: 'Column' }] },
      { cells: [{ text: 'All reaches', colSpan: 3 }] }
    ]
  }])
  assert.ok(!ids(spec).includes('tables.row.ragged'))
})

test('an undeclared short row is reported', () => {
  const spec = withElements([{
    type: 'Table',
    rows: [
      { header: true, cells: [{ text: 'Reach', scope: 'Column' }, { text: '2024', scope: 'Column' }, { text: '2025', scope: 'Column' }] },
      { cells: [{ text: 'Upper' }, { text: '2.8' }] }
    ]
  }])
  assert.ok(ids(spec).includes('tables.row.ragged'))
})

test('a single header row needs no scope, which is the judgement the limit states', () => {
  const spec = withElements([{
    type: 'Table',
    rows: [
      { header: true, cells: [{ text: 'Reach' }, { text: 'Nitrate' }] },
      { cells: [{ text: 'Upper' }, { text: '2.8' }] }
    ]
  }])
  assert.ok(!ids(spec).includes('tables.header.no.scope'))
})

test('headers on two axes with no scope are reported', () => {
  const spec = withElements([{
    type: 'Table',
    rows: [
      { header: true, cells: [{ text: '' }, { text: '2024' }] },
      { cells: [{ text: 'Upper', kind: 'TH' }, { text: '2.8' }] }
    ]
  }])
  assert.ok(ids(spec).includes('tables.header.no.scope'))
})

test('a table using no explicit associations is not reported for missing identifiers', () => {
  const spec = withElements([{
    type: 'Table',
    rows: [
      { header: true, cells: [{ text: 'Reach', scope: 'Column' }, { text: 'Nitrate', scope: 'Column' }] },
      { cells: [{ text: 'Upper' }, { text: '2.8' }] }
    ]
  }])
  assert.ok(!ids(spec).includes('tables.header.id.absent'))
  assert.ok(!ids(spec).includes('tables.headers.dangling'))
})

test('a two column table is not reported as a layout table', () => {
  const spec = withElements([{
    type: 'Table',
    rows: [
      { header: true, cells: [{ text: 'Reach', scope: 'Column' }, { text: 'Nitrate', scope: 'Column' }] },
      { cells: [{ text: 'Upper' }, { text: '2.8' }] }
    ]
  }])
  assert.ok(!ids(spec).includes('tables.layout.single.column'))
})

// forms

test('a field named by /Alt on its structure element rather than by /TU is accepted', () => {
  // A reader can get the name from either, so reporting the second would be
  // reporting a document that works.
  const spec = withElements([{ type: 'Form', fields: [{ name: 'txt_reach', alt: 'Reach identifier', label: 'Reach identifier' }] }])
  assert.ok(!ids(spec).includes('forms.name.absent'))
})

test('an asterisk in the description satisfies the required announcement', () => {
  const spec = withElements([{ type: 'Form', fields: [{ name: 'txt_reach', tu: 'Reach identifier *', label: 'Reach identifier', required: true }] }])
  assert.ok(!ids(spec).includes('forms.required.unannounced'))
})

test('a field whose description differs from its machine name only in case is still the machine name', () => {
  const spec = withElements([{ type: 'Form', fields: [{ name: 'txt_reach', tu: 'TXT_Reach', label: 'Reach' }] }])
  assert.ok(ids(spec).includes('forms.name.is.field.name'))
})

test('a page with no fields is not asked for a tab order', () => {
  assert.deepEqual(ids({ ...SOUND(), tabs: undefined }), [])
})

// links

test('a bare host with no protocol is still a bare URL', () => {
  const spec = withElements([{ type: 'Link', text: 'www.example.invalid/catchment', uri: 'https://example.invalid/', contents: 'The catchment data' }])
  assert.ok(ids(spec).includes('links.text.is.url'))
})

test('a link with prose text and a description is not reported', () => {
  const spec = withElements([{ type: 'Link', text: 'The catchment data', uri: 'https://example.invalid/', contents: 'The catchment data' }])
  assert.deepEqual(ids(spec), [])
})

test('an empty description is reported in the same way as an absent one', () => {
  const spec = withElements([{ type: 'Link', text: 'The catchment data', uri: 'https://example.invalid/', contents: '  ' }])
  assert.ok(ids(spec).includes('links.alt.absent'))
})

// role map

test('a custom type is reported once however many elements use it', () => {
  const spec = withElements([
    { type: 'Chapter', text: 'One', size: 11 },
    { type: 'Chapter', text: 'Two', size: 11 }
  ])
  const { findings } = audit(build(spec))
  assert.equal(findings.filter((finding) => finding.id === 'rolemap.entry.absent').length, 1)
})

test('a custom type mapped to a standard one is accepted', () => {
  const spec = withElements([{ type: 'Chapter', text: 'One', size: 11 }], { roleMap: { Chapter: 'Sect' } })
  assert.deepEqual(ids(spec), [])
})

test('a mapped type is not also reported as unmapped', () => {
  const spec = withElements([{ type: 'Chapter', text: 'One', size: 11 }], { roleMap: { Chapter: 'Zone' } })
  assert.deepEqual(ids(spec), ['rolemap.target.nonstandard'])
})

// the two defects found by probing branches the corpus did not reach

test('a font with a /Differences array extracts as nothing rather than as plausible characters', () => {
  // Regression. The model read /Encoding only in its name form, so a subset
  // font whose encoding is a dictionary with a /Differences array was recorded
  // as using the base encoding and its text came back as readable prose. That
  // is the worst of the three outcomes: worse than refusing and worse than
  // returning nothing, because it reports a defective file as readable. It
  // also meant the undecodable flag was never set on anything in the corpus,
  // so the code that reads it had never run.
  const { model } = audit(build(withElements([{ type: 'P', text: 'Samples drawn monthly.', size: 11, font: 'F2' }])))
  const remapped = [...model.fonts.values()].find((font) => font.remapped)
  assert.ok(remapped, 'the /Differences encoding was not recorded')
  assert.equal(remapped.encoding, undefined)
  const paragraphs = model.nodes.filter((candidate) => candidate.type === 'P')
  assert.equal(paragraphs.length, 2)
  assert.equal(paragraphs[0].text, 'Nitrate fell in every reach measured.')
  assert.equal(paragraphs[1].text, '', 'the text set in the remapped font should extract as nothing')
  assert.ok(model.pages[0].marks.some((mark) => mark.decodable === false))
})

test('the standard font in the same document is still decoded', () => {
  // The other direction. A fix that marked every font undecodable would
  // satisfy the assertion above and make the whole model useless.
  const { model } = audit(build(SOUND()))
  assert.equal(model.nodes[0].text, 'Catchment survey')
  assert.ok(model.pages[0].marks.every((mark) => mark.decodable !== false))
})

test('a structure element with marked content and no page reference is refused on a multi page document', async () => {
  // Regression. The page index defaulted to the first page, so on a two page
  // document every finding about that element named the wrong page and the
  // orphan check compared against the wrong page's marks. A guess is worse
  // than a refusal here, because the finding looks specific.
  const { ObjectTable, dict, name, ref, stream } = await import('../lib/writer/objects.mjs')
  const { parse } = await import('../lib/parser/parse.mjs')
  const { documentModel } = await import('../lib/parser/model.mjs')
  const make = (withPage) => {
    const table = new ObjectTable()
    const pages = table.reserve()
    const content = table.add(stream({}, '/P <</MCID 0>> BDC BT /F1 11 Tf 1 0 0 1 56 700 Tm (x) Tj ET EMC\n'))
    const font = table.add(dict({ Type: name('Font'), Subtype: name('Type1'), BaseFont: name('Helvetica'), Encoding: name('WinAnsiEncoding') }))
    const resources = table.add(dict({ Font: dict({ F1: font }) }))
    const one = table.add(dict({ Type: name('Page'), Parent: ref(pages), MediaBox: [0, 0, 612, 792], Contents: content, Resources: resources, StructParents: 0 }))
    const two = table.add(dict({ Type: name('Page'), Parent: ref(pages), MediaBox: [0, 0, 612, 792], Resources: resources, StructParents: 1 }))
    table.put(pages, dict({ Type: name('Pages'), Kids: [one, two], Count: 2 }))
    const element = table.add(dict({ Type: name('StructElem'), S: name('P'), K: [0], Pg: withPage ? one : undefined }))
    const structRoot = table.add(dict({ Type: name('StructTreeRoot'), K: [element], ParentTree: table.add(dict({ Nums: [0, [element], 1, []] })) }))
    return table.render({
      Root: table.add(dict({ Type: name('Catalog'), Pages: ref(pages), MarkInfo: dict({ Marked: true }), StructTreeRoot: structRoot }))
    })
  }
  assert.throws(() => documentModel(parse(make(false))), /carries no \/Pg/)
  assert.doesNotThrow(() => documentModel(parse(make(true))))
})
