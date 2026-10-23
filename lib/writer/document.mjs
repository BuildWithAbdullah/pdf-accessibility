// Builds a PDF from a declarative spec.
//
// Every example and fixture in this repository is a spec, not a committed
// binary. The spec goes to bytes here, the bytes go back to an object graph in
// lib/parser, and the rules in lib/rules judge that graph. So a finding is
// always derived from parsed bytes rather than from the spec that produced
// them, and a rule cannot accidentally read the author's intent.

import { ObjectTable, dict, name, str, ref, stream } from './objects.mjs'
import { encodeWinAnsi } from '../encoding.mjs'

const HEADING = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 }
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const TOP = 742
const LEFT = 56

// A content stream literal holds glyph codes, so the characters go through the
// encoding table first and the result is escaped as bytes.
function esc (text) {
  return encodeWinAnsi(text).toString('latin1')
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

// Property dictionary values such as /ActualText are text strings rather than
// glyph codes, so they do not go through the font encoding.
function escText (text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

class Painter {
  constructor () {
    this.ops = []
    this.y = TOP
    this.mcid = 0
    this.usedFonts = new Set()
    this.usedImages = new Set()
  }

  advance (by) {
    this.y -= by
    if (this.y < 72) this.y = TOP
  }

  nextMcid () {
    return this.mcid++
  }

  begin (tag, mcid, extra) {
    const props = extra ? { MCID: mcid, ...extra } : { MCID: mcid }
    const parts = Object.entries(props).map(([k, v]) => '/' + k + ' ' + (typeof v === 'number' ? v : '(' + escText(v) + ')'))
    this.ops.push('/' + tag + ' <<' + parts.join(' ') + '>> BDC')
  }

  end () {
    this.ops.push('EMC')
  }

  text (body, { size = 11, font = 'F1', x = LEFT, at } = {}) {
    this.usedFonts.add(font)
    const y = at === undefined ? this.y : at
    this.ops.push('BT /' + font + ' ' + size + ' Tf 1 0 0 1 ' + x + ' ' + y + ' Tm (' + esc(body) + ') Tj ET')
  }

  outlineText (body) {
    // Glyphs as filled rectangles: no text showing operator anywhere, which is
    // what a logo set as vector outlines or a heading converted to curves does.
    let x = LEFT
    for (let i = 0; i < String(body).length; i++) {
      this.ops.push('0 g ' + x + ' ' + this.y + ' 5 8 re f')
      x += 7
    }
  }

  image (nameId, { w = 180, h = 90 } = {}) {
    this.usedImages.add(nameId)
    this.ops.push('q ' + w + ' 0 0 ' + h + ' ' + LEFT + ' ' + (this.y - h) + ' cm /' + nameId + ' Do Q')
  }

  rule () {
    this.ops.push('0.5 w ' + LEFT + ' ' + this.y + ' m ' + (PAGE_WIDTH - LEFT) + ' ' + this.y + ' l S')
  }

  render () {
    return this.ops.join('\n') + '\n'
  }
}

export function build (spec) {
  const table = new ObjectTable()
  const pagesRef = table.reserve()
  const structRootNum = spec.structTreeRoot === false ? null : table.reserve()

  const pageSpecs = spec.pages
    ? spec.pages
    : [{ elements: spec.elements || [], contentOrder: spec.contentOrder, tabs: spec.tabs, structParents: 0 }]

  const parentTree = []            // flat [key, value, key, value, ...]
  const structChildren = []        // top level StructElem refs, document order
  const pageRefs = []
  const allFields = []
  const fontsNeeded = new Set()
  const imagesNeeded = new Set()
  let nextStructParent = pageSpecs.length

  for (let pageIndex = 0; pageIndex < pageSpecs.length; pageIndex++) {
    const page = pageSpecs[pageIndex]
    const pageNum = table.reserve()
    const contentNum = table.reserve()
    const painter = new Painter()
    const annots = []
    const mcidOwners = []        // index is MCID, value is the StructElem ref

    const elements = page.elements || []
    const order = page.contentOrder || elements.map((_, i) => i)
    if (order.length !== elements.length) throw new Error('contentOrder has to name every element exactly once')
    const seen = new Set(order)
    if (seen.size !== elements.length) throw new Error('contentOrder repeats or omits an element')

    // Paint in content order, so MCIDs are assigned in the order a reader
    // without the structure tree encounters the content.
    const built = new Array(elements.length)
    for (const index of order) {
      built[index] = paintElement(elements[index], {
        painter, table, mcidOwners, annots, allFields, pageNum, pageIndex,
        structParentFor: () => nextStructParent++, parentTree
      })
    }
    for (let index = 0; index < elements.length; index++) {
      if (built[index]) structChildren.push(...built[index])
    }

    for (const font of painter.usedFonts) fontsNeeded.add(font)
    for (const image of painter.usedImages) imagesNeeded.add(image)

    table.put(contentNum, stream({}, painter.render()))
    parentTree.push(pageIndex, mcidOwners.map((entry) => entry || null))

    pageRefs.push(ref(pageNum))
    table.put(pageNum, dict({
      Type: name('Page'),
      Parent: ref(pagesRef),
      MediaBox: [0, 0, PAGE_WIDTH, PAGE_HEIGHT],
      Contents: ref(contentNum),
      Resources: ref(0), // replaced below
      Annots: annots.length ? annots : undefined,
      Tabs: page.tabs ? name(page.tabs) : undefined,
      StructParents: structRootNum === null || page.structParents === false ? undefined : pageIndex
    }))
    page._num = pageNum
  }

  // Resources, shared by every page.
  const fontRefs = {}
  for (const font of fontsNeeded) {
    if (font === 'F2') {
      // A simple font with a custom encoding and no /ToUnicode: the glyphs
      // show, and every text extractor gets the raw codes instead of
      // characters.
      fontRefs[font] = table.add(dict({
        Type: name('Font'),
        Subtype: name('TrueType'),
        BaseFont: name('AAAAAA+ReportSans'),
        FirstChar: 32,
        LastChar: 126,
        Widths: new Array(95).fill(500),
        Encoding: table.add(dict({ Type: name('Encoding'), Differences: [32, name('g32')] }))
      }))
    } else {
      fontRefs[font] = table.add(dict({
        Type: name('Font'),
        Subtype: name('Type1'),
        BaseFont: name('Helvetica'),
        Encoding: name('WinAnsiEncoding')
      }))
    }
  }
  const xobjectRefs = {}
  for (const image of imagesNeeded) {
    xobjectRefs[image] = table.add(stream({
      Type: name('XObject'),
      Subtype: name('Image'),
      Width: 2,
      Height: 2,
      ColorSpace: name('DeviceGray'),
      BitsPerComponent: 8
    }, Buffer.from([0x20, 0x80, 0x80, 0x20])))
  }
  const resourcesRef = table.add(dict({
    Font: Object.keys(fontRefs).length ? dict(fontRefs) : undefined,
    XObject: Object.keys(xobjectRefs).length ? dict(xobjectRefs) : undefined
  }))
  for (const page of pageSpecs) {
    const body = table.bodies.get(page._num)
    body.value.Resources = resourcesRef
  }

  table.put(pagesRef, dict({ Type: name('Pages'), Kids: pageRefs, Count: pageRefs.length }))

  let structRootRef
  if (structRootNum !== null) {
    const roleMapEntries = {}
    for (const [from, to] of Object.entries(spec.roleMap || {})) roleMapEntries[from] = name(to)
    const nums = []
    for (let i = 0; i < parentTree.length; i += 2) {
      const value = parentTree[i + 1]
      nums.push(parentTree[i], Array.isArray(value) ? value : value)
    }
    structRootRef = table.put(structRootNum, dict({
      Type: name('StructTreeRoot'),
      K: spec.structRootEmpty ? [] : structChildren,
      ParentTree: spec.parentTree === false ? undefined : table.add(dict({ Nums: nums })),
      ParentTreeNextKey: nextStructParent,
      RoleMap: Object.keys(roleMapEntries).length ? dict(roleMapEntries) : undefined
    }))
  }

  const infoEntries = {}
  if (spec.title !== undefined && spec.title !== null) infoEntries.Title = str(spec.title)
  if (spec.author) infoEntries.Author = str(spec.author)
  const infoRef = Object.keys(infoEntries).length ? table.add(dict(infoEntries)) : undefined

  const acroFormRef = allFields.length
    ? table.add(dict({ Fields: allFields, NeedAppearances: true }))
    : undefined

  let markInfo
  if (spec.marked === 'false') markInfo = dict({ Marked: false })
  else if (spec.marked !== 'absent') markInfo = dict({ Marked: true })

  const catalogRef = table.add(dict({
    Type: name('Catalog'),
    Pages: ref(pagesRef),
    Lang: spec.lang === undefined ? undefined : str(spec.lang),
    MarkInfo: markInfo,
    StructTreeRoot: structRootRef,
    AcroForm: acroFormRef,
    ViewerPreferences: spec.displayDocTitle === undefined
      ? undefined
      : table.add(dict({ DisplayDocTitle: spec.displayDocTitle }))
  }))

  return table.render({ Root: catalogRef, Info: infoRef })
}

function elem (table, type, entries) {
  return table.add(dict({ Type: name('StructElem'), S: name(type), ...entries }))
}

function paintElement (el, ctx) {
  const { painter, table, mcidOwners } = ctx
  const own = (mcid, structRef) => { mcidOwners[mcid] = structRef }

  switch (el.type) {
    case 'Artifact': {
      painter.ops.push('/Artifact <</Type /Pagination>> BDC')
      if (el.rule) painter.rule(); else painter.text(el.text || 'page 1', { size: 9 })
      painter.end()
      painter.advance(el.rule ? 16 : 20)
      return []
    }
    case 'Orphan': {
      // Marked, numbered, and claimed by no structure element.
      const mcid = painter.nextMcid()
      painter.begin('P', mcid)
      painter.text(el.text, { size: 11 })
      painter.end()
      painter.advance(20)
      return []
    }
    case 'NoMcid': {
      // A tagged sequence with no MCID in its property dictionary, so there is
      // no handle for the tree to point at.
      painter.ops.push('/P <</Placement /Block>> BDC')
      painter.text(el.text, { size: 11 })
      painter.end()
      painter.advance(20)
      return []
    }
    case 'Raw': {
      // Painted with no marked content wrapper and no artifact marking, which
      // is content a tagged reader cannot place anywhere at all.
      painter.text(el.text, { size: el.size || 11 })
      painter.advance(20)
      return []
    }
    case 'Outline': {
      const mcid = painter.nextMcid()
      painter.begin(el.tag || 'P', mcid)
      painter.outlineText(el.text)
      painter.end()
      const node = elem(table, el.tag || 'P', { P: null, K: [mcid], Pg: ref(ctx.pageNum) })
      own(mcid, node)
      painter.advance(24)
      return [node]
    }
    case 'Scan': {
      const mcid = painter.nextMcid()
      painter.begin('Figure', mcid)
      painter.image('Im1', { w: 420, h: 240 })
      painter.end()
      const node = elem(table, 'Figure', {
        Alt: el.alt === undefined ? undefined : str(el.alt),
        K: [mcid],
        Pg: ref(ctx.pageNum)
      })
      own(mcid, node)
      painter.advance(260)
      return [node]
    }
    case 'Figure': {
      const mcid = painter.nextMcid()
      painter.begin('Figure', mcid)
      painter.image('Im1')
      painter.end()
      const node = elem(table, el.as || 'Figure', {
        Alt: el.alt === undefined ? undefined : str(el.alt),
        K: [mcid],
        Pg: ref(ctx.pageNum)
      })
      own(mcid, node)
      painter.advance(110)
      return [node]
    }
    case 'DecorativeImage': {
      if (el.asArtifact) {
        painter.ops.push('/Artifact <</Type /Layout>> BDC')
        painter.image('Im1', { w: 120, h: 40 })
        painter.end()
        painter.advance(56)
        return []
      }
      const mcid = painter.nextMcid()
      painter.begin('Figure', mcid)
      painter.image('Im1', { w: 120, h: 40 })
      painter.end()
      const node = elem(table, 'Figure', {
        Alt: el.alt === undefined ? undefined : str(el.alt),
        K: [mcid],
        Pg: ref(ctx.pageNum)
      })
      own(mcid, node)
      painter.advance(56)
      return [node]
    }
    case 'Table': return paintTable(el, ctx)
    case 'L': return paintList(el, ctx)
    case 'Form': return paintForm(el, ctx)
    case 'Link': return paintLink(el, ctx)
    default: {
      const type = el.type
      const mcid = painter.nextMcid()
      const size = el.size || (HEADING[type] ? 22 - HEADING[type] * 2 : 11)
      painter.begin(el.tagAs || type, mcid, el.actualText ? { ActualText: el.actualText } : undefined)
      painter.text(el.text === undefined ? '' : el.text, { size, font: el.font || 'F1', x: el.x === undefined ? LEFT : el.x, at: el.at })
      painter.end()
      const node = elem(table, type, {
        K: [mcid],
        Pg: ref(ctx.pageNum),
        Alt: el.alt === undefined ? undefined : str(el.alt)
      })
      own(mcid, node)
      painter.advance(size + 12)
      return [node]
    }
  }
}

function paintTable (el, ctx) {
  const { painter, table, mcidOwners } = ctx
  const cellRefs = new Map()
  const rowNodes = []
  const colWidth = 118

  for (const row of el.rows) {
    const cellNodes = []
    let x = LEFT
    for (const cell of row.cells) {
      const mcid = painter.nextMcid()
      const kind = cell.kind || (row.header ? 'TH' : 'TD')
      painter.begin(kind, mcid)
      painter.text(cell.text === undefined ? '' : cell.text, { size: 10, x })
      painter.end()
      const node = elem(table, kind, {
        K: [mcid],
        Pg: ref(ctx.pageNum),
        ID: cell.id ? str(cell.id) : undefined,
        A: cell.scope || cell.headers || cell.colSpan || cell.rowSpan
          ? dict({
            O: name('Table'),
            Scope: cell.scope ? name(cell.scope) : undefined,
            Headers: cell.headers ? cell.headers.map((h) => str(h)) : undefined,
            ColSpan: cell.colSpan,
            RowSpan: cell.rowSpan
          })
          : undefined
      })
      mcidOwners[mcid] = node
      if (cell.id) cellRefs.set(cell.id, node)
      cellNodes.push(node)
      x += colWidth
    }
    if (el.wrapTR === false) {
      rowNodes.push(...cellNodes)
    } else {
      rowNodes.push(elem(table, 'TR', { K: cellNodes, Pg: ref(ctx.pageNum) }))
    }
    painter.advance(20)
  }

  painter.advance(12)
  return [elem(table, el.as || 'Table', { K: rowNodes, Pg: ref(ctx.pageNum) })]
}

function paintList (el, ctx) {
  const { painter, table, mcidOwners } = ctx
  if (el.asParagraphs) {
    // A visual list: a bullet character typed at the start of a paragraph.
    const nodes = []
    for (const item of el.items) {
      const mcid = painter.nextMcid()
      painter.begin('P', mcid)
      painter.text(item, { size: 11 })
      painter.end()
      const node = elem(table, 'P', { K: [mcid], Pg: ref(ctx.pageNum) })
      mcidOwners[mcid] = node
      nodes.push(node)
      painter.advance(18)
    }
    painter.advance(8)
    return nodes
  }
  const itemNodes = []
  for (const item of el.items) {
    const mcid = painter.nextMcid()
    painter.begin('LBody', mcid)
    painter.text(item, { size: 11 })
    painter.end()
    const body = elem(table, 'LBody', { K: [mcid], Pg: ref(ctx.pageNum) })
    mcidOwners[mcid] = body
    itemNodes.push(elem(table, 'LI', { K: [body], Pg: ref(ctx.pageNum) }))
    painter.advance(18)
  }
  painter.advance(8)
  return [elem(table, 'L', { K: itemNodes, Pg: ref(ctx.pageNum) })]
}

function paintForm (el, ctx) {
  const { painter, table, annots, allFields } = ctx
  const nodes = []

  for (const field of el.fields) {
    if (field.label !== undefined) {
      const mcid = painter.nextMcid()
      painter.begin('P', mcid)
      painter.text(field.label, { size: 10 })
      painter.end()
      const labelNode = elem(table, 'P', { K: [mcid], Pg: ref(ctx.pageNum) })
      ctx.mcidOwners[mcid] = labelNode
      nodes.push(labelNode)
      painter.advance(16)
    }

    const widgetNum = table.reserve()
    const structParent = field.structParent === false ? null : ctx.structParentFor()
    const formNode = elem(table, 'Form', {
      K: field.structParent === false ? [] : [dict({ Type: name('OBJR'), Obj: ref(widgetNum), Pg: ref(ctx.pageNum) })],
      Pg: ref(ctx.pageNum),
      Alt: field.alt === undefined ? undefined : str(field.alt)
    })
    if (structParent !== null) ctx.parentTree.push(structParent, formNode)

    table.put(widgetNum, dict({
      Type: name('Annot'),
      Subtype: name('Widget'),
      Rect: [LEFT, painter.y - 18, LEFT + 220, painter.y + 2],
      FT: name(field.ft || 'Tx'),
      T: field.name === undefined ? undefined : str(field.name),
      TU: field.tu === undefined ? undefined : str(field.tu),
      Ff: field.required ? 2 : undefined,
      F: 4,
      P: ref(ctx.pageNum),
      StructParent: structParent === null ? undefined : structParent
    }))
    annots.push(ref(widgetNum))
    allFields.push(ref(widgetNum))
    nodes.push(formNode)
    painter.advance(34)
  }

  return nodes
}

function paintLink (el, ctx) {
  const { painter, table, annots } = ctx
  const mcid = painter.nextMcid()
  painter.begin('Link', mcid)
  painter.text(el.text, { size: 11 })
  painter.end()

  const annotNum = table.reserve()
  const structParent = el.inStructure === false ? null : ctx.structParentFor()
  const node = elem(table, 'Link', {
    K: [mcid, dict({ Type: name('OBJR'), Obj: ref(annotNum), Pg: ref(ctx.pageNum) })],
    Pg: ref(ctx.pageNum)
  })
  ctx.mcidOwners[mcid] = node
  if (structParent !== null) ctx.parentTree.push(structParent, node)

  table.put(annotNum, dict({
    Type: name('Annot'),
    Subtype: name('Link'),
    Rect: [LEFT, painter.y - 4, LEFT + 200, painter.y + 12],
    Border: [0, 0, 0],
    A: dict({ S: name('URI'), URI: str(el.uri || 'https://example.invalid/') }),
    Contents: el.contents === undefined ? undefined : str(el.contents),
    StructParent: structParent === null ? undefined : structParent
  }))
  annots.push(ref(annotNum))
  painter.advance(22)
  return [node]
}
