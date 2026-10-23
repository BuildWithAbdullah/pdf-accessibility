import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, UnsupportedPdf } from '../lib/parser/parse.mjs'
import { documentModel, scanContent } from '../lib/parser/model.mjs'
import { build } from '../lib/writer/document.mjs'
import { Lexer } from '../lib/parser/lexer.mjs'
import { ObjectTable, dict, name, stream, ref } from '../lib/writer/objects.mjs'

// These refusal cases are assembled rather than produced by mutating a built
// file. Editing the bytes of a finished PDF moves every cross reference offset
// after the edit, so the parser raises about the table instead of about the
// thing under test, and the test passes for the wrong reason.
function assemble ({ extraObject, trailer = {} } = {}) {
  const table = new ObjectTable()
  const pages = table.reserve()
  const page = table.add(dict({ Type: name('Page'), Parent: ref(pages), MediaBox: [0, 0, 10, 10] }))
  table.put(pages, dict({ Type: name('Pages'), Kids: [page], Count: 1 }))
  const catalog = table.add(dict({ Type: name('Catalog'), Pages: ref(pages) }))
  const extra = extraObject ? table.add(extraObject) : undefined
  return { bytes: table.render({ Root: catalog, ...trailer }), extra }
}

const minimal = () => build({ lang: 'en-US', title: 'T', displayDocTitle: true, elements: [{ type: 'H1', text: 'T' }] })

test('a file that does not start with a PDF header is refused', () => {
  assert.throws(() => parse(Buffer.from('not a pdf')), UnsupportedPdf)
})

test('a buffer is required, because a string would be silently re-encoded', () => {
  assert.throws(() => parse('%PDF-1.7'), TypeError)
})

test('a file with no startxref is refused', () => {
  assert.throws(() => parse(Buffer.from('%PDF-1.7\nnothing here\n')), /startxref/)
})

test('a cross reference stream is refused by name rather than read around', () => {
  // What a file written with a cross reference stream looks like at the point
  // the parser reaches: an indirect object where the `xref` keyword would be.
  const head = '%PDF-1.7\n'
  const body = '1 0 obj\n<</Type /XRef /Size 2>>\nstream\nx\nendstream\nendobj\n'
  const bytes = Buffer.from(head + body + 'startxref\n' + head.length + '\n%%EOF\n', 'latin1')
  assert.throws(() => parse(bytes), /cross reference stream/)
})

test('an encrypted file is refused', () => {
  const { bytes } = assemble({ trailer: { Encrypt: ref(1) } })
  assert.throws(() => parse(bytes), /encrypted/)
})

test('a filtered stream is refused rather than returned undecoded', () => {
  const { bytes, extra } = assemble({ extraObject: stream({ Filter: name('FlateDecode') }, 'compressed') })
  assert.throws(() => parse(bytes).get(extra.value), /filtered stream/)
})

test('an object stream is refused', () => {
  const { bytes, extra } = assemble({ extraObject: stream({ Type: name('ObjStm'), N: 1, First: 0 }, '') })
  assert.throws(() => parse(bytes).get(extra.value), /object streams/)
})

test('a reference is distinguished from two numbers followed by a keyword', () => {
  const lexer = new Lexer(Buffer.from('[1 0 R 1 0]'), 0)
  const file = parse(minimal())
  const value = file.readFromToken(lexer.next(), lexer, true)
  assert.equal(value.length, 3)
  assert.equal(value[0].num, 1)
  assert.equal(value[1], 1)
  assert.equal(value[2], 0)
})

test('a comment runs to the end of the line and is skipped', () => {
  const lexer = new Lexer(Buffer.from('% a comment\n/Name'), 0)
  assert.deepEqual(lexer.next(), { type: 'name', value: 'Name' })
})

test('an unbalanced marked content sequence is refused rather than reported as clean', () => {
  const file = parse(minimal())
  assert.throws(() => scanContent(file, Buffer.from('/P <</MCID 0>> BDC (x) Tj')), /ends inside a marked content sequence/)
  assert.throws(() => scanContent(file, Buffer.from('EMC')), /no matching BDC/)
})

test('a structure tree that revisits an element is refused, because it is not a tree', () => {
  const table = new ObjectTable()
  const pages = table.reserve()
  const page = table.add(dict({ Type: name('Page'), Parent: ref(pages), MediaBox: [0, 0, 10, 10], StructParents: 0 }))
  table.put(pages, dict({ Type: name('Pages'), Kids: [page], Count: 1 }))
  const element = table.add(dict({ Type: name('StructElem'), S: name('P'), Pg: page, K: [0] }))
  const structRoot = table.add(dict({ Type: name('StructTreeRoot'), K: [element, element] }))
  const catalog = table.add(dict({
    Type: name('Catalog'), Pages: ref(pages), StructTreeRoot: structRoot, MarkInfo: dict({ Marked: true })
  }))
  const bytes = table.render({ Root: catalog })
  assert.throws(() => documentModel(parse(bytes)), /not a tree/)
})

test('the parser reads the corpus it is given without raising', () => {
  const model = documentModel(parse(minimal()))
  assert.equal(model.lang, 'en-US')
  assert.equal(model.marked, true)
})

test('a dictionary key that is not a name is refused', () => {
  const file = parse(minimal())
  const lexer = new Lexer(Buffer.from('<< 1 2 >>'), 0)
  assert.throws(() => file.readFromToken(lexer.next(), lexer, true), /key that is not a name/)
})

test('a hex string with an odd number of digits is padded, as the specification requires', () => {
  const lexer = new Lexer(Buffer.from('<414>'), 0, { rawStrings: true })
  assert.equal(lexer.next().value, 'A@')
})

test('an escaped octal sequence in a literal string is read as one byte', () => {
  const lexer = new Lexer(Buffer.from('(\\101\\102)'), 0, { rawStrings: true })
  assert.equal(lexer.next().value, 'AB')
})

test('a nested parenthesis in a literal string does not end it early', () => {
  const lexer = new Lexer(Buffer.from('(a (b) c)'), 0, { rawStrings: true })
  assert.equal(lexer.next().value, 'a (b) c')
})
