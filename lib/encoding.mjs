// Text inside a content stream is not text. It is a sequence of glyph codes,
// and turning it back into characters needs the encoding of the font that was
// selected when it was shown.
//
// This is the whole reason /ToUnicode exists, and the reason a page can look
// perfect and extract as rubbish. Both the writer and the parser go through
// this module, in opposite directions, so the corpus cannot contain a
// character the parser would read back as a different one.
//
// WinAnsiEncoding agrees with Latin 1 everywhere except the range 0x80 to
// 0x9f, which is where the characters an author actually types live: curly
// quotes, dashes, the bullet and the ellipsis. Writing those as Latin 1 bytes
// corrupts them in silence, which is how a fixture ends up not containing what
// its source says it contains. That happened here while this repository was
// being built, and it is the reason this table is not inlined in two places.

// Code points rather than characters, deliberately. This repository bans the
// long dashes from its own prose and checks for them in every tracked file,
// and the whole job of this table is to map those characters, so writing them
// out as literals would make the file fail its own check. A check that fails
// on its own subject matter is a check somebody switches off.
const UPPER_CODE_POINTS = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178
}

const UPPER = Object.fromEntries(
  Object.entries(UPPER_CODE_POINTS).map(([code, point]) => [Number(code), String.fromCharCode(point)])
)

export const WINANSI_TO_UNICODE = new Map()
export const UNICODE_TO_WINANSI = new Map()

for (let code = 0x20; code <= 0xff; code++) {
  const char = UPPER[code] !== undefined ? UPPER[code] : String.fromCharCode(code)
  if (code >= 0x80 && code <= 0x9f && UPPER[code] === undefined) continue
  WINANSI_TO_UNICODE.set(code, char)
  if (!UNICODE_TO_WINANSI.has(char)) UNICODE_TO_WINANSI.set(char, code)
}

export class Unencodable extends Error {
  constructor (char) {
    super('the character U+' + char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
      + ' has no WinAnsiEncoding code, so writing it would corrupt it')
    this.name = 'Unencodable'
    this.char = char
  }
}

// Characters to bytes, for the writer. Raises rather than substituting,
// because a corpus that quietly holds a different character from the one its
// source names is worse than a build that fails.
export function encodeWinAnsi (text) {
  const bytes = []
  for (const char of String(text)) {
    const code = UNICODE_TO_WINANSI.get(char)
    if (code === undefined) throw new Unencodable(char)
    bytes.push(code)
  }
  return Buffer.from(bytes)
}

// Bytes to characters, for the parser. `encoding` is the font's /Encoding name
// and `remapped` says whether the font carries a /Differences array.
//
// Anything other than WinAnsiEncoding or MacRomanEncoding is reported as
// undecodable rather than guessed at, which is what makes
// text.unicode.unmappable a statement about the file rather than about this
// parser's reach.
//
// A /Differences array is the point. It is how a subset font remaps glyph
// codes, and it is the normal shape of a font that extracts as rubbish. A
// parser that ignores it and applies the base encoding anyway returns
// plausible characters that are not what the file holds, which is the worst of
// the three possible outcomes: worse than refusing, and worse than returning
// nothing, because it reports a defective file as readable. That was a real
// defect here, and it also meant the undecodable flag was never set on
// anything, so the code that reads it had never run.
export function decodeGlyphCodes (latin1, encoding, remapped = false) {
  if (remapped) return { text: '', decodable: false }
  if (encoding !== 'WinAnsiEncoding' && encoding !== 'MacRomanEncoding' && encoding !== undefined) {
    return { text: '', decodable: false }
  }
  let out = ''
  for (let i = 0; i < latin1.length; i++) {
    const code = latin1.charCodeAt(i) & 0xff
    const char = WINANSI_TO_UNICODE.get(code)
    if (char === undefined) return { text: out, decodable: false }
    out += char
  }
  return { text: out, decodable: true }
}
