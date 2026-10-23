// A minimal, dependency free PDF object model and serialiser.
//
// The subset is deliberate: every object is indirect and uncompressed, the
// cross reference section is a classic table, and there is no encryption and
// no object stream. That subset is what lib/parser reads back, and the limit
// is declared in lib/limits.mjs and asserted in test/gap.mjs rather than
// left in a paragraph.

export const name = (n) => ({ kind: 'name', value: n })
export const str = (s) => ({ kind: 'string', value: s })
export const ref = (n) => ({ kind: 'ref', value: n })
export const dict = (entries) => ({ kind: 'dict', value: entries })
export const stream = (entries, body) => ({ kind: 'stream', value: entries, body })

const NAME_SAFE = /^[A-Za-z0-9._-]+$/

function serialiseName (value) {
  if (NAME_SAFE.test(value)) return '/' + value
  let out = '/'
  for (const ch of value) {
    const code = ch.codePointAt(0)
    out += NAME_SAFE.test(ch) ? ch : '#' + code.toString(16).padStart(2, '0')
  }
  return out
}

function serialiseString (value) {
  // PDF text strings are UTF-16BE with a byte order mark when they carry
  // anything outside the Latin set. Keeping both branches matters: a /TU or
  // an /Alt written as a plain literal with non Latin text extracts as
  // mojibake, which is a real accessibility defect and not a cosmetic one.
  let latin = true
  for (const ch of value) if (ch.codePointAt(0) > 0xff) { latin = false; break }
  if (latin) {
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
    return '(' + escaped + ')'
  }
  let hex = 'FEFF'
  for (const ch of value) {
    const code = ch.codePointAt(0)
    if (code > 0xffff) {
      const v = code - 0x10000
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0').toUpperCase()
      hex += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0').toUpperCase()
    } else {
      hex += code.toString(16).padStart(4, '0').toUpperCase()
    }
  }
  return '<' + hex + '>'
}

export function serialise (obj) {
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj === 'boolean') return obj ? 'true' : 'false'
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) throw new Error('cannot serialise a non finite number')
    return Number.isInteger(obj) ? String(obj) : String(Number(obj.toFixed(4)))
  }
  if (typeof obj === 'string') throw new Error('bare JavaScript strings are ambiguous: use name() or str()')
  if (Array.isArray(obj)) return '[' + obj.map(serialise).join(' ') + ']'
  switch (obj.kind) {
    case 'name': return serialiseName(obj.value)
    case 'string': return serialiseString(obj.value)
    case 'ref': return obj.value + ' 0 R'
    case 'dict': return serialiseDict(obj.value)
    case 'stream': throw new Error('a stream has to be written by the document writer, not inline')
    default: throw new Error('unknown object kind: ' + String(obj.kind))
  }
}

function serialiseDict (entries) {
  const parts = []
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue
    parts.push(serialiseName(key) + ' ' + serialise(value))
  }
  return '<<' + parts.join(' ') + '>>'
}

// A writer that hands out object numbers before their bodies exist, because a
// structure tree and the page content it points at reference each other.
export class ObjectTable {
  constructor () {
    this.bodies = new Map()
    this.next = 1
  }

  reserve () {
    return this.next++
  }

  put (num, obj) {
    if (!this.bodies.has(num) && num >= this.next) throw new Error('object ' + num + ' was never reserved')
    this.bodies.set(num, obj)
    return ref(num)
  }

  add (obj) {
    const num = this.reserve()
    return this.put(num, obj)
  }

  missing () {
    const out = []
    for (let n = 1; n < this.next; n++) if (!this.bodies.has(n)) out.push(n)
    return out
  }

  render (trailerEntries) {
    const gaps = this.missing()
    if (gaps.length) throw new Error('reserved but never written: ' + gaps.join(', '))
    const chunks = []
    let offset = 0
    const push = (text) => {
      const buf = Buffer.from(text, 'latin1')
      chunks.push(buf)
      offset += buf.length
    }
    const pushRaw = (buf) => {
      chunks.push(buf)
      offset += buf.length
    }

    push('%PDF-1.7\n')
    // The binary comment is what tells a transfer agent the file is not text.
    pushRaw(Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

    const offsets = new Map()
    for (let num = 1; num < this.next; num++) {
      const obj = this.bodies.get(num)
      offsets.set(num, offset)
      push(num + ' 0 obj\n')
      if (obj && obj.kind === 'stream') {
        const body = Buffer.isBuffer(obj.body) ? obj.body : Buffer.from(obj.body, 'latin1')
        push(serialiseDict({ ...obj.value, Length: body.length }) + '\nstream\n')
        pushRaw(body)
        push('\nendstream\n')
      } else {
        push(serialise(obj) + '\n')
      }
      push('endobj\n')
    }

    const xrefAt = offset
    const count = this.next
    push('xref\n0 ' + count + '\n')
    push('0000000000 65535 f \n')
    for (let num = 1; num < count; num++) {
      push(String(offsets.get(num)).padStart(10, '0') + ' 00000 n \n')
    }
    push('trailer\n' + serialiseDict({ ...trailerEntries, Size: count }) + '\n')
    push('startxref\n' + xrefAt + '\n%%EOF\n')

    return Buffer.concat(chunks)
  }
}
