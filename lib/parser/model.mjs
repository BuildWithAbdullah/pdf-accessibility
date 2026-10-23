// Turns a parsed object graph into the four views the rules need: what the
// content stream paints and in what order, what the structure tree says and in
// what order, what the annotations are, and what the document level
// declarations claim.
//
// Keeping these four separate is the point of the repository. A correct
// structure tree is not evidence of a correct content stream order, and
// test/gap.mjs asserts that in all four combinations.

import { Lexer } from './lexer.mjs'
import { Ref, UnsupportedPdf } from './parse.mjs'
import { decodeGlyphCodes } from '../encoding.mjs'

export const STANDARD_TYPES = new Set([
  'Document', 'DocumentFragment', 'Part', 'Art', 'Sect', 'Div', 'Aside', 'BlockQuote',
  'Caption', 'TOC', 'TOCI', 'Index', 'NonStruct', 'Private', 'P', 'H', 'H1', 'H2', 'H3',
  'H4', 'H5', 'H6', 'Title', 'L', 'LI', 'Lbl', 'LBody', 'Table', 'TR', 'TH', 'TD',
  'THead', 'TBody', 'TFoot', 'Span', 'Quote', 'Note', 'Reference', 'BibEntry', 'Code',
  'Link', 'Annot', 'Ruby', 'Warichu', 'RB', 'RT', 'RP', 'WT', 'WP', 'Figure', 'Formula',
  'Form', 'Em', 'Strong', 'Sub', 'FENote', 'Artifact'
])

const PATH_PAINT = new Set(['f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'S', 's', 'n'])
const TEXT_SHOW = new Set(['Tj', 'TJ', "'", '"'])

// Scans one content stream and returns the marks it paints, in paint order.
export function scanContent (file, bytes, fonts = new Map()) {
  const lexer = new Lexer(bytes, 0, { rawStrings: true })
  const marks = []
  const stack = []
  let operands = []
  let font
  let size
  let openedWithoutMcid = 0
  // The vertical position of the text matrix, which is a third order the
  // document carries: the tree order, the painting order, and where the words
  // actually are on the page. test/gap.mjs turns that into an assertion.
  let textY
  let imageY

  // The innermost open sequence, whether or not it carries an MCID. A sequence
  // with a tag and no MCID still encloses its content, so the content is not
  // untagged: it is unreachable, which is a different finding with a different
  // fix. Attributing it to both was a real defect here, and reporting one span
  // of bytes under two ids with two fixes is the thing a catalogue of one entry
  // per reason exists to prevent.
  const current = () => (stack.length ? stack[stack.length - 1] : undefined)
  const place = (kind, extra) => {
    const frame = current()
    const target = frame
      ? frame
      : { mcid: undefined, tag: undefined, artifact: false, untagged: true, text: '', ops: [] }
    if (!frame) marks.push(target)
    target.ops.push(kind)
    if (extra && extra.text !== undefined) target.text += extra.text
    if (extra && extra.size !== undefined && (target.size === undefined || extra.size > target.size)) target.size = extra.size
    if (extra && extra.font !== undefined) target.font = extra.font
    if (extra && extra.image !== undefined) target.image = extra.image
    if (extra && extra.decodable === false) target.decodable = false
    if (extra && extra.y !== undefined && target.y === undefined) target.y = extra.y
  }

  for (;;) {
    let token
    try {
      token = lexer.next()
    } catch (err) {
      throw new UnsupportedPdf('a content stream this parser cannot tokenise: ' + err.message)
    }
    if (!token) break
    if (token.type !== 'keyword') {
      operands.push(file.readFromToken(token, lexer, true))
      continue
    }
    const op = token.value
    switch (op) {
      case 'BDC': case 'BMC': {
        const tag = operands.length >= (op === 'BDC' ? 2 : 1)
          ? operands[operands.length - (op === 'BDC' ? 2 : 1)]
          : undefined
        let props = op === 'BDC' ? operands[operands.length - 1] : undefined
        if (props instanceof Ref) props = file.resolve(props)
        const tagName = tag && tag.kind === 'name' ? tag.value : undefined
        let mcid
        if (props && props.kind === 'dict' && typeof props.value.MCID === 'number') mcid = props.value.MCID
        const frame = {
          mcid,
          tag: tagName,
          props: props && props.kind === 'dict' ? props.value : undefined,
          artifact: tagName === 'Artifact',
          untagged: false,
          text: '',
          ops: []
        }
        if (mcid === undefined && tagName !== 'Artifact') openedWithoutMcid++
        stack.push(frame)
        marks.push(frame)
        break
      }
      case 'EMC':
        if (stack.length === 0) throw new UnsupportedPdf('an EMC with no matching BDC')
        stack.pop()
        break
      case 'Tf':
        font = operands.length >= 2 && operands[operands.length - 2] && operands[operands.length - 2].kind === 'name'
          ? operands[operands.length - 2].value
          : undefined
        size = typeof operands[operands.length - 1] === 'number' ? operands[operands.length - 1] : undefined
        break
      case 'cm':
        if (operands.length >= 6 && typeof operands[5] === 'number') imageY = operands[5]
        break
      case 'Tm':
        if (operands.length >= 6 && typeof operands[5] === 'number') textY = operands[5]
        break
      case 'Td': case 'TD':
        if (operands.length >= 2 && typeof operands[1] === 'number') {
          textY = (textY === undefined ? 0 : textY) + operands[1]
        }
        break
      case 'Do': {
        const xobj = operands[operands.length - 1]
        place('image', { image: xobj && xobj.kind === 'name' ? xobj.value : undefined, y: imageY })
        break
      }
      default:
        if (TEXT_SHOW.has(op)) {
          let codes = ''
          for (const operand of operands) {
            if (operand && operand.kind === 'string') codes += operand.value
            if (Array.isArray(operand)) for (const part of operand) if (part && part.kind === 'string') codes += part.value
          }
          const selected = fonts.get(font)
          const { text, decodable } = decodeGlyphCodes(
            codes,
            selected ? selected.encoding : undefined,
            selected ? selected.remapped : false
          )
          place('text', { text, size, font, decodable, y: textY })
        } else if (PATH_PAINT.has(op)) {
          place('path')
        }
        break
    }
    operands = []
  }

  if (stack.length) throw new UnsupportedPdf('a content stream that ends inside a marked content sequence')
  return { marks, openedWithoutMcid }
}

function pageContentBytes (file, page) {
  const contents = file.at(page, 'Contents')
  if (!contents) return Buffer.alloc(0)
  if (contents.kind === 'stream') return contents.body
  if (Array.isArray(contents)) {
    const parts = []
    for (const part of contents) {
      const resolved = file.resolve(part)
      if (resolved && resolved.kind === 'stream') parts.push(resolved.body, Buffer.from('\n'))
    }
    return Buffer.concat(parts)
  }
  throw new UnsupportedPdf('page /Contents is neither a stream nor an array of streams')
}

function collectPages (file, node, out, depth = 0) {
  if (depth > 32) throw new UnsupportedPdf('a page tree deeper than this parser will follow')
  const resolved = file.resolve(node)
  if (!resolved || resolved.kind !== 'dict') return
  const type = file.nameOf(resolved.value.Type)
  if (type === 'Page') { out.push(resolved); return }
  const kids = file.at(resolved, 'Kids')
  if (!Array.isArray(kids)) return
  for (const kid of kids) collectPages(file, kid, out, depth + 1)
}

export function documentModel (file) {
  const root = file.resolve(file.trailer.value.Root)
  if (!root || root.kind !== 'dict') throw new UnsupportedPdf('the catalog is not a dictionary')

  const markInfo = file.at(root, 'MarkInfo')
  const structRoot = file.at(root, 'StructTreeRoot')
  const info = file.resolve(file.trailer.value.Info)
  const viewerPrefs = file.at(root, 'ViewerPreferences')
  const acroForm = file.at(root, 'AcroForm')

  const pageDicts = []
  collectPages(file, root.value.Pages, pageDicts)

  const pages = pageDicts.map((page, index) => {
    const pageFonts = readFonts(file, [page])
    const { marks, openedWithoutMcid } = scanContent(file, pageContentBytes(file, page), pageFonts)
    const annots = []
    const annotArray = file.at(page, 'Annots')
    if (Array.isArray(annotArray)) {
      for (const entry of annotArray) {
        const ref = entry instanceof Ref ? entry.num : undefined
        const annot = file.resolve(entry)
        if (!annot || annot.kind !== 'dict') continue
        annots.push({
          objNum: ref,
          subtype: file.nameOf(annot.value.Subtype),
          fieldType: file.nameOf(annot.value.FT),
          fieldName: file.textOf(annot.value.T),
          userName: 'TU' in annot.value ? file.textOf(annot.value.TU) : undefined,
          tuPresent: 'TU' in annot.value,
          contents: 'Contents' in annot.value ? file.textOf(annot.value.Contents) : undefined,
          contentsPresent: 'Contents' in annot.value,
          flags: typeof file.resolve(annot.value.Ff) === 'number' ? file.resolve(annot.value.Ff) : 0,
          structParent: typeof file.resolve(annot.value.StructParent) === 'number'
            ? file.resolve(annot.value.StructParent)
            : undefined,
          dict: annot
        })
      }
    }
    return {
      index,
      structParents: typeof file.resolve(page.value.StructParents) === 'number'
        ? file.resolve(page.value.StructParents)
        : undefined,
      tabs: file.nameOf(page.value.Tabs),
      marks,
      openedWithoutMcid,
      annots,
      dict: page
    }
  })

  const roleMap = {}
  if (structRoot) {
    const map = file.at(structRoot, 'RoleMap')
    if (map && map.kind === 'dict') {
      for (const [from, to] of Object.entries(map.value)) roleMap[from] = file.nameOf(to)
    }
  }

  const nodes = []
  const seen = new Set()
  file.pageCount = pageDicts.length
  if (structRoot) {
    const kids = file.at(structRoot, 'K')
    const list = Array.isArray(kids) ? kids : kids === undefined ? [] : [structRoot.value.K]
    for (const kid of list) walkStruct(file, kid, null, nodes, seen, roleMap, 0)
  }

  // Resolve each node's text from the marks its MCIDs name, and record the
  // paint position of its first mark so reading order can be compared.
  //
  // The position is a single sequence number across the whole document, not an
  // index within a page. Each page's marks are numbered from zero, so
  // comparing a position on page 2 against a position on page 1 as plain
  // integers reports a correctly ordered document as misordered. That was a
  // real defect in this repository, caught by the corrected side of pair 11,
  // and the page offsets below are the fix.
  const pageOffset = []
  let runningMarks = 0
  for (const page of pages) {
    pageOffset.push(runningMarks)
    runningMarks += page.marks.length
  }

  for (const node of nodes) {
    let text = ''
    let firstPaint = Infinity
    let maxSize
    for (const entry of node.mcids) {
      const page = pages[entry.page]
      if (!page) continue
      const at = page.marks.findIndex((mark) => mark.mcid === entry.mcid)
      if (at === -1) continue
      const position = pageOffset[entry.page] + at
      if (position < firstPaint) firstPaint = position
      text += page.marks[at].text
      if (page.marks[at].y !== undefined && node.y === undefined) node.y = page.marks[at].y
      const size = page.marks[at].size
      if (size !== undefined && (maxSize === undefined || size > maxSize)) maxSize = size
    }
    node.text = text
    node.paintIndex = firstPaint === Infinity ? undefined : firstPaint
    node.fontSize = maxSize
  }
  for (const node of nodes) {
    if (node.paintIndex !== undefined) continue
    const descendant = node.descendants.find((child) => child.paintIndex !== undefined)
    if (descendant) node.paintIndex = descendant.paintIndex
  }

  const parentTree = readParentTree(file, structRoot)

  return {
    file,
    root,
    markInfoPresent: markInfo !== undefined,
    marked: markInfo && markInfo.kind === 'dict' ? markInfo.value.Marked === true : undefined,
    structTreeRootPresent: structRoot !== undefined,
    structRoot,
    lang: 'Lang' in root.value ? file.textOf(root.value.Lang) : undefined,
    langPresent: 'Lang' in root.value,
    title: info && info.kind === 'dict' && 'Title' in info.value ? file.textOf(info.value.Title) : undefined,
    titlePresent: Boolean(info && info.kind === 'dict' && 'Title' in info.value),
    displayDocTitle: viewerPrefs && viewerPrefs.kind === 'dict' ? viewerPrefs.value.DisplayDocTitle : undefined,
    acroFormPresent: acroForm !== undefined,
    roleMap,
    nodes,
    pages,
    parentTree,
    parentTreePresent: parentTree !== null,
    fonts: readFonts(file, pageDicts)
  }
}

function walkStruct (file, entry, parent, nodes, seen, roleMap, depth) {
  if (depth > 64) throw new UnsupportedPdf('a structure tree deeper than this parser will follow')
  const objNum = entry instanceof Ref ? entry.num : undefined
  if (objNum !== undefined) {
    if (seen.has(objNum)) throw new UnsupportedPdf('a structure tree that revisits an element, so it is not a tree')
    seen.add(objNum)
  }
  const resolved = file.resolve(entry)
  if (!resolved || resolved.kind !== 'dict') return
  const rawType = file.nameOf(resolved.value.S)
  if (rawType === undefined) return

  const node = {
    objNum,
    rawType,
    type: STANDARD_TYPES.has(rawType) ? rawType : (roleMap[rawType] || undefined),
    mappedThrough: STANDARD_TYPES.has(rawType) ? undefined : (roleMap[rawType] ? rawType : undefined),
    alt: 'Alt' in resolved.value ? file.textOf(resolved.value.Alt) : undefined,
    altPresent: 'Alt' in resolved.value,
    actualText: 'ActualText' in resolved.value ? file.textOf(resolved.value.ActualText) : undefined,
    id: 'ID' in resolved.value ? file.textOf(resolved.value.ID) : undefined,
    attributes: readAttributes(file, resolved),
    parent,
    depth,
    kids: [],
    descendants: [],
    mcids: [],
    objrs: [],
    order: nodes.length,
    dict: resolved
  }
  nodes.push(node)
  if (parent) parent.kids.push(node)

  const pageOf = (pgRef) => {
    const pg = file.resolve(pgRef)
    return pg
  }
  const ownPage = resolved.value.Pg

  const kids = resolved.value.K === undefined ? [] : (Array.isArray(file.resolve(resolved.value.K)) ? file.resolve(resolved.value.K) : [resolved.value.K])
  for (const kid of kids) {
    const value = kid instanceof Ref ? kid : file.resolve(kid)
    if (typeof value === 'number') {
      if (ownPage === undefined) {
        // Without /Pg there is nothing saying which page the MCID is on. On a
        // single page document the answer is forced; on a longer one it is not,
        // and attributing it to the first page would make every finding about
        // that element a guess. Refusing is the only honest option.
        if (file.pageCount > 1) {
          throw new UnsupportedPdf('a structure element names a marked content id and carries no /Pg, '
            + 'so the page it is on is not determined')
        }
        node.mcids.push({ mcid: value, page: 0 })
        continue
      }
      node.mcids.push({ mcid: value, page: pageIndexFor(file, ownPage) })
      continue
    }
    const resolvedKid = file.resolve(value)
    if (!resolvedKid || resolvedKid.kind !== 'dict') continue
    const kidType = file.nameOf(resolvedKid.value.Type)
    if (kidType === 'MCR') {
      node.mcids.push({
        mcid: file.resolve(resolvedKid.value.MCID),
        page: pageIndexFor(file, resolvedKid.value.Pg || ownPage)
      })
      continue
    }
    if (kidType === 'OBJR') {
      const obj = resolvedKid.value.Obj
      node.objrs.push({ objNum: obj instanceof Ref ? obj.num : undefined })
      continue
    }
    walkStruct(file, value, node, nodes, seen, roleMap, depth + 1)
  }

  let walker = node.parent
  while (walker) { walker.descendants.push(node); walker = walker.parent }
  void pageOf
}

let pageIndexCache = null
function pageIndexFor (file, pgRef) {
  if (!pgRef) return 0
  if (!pageIndexCache || pageIndexCache.file !== file) {
    const dicts = []
    const root = file.resolve(file.trailer.value.Root)
    collectPages(file, root.value.Pages, dicts)
    const map = new Map()
    dicts.forEach((page, index) => map.set(page, index))
    pageIndexCache = { file, map }
  }
  const resolved = file.resolve(pgRef)
  const index = pageIndexCache.map.get(resolved)
  return index === undefined ? 0 : index
}

function readAttributes (file, node) {
  const out = {}
  const collect = (value) => {
    const resolved = file.resolve(value)
    if (Array.isArray(resolved)) { for (const part of resolved) collect(part); return }
    if (!resolved || resolved.kind !== 'dict') return
    for (const [key, raw] of Object.entries(resolved.value)) {
      if (key === 'O') continue
      const inner = file.resolve(raw)
      if (inner && inner.kind === 'name') out[key] = inner.value
      else if (inner && inner.kind === 'string') out[key] = inner.value
      else if (Array.isArray(inner)) out[key] = inner.map((x) => {
        const r = file.resolve(x)
        return r && (r.kind === 'string' || r.kind === 'name') ? r.value : r
      })
      else out[key] = inner
    }
  }
  if ('A' in node.value) collect(node.value.A)
  return out
}

function readParentTree (file, structRoot) {
  if (!structRoot) return null
  if (!('ParentTree' in structRoot.value)) return null
  const tree = file.at(structRoot, 'ParentTree')
  if (!tree || tree.kind !== 'dict') return null
  const map = new Map()
  const walk = (node, depth) => {
    if (depth > 32) throw new UnsupportedPdf('a number tree deeper than this parser will follow')
    const nums = file.at(node, 'Nums')
    if (Array.isArray(nums)) {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const key = file.resolve(nums[i])
        map.set(key, file.resolve(nums[i + 1]))
      }
    }
    const kids = file.at(node, 'Kids')
    if (Array.isArray(kids)) for (const kid of kids) walk(file.resolve(kid), depth + 1)
  }
  walk(tree, 0)
  return map
}

function readFonts (file, pageDicts) {
  const out = new Map()
  for (const page of pageDicts) {
    const fonts = file.at(page, 'Resources', 'Font')
    if (!fonts || fonts.kind !== 'dict') continue
    for (const [key, raw] of Object.entries(fonts.value)) {
      const font = file.resolve(raw)
      if (!font || font.kind !== 'dict') continue
      // /Encoding is either a name or a dictionary. A dictionary carries a
      // base encoding and a /Differences array that remaps individual codes,
      // and reading only the name case silently treats a remapped font as a
      // standard one.
      const encodingValue = font.value.Encoding === undefined ? undefined : file.resolve(font.value.Encoding)
      let encoding
      let remapped = false
      if (encodingValue && encodingValue.kind === 'name') {
        encoding = encodingValue.value
      } else if (encodingValue && encodingValue.kind === 'dict') {
        encoding = file.nameOf(encodingValue.value.BaseEncoding)
        remapped = Array.isArray(file.resolve(encodingValue.value.Differences))
      }
      out.set(key, {
        resourceName: key,
        baseFont: file.nameOf(font.value.BaseFont),
        subtype: file.nameOf(font.value.Subtype),
        toUnicodePresent: 'ToUnicode' in font.value,
        encoding,
        remapped
      })
    }
  }
  return out
}
