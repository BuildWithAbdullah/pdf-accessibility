// Reads a PDF back into an object graph.
//
// What it refuses is as important as what it reads. Cross reference streams and
// object streams are not supported, and the parser raises UnsupportedPdf rather
// than parsing around them, so a file this repository cannot judge is never
// quietly reported as clean. That limit is declared in lib/limits.mjs and
// asserted in both directions in test/gap.mjs.

import { Lexer } from './lexer.mjs'

export class UnsupportedPdf extends Error {
  constructor (message) {
    super(message)
    this.name = 'UnsupportedPdf'
  }
}

export const Ref = class Ref {
  constructor (num, gen) { this.num = num; this.gen = gen }
}

export class PdfFile {
  constructor (buf) {
    this.buf = buf
    this.objects = new Map()
    this.trailer = null
    this.read()
  }

  read () {
    const tail = this.buf.toString('latin1', Math.max(0, this.buf.length - 2048))
    const match = /startxref\s+(\d+)\s*%%EOF\s*$/.exec(tail.replace(/\s+$/, '') + '\n')
    if (!match) throw new UnsupportedPdf('no startxref and %%EOF at the end of the file')
    const xrefAt = Number(match[1])
    if (xrefAt <= 0 || xrefAt >= this.buf.length) throw new UnsupportedPdf('startxref points outside the file')

    const lexer = new Lexer(this.buf, xrefAt)
    const first = lexer.next()
    if (!(first && first.type === 'keyword' && first.value === 'xref')) {
      throw new UnsupportedPdf('the cross reference section is not a classic table, so this file uses a cross reference stream')
    }

    const offsets = new Map()
    for (;;) {
      const save = lexer.at
      const token = lexer.next()
      if (token && token.type === 'keyword' && token.value === 'trailer') break
      if (!token || token.type !== 'number') { lexer.at = save; break }
      const start = token.value
      const countToken = lexer.next()
      if (!countToken || countToken.type !== 'number') throw new UnsupportedPdf('a malformed cross reference subsection header')
      for (let i = 0; i < countToken.value; i++) {
        const at = lexer.next()
        const gen = lexer.next()
        const kind = lexer.next()
        if (!at || !gen || !kind) throw new UnsupportedPdf('the cross reference table ends early')
        if (kind.value === 'n') offsets.set(start + i, at.value)
      }
    }

    this.trailer = this.readObjectAt(lexer, true)
    if (!this.trailer || this.trailer.kind !== 'dict') throw new UnsupportedPdf('the trailer is not a dictionary')
    if (this.trailer.value.Encrypt) throw new UnsupportedPdf('the file is encrypted')

    for (const [num, at] of offsets) {
      this.objects.set(num, { at, value: undefined, read: false })
    }
  }

  readObjectAt (lexer, allowKeywords = false) {
    const token = lexer.next()
    return this.readFromToken(token, lexer, allowKeywords)
  }

  readFromToken (token, lexer, allowKeywords) {
    if (!token) return undefined
    switch (token.type) {
      case 'number': {
        // Could be `n g R`. Look ahead without committing.
        const save = lexer.at
        const second = lexer.next()
        if (second && second.type === 'number') {
          const save2 = lexer.at
          const third = lexer.next()
          if (third && third.type === 'keyword' && third.value === 'R') {
            return new Ref(token.value, second.value)
          }
          lexer.at = save2
        }
        lexer.at = save
        return token.value
      }
      case 'name': return { kind: 'name', value: token.value }
      case 'string': return { kind: 'string', value: token.value }
      case 'arrayOpen': {
        const out = []
        for (;;) {
          const t = lexer.next()
          if (!t) throw new UnsupportedPdf('an array is never closed')
          if (t.type === 'arrayClose') return out
          out.push(this.readFromToken(t, lexer, allowKeywords))
        }
      }
      case 'dictOpen': {
        const entries = {}
        for (;;) {
          const t = lexer.next()
          if (!t) throw new UnsupportedPdf('a dictionary is never closed')
          if (t.type === 'dictClose') break
          if (t.type !== 'name') throw new UnsupportedPdf('a dictionary key that is not a name')
          entries[t.value] = this.readObjectAt(lexer, allowKeywords)
        }
        const save = lexer.at
        const after = lexer.next()
        if (after && after.type === 'keyword' && after.value === 'stream') {
          if (entries.Type && entries.Type.value === 'ObjStm') {
            throw new UnsupportedPdf('the file uses object streams, which this parser does not read')
          }
          // Skip the end of line that follows the stream keyword.
          let at = lexer.at
          if (this.buf[at] === 0x0d) at++
          if (this.buf[at] === 0x0a) at++
          const length = this.resolve(entries.Length)
          if (typeof length !== 'number') throw new UnsupportedPdf('a stream with no readable /Length')
          const body = this.buf.subarray(at, at + length)
          lexer.at = at + length
          const close = lexer.next()
          if (!(close && close.type === 'keyword' && close.value === 'endstream')) {
            throw new UnsupportedPdf('a stream whose /Length does not reach endstream')
          }
          if (entries.Filter) throw new UnsupportedPdf('a filtered stream, which this parser does not decode')
          return { kind: 'stream', value: entries, body }
        }
        lexer.at = save
        return { kind: 'dict', value: entries }
      }
      case 'keyword': {
        if (token.value === 'true') return true
        if (token.value === 'false') return false
        if (token.value === 'null') return null
        if (allowKeywords) return { kind: 'keyword', value: token.value }
        throw new UnsupportedPdf('unexpected keyword ' + token.value)
      }
      default:
        throw new UnsupportedPdf('unexpected token ' + token.type)
    }
  }

  get (num) {
    const entry = this.objects.get(num)
    if (!entry) return undefined
    if (entry.read) return entry.value
    const lexer = new Lexer(this.buf, entry.at)
    const a = lexer.next()
    const b = lexer.next()
    const c = lexer.next()
    if (!a || a.type !== 'number' || a.value !== num) throw new UnsupportedPdf('object ' + num + ' is not at its cross reference offset')
    if (!b || b.type !== 'number') throw new UnsupportedPdf('object ' + num + ' has no generation number')
    if (!c || c.type !== 'keyword' || c.value !== 'obj') throw new UnsupportedPdf('object ' + num + ' is missing the obj keyword')
    entry.value = this.readObjectAt(lexer)
    entry.read = true
    return entry.value
  }

  resolve (value) {
    let seen = 0
    while (value instanceof Ref) {
      if (++seen > 32) throw new UnsupportedPdf('a reference chain that does not terminate')
      value = this.get(value.num)
    }
    return value
  }

  // Dictionary lookup that resolves the result, so callers never see a Ref by
  // accident. Returns undefined for a missing key and null for an explicit
  // PDF null, because those are different defects.
  at (obj, ...keys) {
    let current = this.resolve(obj)
    for (const key of keys) {
      if (!current || (current.kind !== 'dict' && current.kind !== 'stream')) return undefined
      if (!(key in current.value)) return undefined
      current = this.resolve(current.value[key])
    }
    return current
  }

  nameOf (value) {
    const resolved = this.resolve(value)
    return resolved && resolved.kind === 'name' ? resolved.value : undefined
  }

  textOf (value) {
    const resolved = this.resolve(value)
    return resolved && resolved.kind === 'string' ? resolved.value : undefined
  }
}

export function parse (buf) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('parse expects a Buffer')
  if (buf.toString('latin1', 0, 5) !== '%PDF-') throw new UnsupportedPdf('the file does not begin with a PDF header')
  return new PdfFile(buf)
}
