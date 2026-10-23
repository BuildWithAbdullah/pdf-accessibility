// A tokeniser for PDF syntax, used both for the file body and for content
// streams. It is deliberately strict: anything it has not been written to read
// raises rather than being skipped, because a parser that guesses is a parser
// whose findings cannot be trusted.

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20])
const DELIMITER = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)))

const isWhite = (b) => WHITESPACE.has(b)
const isDelim = (b) => DELIMITER.has(b)
const isRegular = (b) => b !== undefined && !isWhite(b) && !isDelim(b)

export class Lexer {
  // `rawStrings` keeps string tokens as the bytes that were written, with no
  // byte order mark interpretation. Content streams need it: a glyph code
  // sequence that happens to begin FE FF is not a UTF-16 text string, and
  // reading it as one turns a page of text into two characters.
  constructor (buf, at = 0, { rawStrings = false } = {}) {
    this.buf = buf
    this.at = at
    this.rawStrings = rawStrings
  }

  skip () {
    for (;;) {
      while (this.at < this.buf.length && isWhite(this.buf[this.at])) this.at++
      if (this.buf[this.at] === 0x25) { // a comment runs to the end of the line
        while (this.at < this.buf.length && this.buf[this.at] !== 0x0a && this.buf[this.at] !== 0x0d) this.at++
        continue
      }
      return
    }
  }

  atEnd () {
    this.skip()
    return this.at >= this.buf.length
  }

  // Returns { type, value } where type is one of:
  // number, name, string, keyword, arrayOpen, arrayClose, dictOpen, dictClose
  next () {
    this.skip()
    if (this.at >= this.buf.length) return null
    const b = this.buf[this.at]

    if (b === 0x5b) { this.at++; return { type: 'arrayOpen' } }
    if (b === 0x5d) { this.at++; return { type: 'arrayClose' } }
    if (b === 0x3c) {
      if (this.buf[this.at + 1] === 0x3c) { this.at += 2; return { type: 'dictOpen' } }
      return { type: 'string', value: this.readHexString() }
    }
    if (b === 0x3e) {
      if (this.buf[this.at + 1] === 0x3e) { this.at += 2; return { type: 'dictClose' } }
      throw new Error('a single > at byte ' + this.at + ' is not PDF syntax')
    }
    if (b === 0x28) return { type: 'string', value: this.readLiteralString() }
    if (b === 0x2f) return { type: 'name', value: this.readName() }
    if (b === 0x7b || b === 0x7d) { this.at++; return { type: 'keyword', value: b === 0x7b ? '{' : '}' } }

    const start = this.at
    while (isRegular(this.buf[this.at])) this.at++
    if (this.at === start) throw new Error('stuck on byte ' + b + ' at ' + this.at)
    const word = this.buf.toString('latin1', start, this.at)
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return { type: 'number', value: Number(word) }
    return { type: 'keyword', value: word }
  }

  readName () {
    this.at++ // the slash
    let out = ''
    while (isRegular(this.buf[this.at])) {
      if (this.buf[this.at] === 0x23) {
        const hex = this.buf.toString('latin1', this.at + 1, this.at + 3)
        if (!/^[0-9A-Fa-f]{2}$/.test(hex)) throw new Error('a # in a name has to be followed by two hex digits')
        out += String.fromCharCode(parseInt(hex, 16))
        this.at += 3
        continue
      }
      out += String.fromCharCode(this.buf[this.at])
      this.at++
    }
    return out
  }

  readLiteralString () {
    this.at++ // the open paren
    let depth = 1
    const bytes = []
    while (this.at < this.buf.length) {
      const b = this.buf[this.at]
      if (b === 0x5c) {
        const n = this.buf[this.at + 1]
        this.at += 2
        const simple = { 0x6e: 0x0a, 0x72: 0x0d, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0c }
        if (simple[n] !== undefined) { bytes.push(simple[n]); continue }
        if (n >= 0x30 && n <= 0x37) {
          let oct = String.fromCharCode(n)
          while (oct.length < 3 && this.buf[this.at] >= 0x30 && this.buf[this.at] <= 0x37) {
            oct += String.fromCharCode(this.buf[this.at]); this.at++
          }
          bytes.push(parseInt(oct, 8) & 0xff)
          continue
        }
        if (n === 0x0a) continue
        if (n === 0x0d) { if (this.buf[this.at] === 0x0a) this.at++; continue }
        bytes.push(n)
        continue
      }
      if (b === 0x28) depth++
      if (b === 0x29) { depth--; if (depth === 0) { this.at++; break } }
      bytes.push(b)
      this.at++
    }
    const buf = Buffer.from(bytes)
    return this.rawStrings ? buf.toString('latin1') : decodeTextString(buf)
  }

  readHexString () {
    this.at++ // the open angle
    let hex = ''
    while (this.at < this.buf.length && this.buf[this.at] !== 0x3e) {
      const ch = String.fromCharCode(this.buf[this.at])
      if (/[0-9A-Fa-f]/.test(ch)) hex += ch
      else if (!isWhite(this.buf[this.at])) throw new Error('a hex string may only hold hex digits and whitespace')
      this.at++
    }
    this.at++ // the close angle
    if (hex.length % 2) hex += '0'
    const buf = Buffer.from(hex, 'hex')
    return this.rawStrings ? buf.toString('latin1') : decodeTextString(buf)
  }
}

export function decodeTextString (buf) {
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    let out = ''
    for (let i = 2; i + 1 < buf.length; i += 2) out += String.fromCharCode((buf[i] << 8) | buf[i + 1])
    return out
  }
  return buf.toString('latin1')
}
