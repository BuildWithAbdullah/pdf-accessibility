// What this repository cannot establish.
//
// Every statement here is asserted in test/gap.mjs, and four of the five are
// asserted in both directions, which means the sentence fails the build if it
// stops being true as well as if it was never true. A limit written as a
// paragraph is a claim. A limit written as an assertion is a fact, and the
// difference is the whole reason this file exists.

export const LIMITS = [
  {
    id: 'subset',
    claim: 'Every finding here is proven against a PDF this repository wrote, which is an uncompressed subset: a classic cross reference table, no object streams, no stream filters and no encryption. A file from a real authoring tool is usually outside that subset.',
    consequence: 'The parser raises rather than reading around what it does not understand, so a file this repository cannot judge is never reported as clean. That is the only safe behaviour, and it is also a hard boundary on what the repository is evidence about.',
    assertedBothWays: true
  },
  {
    id: 'clean-is-not-conforming',
    claim: 'A document can produce no findings at all and still be unusable. The clearest case is a description that is fluent, specific, well formed and about a different image.',
    consequence: 'Nothing in this repository is a conformance claim. A clean result means the structural facts it checks are in order, which is a necessary condition and nowhere near a sufficient one.',
    assertedBothWays: false
  },
  {
    id: 'orders-are-independent',
    claim: 'A document carries three orders: the structure tree order, the content stream painting order, and where the words sit on the page. This repository reports a disagreement between the first two. That verdict is not even weak evidence about whether the document reads correctly.',
    consequence: 'A two column layout exported straight from a page layout tool has a tree and a content stream that agree with each other and disagree with the page, so it is reported clean and is misordered for every reader. The reverse case is reported and is correct for the audience the tags exist for.',
    assertedBothWays: true
  },
  {
    id: 'heuristics-report-correct-documents',
    claim: 'Some findings infer intent from the shape of a string or the size of a glyph. Those cannot be right in general, and this repository names which ones they are rather than presenting all fifty as equivalent.',
    consequence: 'A document that is correct by intent will be reported by each of them. The judgement is that the pattern each one catches is more common than the document it misreads, and that judgement is the reader of this repository to accept or reject.',
    assertedBothWays: true
  },
  {
    id: 'some-fixes-are-not-in-the-pdf',
    claim: 'Three findings name defects that cannot be repaired in the PDF: a page with no text layer, text drawn as paths, and a font with no mapping back to characters. The bytes that would carry the answer are not in the file.',
    consequence: 'The fix is to rebuild the document from its source. Repairing those in the PDF produces a file that passes a checker and still cannot be read, which is a worse outcome than the original because it now looks finished.',
    assertedBothWays: true
  }
]

export const LIMIT_IDS = LIMITS.map((limit) => limit.id)

// The findings that infer intent rather than reading a structural fact. Named
// here rather than inferred, and asserted in test/gap.mjs by building a
// document that is correct by intent and is reported by each one.
export const HEURISTIC_IDS = [
  'title.filename',
  'headings.visual.only',
  'figures.alt.placeholder',
  'figures.alt.verbose',
  'lists.visual.only',
  'tables.layout.single.column',
  'links.text.is.url'
]

// A document that produces no findings and is wrong anyway. The description is
// fluent, specific and about a different image, and nothing in a PDF can say
// so. Used by test/gap.mjs to assert the second limit above.
export const CLEAN_AND_WRONG = {
  lang: 'en-US',
  title: 'Water quality in the lower catchment',
  displayDocTitle: true,
  elements: [
    { type: 'H1', text: 'Water quality in the lower catchment' },
    { type: 'P', text: 'Nitrate concentrations fell in every reach measured.', size: 11 },
    // The image is a bar chart of nitrate by reach.
    { type: 'Figure', alt: 'A photograph of the weir at reach 3, looking downstream in low water.' }
  ]
}

// Four documents reaching all four combinations of the two order verdicts.
//
// Verdict A is what this repository reports: does the structure tree order
// agree with the content stream painting order. Verdict B is independent of
// it: does the structure tree order agree with where the content sits on the
// page, top to bottom.
//
// The case that matters is agree-and-wrong. Both orders inside the file agree
// with each other, so nothing is reported, and both disagree with the page, so
// the document is misordered for everybody including a tagged reader.
export const ORDER_CASES = {
  // The tree, the stream and the page all agree.
  'agree-and-right': {
    lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
    elements: [
      { type: 'H1', text: 'Catchment survey', at: 740 },
      { type: 'P', text: 'First paragraph.', size: 11, at: 700 },
      { type: 'P', text: 'Second paragraph.', size: 11, at: 660 }
    ]
  },
  // The tree and the stream agree and both run against the page: the second
  // paragraph is printed above the first. Nothing is reported.
  'agree-and-wrong': {
    lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
    elements: [
      { type: 'H1', text: 'Catchment survey', at: 740 },
      { type: 'P', text: 'First paragraph.', size: 11, at: 660 },
      { type: 'P', text: 'Second paragraph.', size: 11, at: 700 }
    ]
  },
  // The tree matches the page and the stream does not. Reported, and correct
  // for a tagged reader: only extraction, copy and reflow are affected.
  'diverge-and-tree-right': {
    lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
    elements: [
      { type: 'H1', text: 'Catchment survey', at: 740 },
      { type: 'P', text: 'First paragraph.', size: 11, at: 700 },
      { type: 'P', text: 'Second paragraph.', size: 11, at: 660 }
    ],
    contentOrder: [0, 2, 1]
  },
  // The stream matches the page and the tree does not. Reported, and the
  // tagged reader is the one getting it wrong.
  'diverge-and-tree-wrong': {
    lang: 'en-US', title: 'Catchment survey', displayDocTitle: true,
    elements: [
      { type: 'H1', text: 'Catchment survey', at: 740 },
      { type: 'P', text: 'Second paragraph.', size: 11, at: 660 },
      { type: 'P', text: 'First paragraph.', size: 11, at: 700 }
    ],
    contentOrder: [0, 2, 1]
  }
}

// Does the structure tree order agree with where the content sits on the page?
// This is the verdict the repository does not report, and it is what makes the
// independence assertion possible.
export function treeAgreesWithPage (model) {
  const placed = model.nodes
    .filter((node) => node.y !== undefined && node.mcids.length > 0)
    .sort((a, b) => a.order - b.order)
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].y > placed[i - 1].y) return false
  }
  return true
}
