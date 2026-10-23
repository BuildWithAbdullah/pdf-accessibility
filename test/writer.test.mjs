import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../lib/writer/document.mjs'
import { ObjectTable, dict, name, str, serialise } from '../lib/writer/objects.mjs'
import { parse } from '../lib/parser/parse.mjs'
import { documentModel } from '../lib/parser/model.mjs'

test('a built document begins with a PDF header and ends with the end of file marker', () => {
  const bytes = build({ lang: 'en-US', title: 'T', elements: [{ type: 'P', text: 'x' }] })
  assert.equal(bytes.toString('latin1', 0, 8), '%PDF-1.7')
  assert.match(bytes.toString('latin1', bytes.length - 8), /%%EOF/)
})

test('the second line is a binary comment, so a transfer agent does not treat the file as text', () => {
  const bytes = build({ elements: [] })
  assert.equal(bytes[9], 0x25)
  assert.ok(bytes[10] > 0x7f)
})

test('an object reserved and never written raises rather than producing a broken file', () => {
  const table = new ObjectTable()
  table.reserve()
  assert.throws(() => table.render({}), /reserved but never written/)
})

test('a bare JavaScript string is refused, because a name and a string are different objects', () => {
  assert.throws(() => serialise('Catalog'), /ambiguous/)
})

test('a name with a character outside the safe set is written as a hex escape', () => {
  assert.equal(serialise(name('a b')), '/a#20b')
})

test('a string outside Latin 1 is written as UTF-16 with a byte order mark', () => {
  const written = serialise(str(String.fromCharCode(0x0627)))
  assert.match(written, /^<FEFF/)
})

test('contentOrder has to name every element exactly once', () => {
  const spec = { elements: [{ type: 'P', text: 'a' }, { type: 'P', text: 'b' }] }
  assert.throws(() => build({ ...spec, contentOrder: [0] }), /every element exactly once/)
  assert.throws(() => build({ ...spec, contentOrder: [0, 0] }), /repeats or omits/)
})

test('the cross reference offsets point at the objects they claim', () => {
  const bytes = build({ lang: 'en-US', title: 'T', elements: [{ type: 'H1', text: 'T' }] })
  // parse() reads every object through its cross reference offset and raises if
  // one is not where the table says, so a successful full read is the check.
  const file = parse(bytes)
  for (const num of file.objects.keys()) assert.notEqual(file.get(num), undefined)
})

test('a spec with no elements still produces a readable document', () => {
  const model = documentModel(parse(build({ elements: [] })))
  assert.equal(model.pages.length, 1)
  assert.equal(model.nodes.length, 0)
})

test('every page shares one resource dictionary', () => {
  const file = parse(build({
    pages: [
      { elements: [{ type: 'P', text: 'a' }] },
      { elements: [{ type: 'P', text: 'b' }] }
    ]
  }))
  const model = documentModel(file)
  const first = file.at(model.pages[0].dict, 'Resources')
  const second = file.at(model.pages[1].dict, 'Resources')
  assert.equal(first, second)
})

test('a dictionary entry set to undefined is omitted rather than written as null', () => {
  assert.equal(serialise(dict({ A: 1, B: undefined })), '<</A 1>>')
})
