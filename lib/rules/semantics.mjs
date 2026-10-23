// Headings, lists and figures: the elements whose whole value is the meaning
// they carry rather than the pixels they produce.

import { marksFor } from './content.mjs'

const LEVEL = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 }
const PLACEHOLDER = /^(image|img|graphic|picture|photo|photograph|chart|graph|figure|logo|icon|screenshot|diagram|spacer|decorative)\b[\s.:0-9-]*$/i
const FILENAME = /\.(png|jpe?g|gif|svg|tiff?|bmp|webp|emf|wmf|eps)$/i
const BULLET = /^\s*([•‣▪●·*-]|\(?\d{1,2}[.)]|[a-z][.)])\s+\S/

export const headings = {
  id: 'headings',
  title: 'Headings are the document outline, and the outline is how anybody navigates a long PDF',
  findings: {
    'headings.absent': {
      title: 'A tagged document with no heading element anywhere',
      why: 'The heading list is the only navigation a screen reader user has in a PDF. There are no landmarks and no skip links. A document with no headings has to be read from the top every time.',
      fix: 'Tag the headings that are already visually there. Almost every document has them.',
      limit: 'A short document genuinely has none, so this is a prompt rather than a verdict. It also cannot tell a document with no headings from one whose headings are tagged as paragraphs, which is a separate finding below.'
    },
    'headings.first.not.top': {
      title: 'The first heading in the document is not an H1',
      why: 'A reader jumping to the first heading lands part way down an outline that has no top. In a document set where each file starts at H2 because the H1 lived in a template, the structure reads as a fragment of something else.',
      fix: 'Promote the document title to H1, or demote the rest so the outline starts at the top.',
      limit: 'This looks at the first heading in tree order. A document that is genuinely one section of a larger work can be correct and will still be reported.'
    },
    'headings.level.skipped': {
      title: 'A heading level is skipped',
      why: 'H1 followed by H3 tells a reader there is a missing section between them. They cannot tell a skipped level from a section whose heading was not tagged, so they go looking for content that is not there.',
      fix: 'Use the next level down, and if the visual size is the reason for the jump, change the styling rather than the level.',
      limit: 'Only descent is checked. Returning from H3 to H2 to start a new section is correct and is not reported.'
    },
    'headings.empty': {
      title: 'A heading element with no text',
      why: 'It appears in the heading list as a blank entry. A user navigating by heading lands on it, hears nothing, and has no way to know whether the problem is the document or their software.',
      fix: 'Put the heading text inside the element, or remove the element.',
      limit: 'Text held only in /ActualText is treated as text here. A heading whose text is an image with an /Alt is not caught.'
    },
    'headings.visual.only': {
      title: 'Text is painted much larger than the body text and tagged as a paragraph',
      why: 'This is a heading everywhere except in the structure tree. It is the most common reason a document with visible headings has an empty heading list, and the document looks completely correct on screen.',
      fix: 'Change the element type to the heading level the size implies.',
      limit: 'This infers intent from font size against the most common size on the page, so a pull quote or a large opening line is a false positive. It cannot see bold, colour or position, which are the other ways a heading is signalled.'
    }
  },
  check (model) {
    if (!model.structTreeRootPresent) return []
    const out = []
    const headingNodes = model.nodes.filter((node) => LEVEL[node.type] !== undefined)

    if (headingNodes.length === 0) {
      out.push({ id: 'headings.absent', where: 'structure tree' })
    } else {
      if (LEVEL[headingNodes[0].type] !== 1) {
        out.push({ id: 'headings.first.not.top', where: 'first heading is ' + headingNodes[0].type })
      }
      let previous = LEVEL[headingNodes[0].type]
      for (let i = 1; i < headingNodes.length; i++) {
        const level = LEVEL[headingNodes[i].type]
        if (level > previous + 1) {
          out.push({ id: 'headings.level.skipped', where: headingNodes[i - 1].type + ' followed by ' + headingNodes[i].type })
          break
        }
        previous = level
      }
      for (const node of headingNodes) {
        const text = (node.text || '').trim() || (node.actualText || '').trim()
        if (text === '') out.push({ id: 'headings.empty', where: node.type + ' at tree position ' + node.order })
      }
    }

    const body = bodySize(model)
    if (body !== undefined) {
      for (const node of model.nodes) {
        if (node.type !== 'P') continue
        if (node.fontSize !== undefined && node.fontSize >= body * 1.5 && (node.text || '').trim() !== '') {
          out.push({ id: 'headings.visual.only', where: 'paragraph set at ' + node.fontSize + ' point against a body of ' + body })
        }
      }
    }
    return out
  }
}

function bodySize (model) {
  const counts = new Map()
  for (const page of model.pages) {
    for (const mark of page.marks) {
      if (!mark.ops.includes('text') || mark.size === undefined) continue
      counts.set(mark.size, (counts.get(mark.size) || 0) + 1)
    }
  }
  if (counts.size === 0) return undefined
  let best
  let bestCount = -1
  for (const [size, count] of counts) {
    if (count > bestCount || (count === bestCount && size < best)) { best = size; bestCount = count }
  }
  return best
}

export const lists = {
  id: 'lists',
  title: 'A list that is a list only visually is a list to nobody',
  findings: {
    'lists.visual.only': {
      title: 'Consecutive paragraphs whose text begins with a bullet or a number',
      why: 'A real list tells a reader how many items there are and which one they are on. Typed bullets give them a paragraph that starts with a punctuation character, read out as the character, with no count and no position.',
      fix: 'Tag the group as /L with an /LI and an /LBody for each item, and move the marker into /Lbl or drop it.',
      limit: 'Two consecutive items are enough to fire here, so a paragraph that genuinely opens with a dash followed by another one is a false positive. Numbered steps written as sentences are not caught at all.'
    }
  },
  check (model) {
    const out = []
    const paragraphs = model.nodes.filter((node) => node.type === 'P')
    let run = 0
    let startedAt
    for (let i = 0; i < paragraphs.length; i++) {
      const adjacent = i > 0 && paragraphs[i].order === paragraphs[i - 1].order + 1
      if (BULLET.test(paragraphs[i].text || '')) {
        run = adjacent && run > 0 ? run + 1 : 1
        if (run === 1) startedAt = paragraphs[i].order
        if (run === 2) out.push({ id: 'lists.visual.only', where: 'paragraphs at tree positions ' + startedAt + ' onward' })
      } else {
        run = 0
      }
    }
    return out
  }
}

export const figures = {
  id: 'figures',
  title: 'A figure needs a replacement, and the replacement has to be worth hearing',
  findings: {
    'figures.alt.absent': {
      title: 'A /Figure element with no /Alt',
      why: 'The image is announced as a figure with nothing after it. A reader cannot tell whether they have missed something important or nothing at all, which is worse than either.',
      fix: 'Add /Alt describing what the image conveys in this context, or mark the image /Artifact if it conveys nothing.',
      limit: 'Presence of /Alt is checkable and usefulness is not. Everything past this point in this rule is a heuristic.'
    },
    'figures.alt.empty': {
      title: 'A /Figure element with an empty /Alt',
      why: 'In HTML an empty alt is the correct way to hide a decorative image. In a tagged PDF it is not: the figure is still in the tree and is still announced, now with nothing to say. The equivalent of an empty alt here is /Artifact.',
      fix: 'Write a real /Alt, or take the image out of the tree with /Artifact.',
      limit: 'This is the one finding in this rule whose fix most often changes the structure rather than the text, which is why it is separated from the absent case.'
    },
    'figures.alt.placeholder': {
      title: 'An /Alt that names the medium rather than the content',
      why: 'Values like "image", "chart" or "logo.png" are what a tool writes when it is asked to fill the field. They pass every presence check, so a document can be reported fully described while every description is the word "image".',
      fix: 'Describe what the image shows and why it is on the page.',
      limit: 'This matches a list of known placeholder words and filename extensions, so "Chart" alone is caught and "A chart" is not. A bad description in fluent prose passes.'
    },
    'figures.alt.repeats.caption': {
      title: 'An /Alt that repeats the caption next to it',
      why: 'The reader hears the same sentence twice, once as the image and once as the caption, and still does not know what the image shows. The caption says what the figure is called; the /Alt has to say what is in it.',
      fix: 'Keep the caption and rewrite the /Alt to carry the content, or, when the caption really is the full description, mark the image /Artifact so it is not read twice.',
      limit: 'Only an adjacent /Caption element is compared. A caption that is a plain paragraph under the image is not recognised as a caption.'
    },
    'figures.alt.verbose': {
      title: 'An /Alt longer than 250 characters',
      why: 'There is no way to pause, skip or re-read inside an /Alt. A description that runs to a paragraph is listened to once, at speed, with no way back, which is why long descriptions belong in the page text.',
      fix: 'Put a short identification in /Alt and the detail in the document body, where it can be navigated. For a chart that usually means a table of the data.',
      limit: 'The threshold is a judgement, not a rule from the specification. A complex diagram may need more, and this will report it.'
    }
  },
  check (model) {
    const out = []
    for (const node of model.nodes) {
      if (node.type !== 'Figure') continue
      const where = 'figure at tree position ' + node.order
      if (!node.altPresent) { out.push({ id: 'figures.alt.absent', where }); continue }
      const alt = node.alt === undefined ? '' : node.alt
      if (alt.trim() === '') { out.push({ id: 'figures.alt.empty', where }); continue }
      if (PLACEHOLDER.test(alt.trim()) || FILENAME.test(alt.trim())) {
        out.push({ id: 'figures.alt.placeholder', where })
      }
      if (alt.length > 250) out.push({ id: 'figures.alt.verbose', where })
      const caption = adjacentCaption(model, node)
      if (caption !== undefined && normalise(caption) === normalise(alt)) {
        out.push({ id: 'figures.alt.repeats.caption', where })
      }
      void marksFor
    }
    return out
  }
}

function normalise (text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function adjacentCaption (model, node) {
  for (const candidate of model.nodes) {
    if (candidate.type !== 'Caption') continue
    if (Math.abs(candidate.order - node.order) <= 2) return candidate.text
  }
  return undefined
}
