// What the page actually paints, whether the structure tree reaches it, and in
// what order the two say it should be read.

export const coverage = {
  id: 'coverage',
  title: 'Every mark on the page has to be reachable from the structure tree, or declared as decoration',
  findings: {
    'coverage.untagged.content': {
      title: 'Content is painted outside any marked content sequence and is not an artifact',
      why: 'A reader walking the structure tree never encounters this content, and a reader walking the content stream has no idea what it is. It is the one failure mode that a tagged document and an untagged document do not share: in an untagged file everything is read, here it is silently dropped.',
      fix: 'Wrap it in a BDC with an MCID and claim that MCID from a structure element, or mark it /Artifact if it is decoration.',
      limit: 'Dropped content is invisible to a reader, so no screen reader test will find it either. This is one of the few findings here that only a file level check can produce.'
    },
    'coverage.marked.without.mcid': {
      title: 'A marked content sequence carries a tag and no MCID',
      why: 'Without an MCID there is no handle for a structure element to point at, so the sequence looks tagged and is unreachable. It is the shape a tagging tool leaves when it marks up the content before building the tree.',
      fix: 'Give the sequence an MCID in its property dictionary and reference it from the element that owns it.',
      limit: 'A sequence with an MCID that nothing claims is a separate finding below, because the fix is different: this one is a content stream edit and that one is a tree edit.'
    },
    'coverage.orphan.mcid': {
      title: 'An MCID is painted that no structure element claims',
      why: 'The content is marked, numbered and unreferenced, so it is read by nothing. Unlike untagged content it will show up in a content stream dump, which is why it survives review.',
      fix: 'Add the MCID to the /K of the element it belongs to, or remove the marking and make it an artifact.',
      limit: 'This compares the MCIDs painted on a page against the MCIDs the tree names. It cannot say whether the element that should have claimed it exists at all.'
    },
    'coverage.parenttree.absent': {
      title: 'No /ParentTree on the structure tree root',
      why: 'The tree points down at content and the /ParentTree is the only way back up. Without it a reader that starts from a point on the page, which is what happens on a click, a find, or a touch, cannot discover what the content is.',
      fix: 'Build the /ParentTree as a number tree keyed by each page /StructParents and each annotation /StructParent.',
      limit: 'Presence is all that is checked here. Whether every key resolves to the right element is the orphan finding above, from the other direction.'
    }
  },
  check (model) {
    const out = []
    if (!model.structTreeRootPresent) return out
    if (!model.parentTreePresent) out.push({ id: 'coverage.parenttree.absent', where: 'StructTreeRoot' })

    const claimed = new Set()
    for (const node of model.nodes) {
      for (const entry of node.mcids) claimed.add(entry.page + ':' + entry.mcid)
    }

    for (const page of model.pages) {
      if (page.openedWithoutMcid > 0) {
        out.push({ id: 'coverage.marked.without.mcid', where: 'page ' + (page.index + 1) })
      }
      for (const mark of page.marks) {
        if (mark.ops.length === 0) continue
        if (mark.untagged) {
          out.push({ id: 'coverage.untagged.content', where: 'page ' + (page.index + 1) })
          continue
        }
        if (mark.artifact || mark.mcid === undefined) continue
        if (!claimed.has(page.index + ':' + mark.mcid)) {
          out.push({ id: 'coverage.orphan.mcid', where: 'page ' + (page.index + 1) + ' MCID ' + mark.mcid })
        }
      }
    }
    return out
  }
}

export const readingOrder = {
  id: 'reading-order',
  title: 'The structure tree order and the painting order are two orders, and both are read',
  findings: {
    'order.structure.diverges': {
      title: 'The structure tree order and the content stream order disagree',
      why: 'Tagged readers follow the tree. Text extraction, copy and paste, reflow on a small screen, search result context and most untagged fallbacks follow the content stream. When the two disagree one of those populations gets the document in the wrong order, and which population depends on the tool rather than on the file.',
      fix: 'Reorder the content stream to match the tree. Reordering the tree instead moves the problem rather than fixing it, because the content stream order is the one the author cannot see.',
      limit: 'Agreement between the two orders does not make either order right. Both can be wrong together, which is the normal outcome of a multi column layout exported straight from a page layout tool.'
    },
    'order.page.structparents.absent': {
      title: 'A page paints marked content and has no /StructParents',
      why: 'The /StructParents number is the key into the /ParentTree for everything on the page. Without it the content is reachable from the tree downward and from nowhere upward, so clicking a word tells a reader nothing.',
      fix: 'Give the page a /StructParents whose value is its key in the /ParentTree.',
      limit: 'A present /StructParents whose key is missing from the /ParentTree is a different defect and is not separated out here.'
    }
  },
  check (model) {
    const out = []
    if (!model.structTreeRootPresent) return out

    for (const page of model.pages) {
      const hasMarkedContent = page.marks.some((mark) => mark.mcid !== undefined)
      if (hasMarkedContent && page.structParents === undefined) {
        out.push({ id: 'order.page.structparents.absent', where: 'page ' + (page.index + 1) })
      }
    }

    const placed = model.nodes
      .filter((node) => node.mcids.length > 0 && node.paintIndex !== undefined)
      .sort((a, b) => a.order - b.order)
    for (let i = 1; i < placed.length; i++) {
      if (placed[i].paintIndex < placed[i - 1].paintIndex) {
        out.push({ id: 'order.structure.diverges', where: 'structure element ' + placed[i].rawType + ' at tree position ' + i })
        break
      }
    }
    return out
  }
}

export const textLayer = {
  id: 'text-layer',
  title: 'There has to be text, and it has to map back to characters',
  findings: {
    'text.layer.absent': {
      title: 'A page paints an image and no text at all',
      why: 'This is a scan. There is nothing to read, nothing to search and nothing to select, and no amount of tagging changes that. It is also the single most common reason a PDF cannot be made accessible in the PDF.',
      fix: 'Run recognition over the page and check the result by hand, or go back to the source document. Recognition output is a draft, not a fix.',
      needsSource: true,
      limit: 'A page of pure illustration with a caption on the facing page is a false positive. More importantly, this finding cannot tell a scan apart from a page whose text is drawn as paths, which is the finding below.'
    },
    'text.as.paths': {
      title: 'A structure element paints paths and no text',
      why: 'Headings converted to outlines, logos with the company name in them and equations exported as vectors all look like text and extract as nothing. The element is tagged, so a checker sees a correctly tagged heading with no content.',
      fix: 'Put the characters back, as real text, or carry them in /ActualText on the element so extraction has something to return.',
      needsSource: true,
      limit: 'A genuine diagram tagged as a figure paints paths and no text too, so this fires on correct documents. The element type is what separates them, and this check does not look at how the paths are arranged.'
    },
    'text.unicode.unmappable': {
      title: 'Text is shown in a font with no /ToUnicode and a non standard base font',
      why: 'The glyphs render and extraction returns the raw character codes, so copy and paste, search and every screen reader produce rubbish. The page looks perfect, which is why this survives visual review.',
      fix: 'Embed a /ToUnicode CMap for the font, or use /ActualText on the elements that use it.',
      needsSource: true,
      limit: 'The standard 14 fonts are exempt here because a reader can map them from their encoding. A subset font with a /ToUnicode that is itself wrong passes this check.'
    }
  },
  check (model) {
    const out = []
    for (const page of model.pages) {
      const paintsText = page.marks.some((mark) => mark.ops.includes('text'))
      const paintsImage = page.marks.some((mark) => mark.ops.includes('image'))
      if (paintsImage && !paintsText) {
        out.push({ id: 'text.layer.absent', where: 'page ' + (page.index + 1) })
      }
    }

    for (const node of model.nodes) {
      if (node.mcids.length === 0) continue
      const marks = marksFor(model, node)
      if (marks.length === 0) continue
      const paintsPath = marks.some((mark) => mark.ops.includes('path'))
      const paintsText = marks.some((mark) => mark.ops.includes('text'))
      if (paintsPath && !paintsText && node.actualText === undefined && node.type !== 'Figure' && node.type !== 'Formula') {
        out.push({ id: 'text.as.paths', where: 'structure element ' + node.rawType })
      }
    }

    const standard = /^(Helvetica|Courier|Times|Symbol|ZapfDingbats)/
    const used = new Set()
    for (const page of model.pages) {
      for (const mark of page.marks) if (mark.ops.includes('text') && mark.font) used.add(mark.font)
    }
    for (const resourceName of used) {
      const font = model.fonts.get(resourceName)
      if (!font) continue
      if (font.toUnicodePresent) continue
      const base = (font.baseFont || '').replace(/^[A-Z]{6}\+/, '')
      if (standard.test(base)) continue
      out.push({ id: 'text.unicode.unmappable', where: 'font ' + resourceName })
    }
    return out
  }
}

export const artifacts = {
  id: 'artifacts',
  title: 'Page furniture has to be marked as furniture',
  findings: {
    'artifacts.running.tagged': {
      title: 'The same text is tagged as content on every page',
      why: 'A running header or a page number tagged as a paragraph is read out between the last sentence of one page and the first of the next, every time. On a forty page document that is forty interruptions, and each one sounds like part of the text.',
      fix: 'Mark running headers, footers, page numbers and decorative rules as /Artifact so they stay out of the structure tree.',
      limit: 'This needs at least two pages and identical text to fire, so a header that includes the page number in its string will not be caught. Repeated content on a single page is not considered.'
    }
  },
  check (model) {
    if (model.pages.length < 2) return []
    const perPage = model.pages.map(() => new Set())
    for (const node of model.nodes) {
      if (node.type !== 'P' && node.type !== 'Span') continue
      const text = (node.text || '').trim()
      if (text === '') continue
      for (const entry of node.mcids) {
        if (perPage[entry.page]) perPage[entry.page].add(text)
      }
    }
    const counts = new Map()
    for (const set of perPage) for (const text of set) counts.set(text, (counts.get(text) || 0) + 1)
    const out = []
    for (const [text, count] of counts) {
      if (count === model.pages.length) {
        out.push({ id: 'artifacts.running.tagged', where: 'repeated on all ' + count + ' pages: ' + text.slice(0, 24) })
      }
    }
    return out
  }
}

export function marksFor (model, node) {
  const out = []
  for (const entry of node.mcids) {
    const page = model.pages[entry.page]
    if (!page) continue
    const mark = page.marks.find((candidate) => candidate.mcid === entry.mcid)
    if (mark) out.push(mark)
  }
  return out
}
