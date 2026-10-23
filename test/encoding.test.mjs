import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeWinAnsi, decodeGlyphCodes, Unencodable, WINANSI_TO_UNICODE, UNICODE_TO_WINANSI } from '../lib/encoding.mjs'

const BULLET = String.fromCharCode(0x2022)
const EM_DASH = String.fromCharCode(0x2014)
const RIGHT_QUOTE = String.fromCharCode(0x2019)
const ARABIC_ALEF = String.fromCharCode(0x0627)

test('the characters an author actually types survive a round trip', () => {
  for (const char of [BULLET, EM_DASH, RIGHT_QUOTE, String.fromCharCode(0x2026)]) {
    const bytes = encodeWinAnsi(char)
    assert.equal(bytes.length, 1)
    assert.equal(decodeGlyphCodes(bytes.toString('latin1'), 'WinAnsiEncoding').text, char)
  }
})

test('the bullet is not the quotation mark, which is what a Latin 1 write would make it', () => {
  // This is the defect the module exists to prevent: 0x2022 truncated to one
  // byte is 0x22, which is a double quote, so a fixture whose source says it
  // holds a bullet holds a quotation mark instead.
  assert.equal(encodeWinAnsi(BULLET)[0], 0x95)
  assert.notEqual(encodeWinAnsi(BULLET)[0], 0x22)
})

test('a character with no code raises rather than being substituted', () => {
  assert.throws(() => encodeWinAnsi(ARABIC_ALEF), Unencodable)
  assert.throws(() => encodeWinAnsi('a' + ARABIC_ALEF + 'b'), /U\+0627/)
})

test('plain ASCII is unchanged in both directions', () => {
  const text = 'Nitrate fell in every reach (2019 to 2025).'
  assert.equal(encodeWinAnsi(text).toString('latin1'), text)
  assert.equal(decodeGlyphCodes(text, 'WinAnsiEncoding').text, text)
})

test('an encoding this module does not know is reported as undecodable rather than guessed', () => {
  const result = decodeGlyphCodes('abc', 'Identity-H')
  assert.equal(result.decodable, false)
  assert.equal(result.text, '')
})

test('an undefined encoding is treated as the implied standard one', () => {
  assert.equal(decodeGlyphCodes('abc', undefined).decodable, true)
})

test('the two tables are inverses of each other wherever both are defined', () => {
  for (const [code, char] of WINANSI_TO_UNICODE) {
    assert.equal(UNICODE_TO_WINANSI.get(char), code, 'round trip failed for code ' + code)
  }
})

test('the undefined WinAnsi positions are absent rather than mapped to control characters', () => {
  for (const code of [0x81, 0x8d, 0x8f, 0x90, 0x9d]) {
    assert.equal(WINANSI_TO_UNICODE.has(code), false, 'code ' + code.toString(16) + ' should be undefined')
  }
})
