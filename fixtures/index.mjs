// The eleven pairs in examples/ reach 24 of the 50 findings in the catalogue.
// These fixtures reach the other 26.
//
// That ratio is the argument for having them. A verifier that asserted only
// that every rule had an example pair would have been green over 26 findings
// that had never fired once, and most of the defects found while building this
// repository were in exactly those branches.
//
// `reaches` is asserted as set equality in both directions in
// test/fixtures.mjs: the fixture has to produce every id listed and nothing
// else. So a fixture cannot drift into reaching more than it claims, and a
// finding cannot quietly stop firing.

const SOUND = () => ({
  lang: 'en-US',
  title: 'Water quality in the lower catchment',
  displayDocTitle: true,
  tabs: 'S',
  elements: [
    { type: 'H1', text: 'Water quality in the lower catchment' },
    { type: 'P', text: 'Nitrate concentrations fell in every reach measured.', size: 11 }
  ]
})

const withElements = (extra, overrides = {}) => {
  const base = SOUND()
  return { ...base, ...overrides, elements: [...base.elements, ...extra] }
}

const LONG_ALT = 'Nitrate concentration by reach for each year from 2019 to 2025, with eleven series. '
  + 'Every reach falls over the period. Reaches 1 to 4 fall steeply until 2022 and then flatten, '
  + 'reaches 5 to 9 fall steadily throughout, and reaches 10 and 11 fall only after 2023. '
  + 'Reach 7 is the highest series in every year.'

export const FIXTURES = [
  {
    id: 'claims-tagged-and-is-not',
    note: 'The catalog says /Marked true and there is no structure tree below it. A checker that reads the catalog and stops reports this file as tagged.',
    reaches: ['tagging.structtree.absent'],
    spec: { ...SOUND(), structTreeRoot: false }
  },
  {
    id: 'language-empty',
    note: 'A /Lang that is present and empty, which is what a template with no language set produces.',
    reaches: ['language.empty'],
    spec: { ...SOUND(), lang: '' }
  },
  {
    id: 'language-not-a-tag',
    note: 'The language written out as a word. Readable to a person, unparseable to a reader, and it passes every presence check.',
    reaches: ['language.malformed'],
    spec: { ...SOUND(), lang: 'English (United States)' }
  },
  {
    id: 'title-absent',
    note: 'No /Title at all, so the viewer falls back to the filename and the open announcement says nothing.',
    reaches: ['title.absent'],
    spec: { ...SOUND(), title: undefined }
  },
  {
    id: 'title-empty',
    note: 'A /Title that is present and empty. Identical in effect to the case above and it passes a presence check.',
    reaches: ['title.empty'],
    spec: { ...SOUND(), title: '   ' }
  },
  {
    id: 'marked-without-mcid',
    note: 'A tagged sequence with no MCID in its property dictionary. There is no handle for the structure tree to point at, so the content is marked up and unreachable.',
    reaches: ['coverage.marked.without.mcid'],
    spec: withElements([{ type: 'NoMcid', text: 'Sampling points are listed in the appendix.' }])
  },
  {
    id: 'orphan-marked-content',
    note: 'An MCID is painted and no structure element claims it. The content is marked, numbered and read by nothing, and it shows up in a content stream dump, which is why it survives review.',
    reaches: ['coverage.orphan.mcid'],
    spec: withElements([{ type: 'Orphan', text: 'Sampling points are listed in the appendix.' }])
  },
  {
    id: 'no-parent-tree',
    note: 'The structure tree points down at the content and nothing points back up, so a reader that starts from a click on the page cannot discover what it clicked.',
    reaches: ['coverage.parenttree.absent'],
    spec: { ...SOUND(), parentTree: false }
  },
  {
    id: 'page-without-structparents',
    note: 'The page paints marked content and carries no /StructParents, so there is no key into the parent tree for anything on it.',
    reaches: ['order.page.structparents.absent'],
    spec: {
      lang: 'en-US',
      title: 'Water quality in the lower catchment',
      displayDocTitle: true,
      pages: [{
        structParents: false,
        elements: [
          { type: 'H1', text: 'Water quality in the lower catchment' },
          { type: 'P', text: 'Nitrate concentrations fell in every reach measured.', size: 11 }
        ]
      }]
    }
  },
  {
    id: 'reading-order-diverges',
    note: 'The structure tree is correct and the content stream paints the method section before the heading it belongs under. A tagged reader is fine. Text extraction, copy and paste, reflow and search context are not.',
    reaches: ['order.structure.diverges'],
    spec: {
      ...SOUND(),
      elements: [
        { type: 'H1', text: 'Water quality in the lower catchment' },
        { type: 'P', text: 'Nitrate concentrations fell in every reach measured.', size: 11 },
        { type: 'H2', text: 'Method' },
        { type: 'P', text: 'Samples were drawn monthly at eleven fixed points.', size: 11 }
      ],
      contentOrder: [2, 3, 0, 1]
    }
  },
  {
    id: 'scanned-page',
    note: 'A second page that is a photograph of a page of text. There is nothing to read, nothing to search and nothing to select, and the figure above it is described correctly, so the only finding is the one that matters.',
    reaches: ['text.layer.absent'],
    spec: {
      lang: 'en-US',
      title: 'Water quality in the lower catchment',
      displayDocTitle: true,
      pages: [
        { elements: [{ type: 'H1', text: 'Water quality in the lower catchment' }, { type: 'P', text: 'Nitrate fell in every reach.', size: 11 }] },
        { elements: [{ type: 'Scan', alt: 'A photograph of the 1998 survey form, transcribed in the appendix.' }] }
      ]
    }
  },
  {
    id: 'heading-drawn-as-paths',
    note: 'A heading converted to outlines. It is tagged, it is at the right level, and it extracts as nothing at all. Two findings are true of the same element and they move together: putting the characters back, or carrying them in /ActualText, clears both. They are separate entries because the empty heading is what a reader navigating the heading list meets, and the paths are why.',
    reaches: ['headings.empty', 'text.as.paths'],
    spec: withElements([{ type: 'Outline', text: 'Appendix', tag: 'H2' }])
  },
  {
    id: 'font-without-tounicode',
    note: 'A subset font with a /Differences encoding and no /ToUnicode. The page renders perfectly and every extraction returns the raw codes, which is why this one survives visual review. The text this repository extracts from it is empty rather than wrong, which is the point: reading the base encoding and ignoring the differences returns plausible characters that are not in the file, and that was a real defect here.',
    reaches: ['text.unicode.unmappable'],
    spec: withElements([{ type: 'P', text: 'Samples were drawn monthly.', size: 11, font: 'F2' }])
  },
  {
    id: 'heading-outline-broken',
    note: 'The outline starts at H2 because the H1 lived in a template, and then jumps to H4. A reader cannot tell a skipped level from a section whose heading was never tagged.',
    reaches: ['headings.first.not.top', 'headings.level.skipped'],
    spec: {
      ...SOUND(),
      elements: [
        { type: 'H2', text: 'Water quality in the lower catchment' },
        { type: 'P', text: 'Nitrate fell in every reach.', size: 11 },
        { type: 'H4', text: 'Method' }
      ]
    }
  },
  {
    id: 'heading-empty',
    note: 'A heading element with no text in it. It appears in the heading list as a blank entry that a user can land on and hear nothing from.',
    reaches: ['headings.empty'],
    spec: withElements([{ type: 'H2', text: '' }])
  },
  {
    id: 'typed-bullets',
    note: 'A list typed as paragraphs beginning with a bullet character. The reader gets no count and no position, and hears the punctuation.',
    reaches: ['lists.visual.only'],
    spec: withElements([{ type: 'L', asParagraphs: true, items: ['• Reach 1, sampled monthly', '• Reach 2, sampled monthly', '• Reach 3, sampled quarterly'] }])
  },
  {
    id: 'figure-without-alt',
    note: 'A chart tagged as a figure with no /Alt. It is announced as a figure with nothing after it.',
    reaches: ['figures.alt.absent'],
    spec: withElements([{ type: 'Figure' }])
  },
  {
    id: 'figure-with-empty-alt',
    note: 'An empty /Alt, which is correct in HTML and is not the way to hide a decorative image here. The figure stays in the tree and is still announced.',
    reaches: ['figures.alt.empty'],
    spec: withElements([{ type: 'Figure', alt: '' }])
  },
  {
    id: 'figure-alt-repeats-caption',
    note: 'The /Alt and the caption are the same sentence. The reader hears it twice and still does not know what the chart shows.',
    reaches: ['figures.alt.repeats.caption'],
    spec: withElements([
      { type: 'Figure', alt: 'Figure 1. Nitrate by reach, 2019 to 2025.' },
      { type: 'Caption', text: 'Figure 1. Nitrate by reach, 2019 to 2025.', size: 11 }
    ])
  },
  {
    id: 'figure-alt-too-long',
    note: 'A description of a chart that runs to a paragraph. There is no way to pause, skip or re-read inside an /Alt, so it is heard once at speed with no way back.',
    reaches: ['figures.alt.verbose'],
    spec: withElements([{ type: 'Figure', alt: LONG_ALT }])
  },
  {
    id: 'table-ragged-rows',
    note: 'A row short of a cell with no span declared. Navigating by column walks off the end of the short row and every cell after the gap is read against the wrong header.',
    reaches: ['tables.row.ragged'],
    spec: withElements([{
      type: 'Table',
      rows: [
        { header: true, cells: [{ text: 'Reach', scope: 'Column' }, { text: '2024', scope: 'Column' }, { text: '2025', scope: 'Column' }] },
        { cells: [{ text: 'Upper' }, { text: '3.2' }, { text: '2.8' }] },
        { cells: [{ text: 'Lower' }, { text: '4.1' }] }
      ]
    }])
  },
  {
    id: 'table-cells-without-rows',
    note: 'Cells hanging directly under the table with no /TR. They have a column position and no row, so the table is not two dimensional to a reader.',
    reaches: ['tables.cell.outside.row'],
    spec: withElements([{
      type: 'Table',
      wrapTR: false,
      rows: [
        { header: true, cells: [{ text: 'Reach', scope: 'Column' }, { text: 'Nitrate', scope: 'Column' }] },
        { cells: [{ text: 'Upper' }, { text: '2.8' }] }
      ]
    }])
  },
  {
    id: 'single-column-layout-table',
    note: 'A list that has been given a grid to sit in. The reader is told they are entering a table, given its dimensions, and then read a sequence of single cells.',
    reaches: ['tables.layout.single.column'],
    spec: withElements([{
      type: 'Table',
      rows: [
        { header: true, cells: [{ text: 'Reaches sampled', scope: 'Column' }] },
        { cells: [{ text: 'Upper' }] },
        { cells: [{ text: 'Lower' }] }
      ]
    }])
  },
  {
    id: 'custom-type-not-mapped',
    note: 'A structure type a reader has never heard of, with no /RoleMap entry. Most readers treat it as a grouping element with no semantics, so the meaning the author added is not there.',
    reaches: ['rolemap.entry.absent'],
    spec: withElements([{ type: 'Chapter', text: 'The lower catchment', size: 11 }])
  },
  {
    id: 'rolemap-points-at-nothing',
    note: 'The map exists and ends at another name a reader does not know, which leaves the reader where it started while a checker reports the type as mapped.',
    reaches: ['rolemap.target.nonstandard'],
    spec: withElements([{ type: 'Chapter', text: 'The lower catchment', size: 11 }], { roleMap: { Chapter: 'Zone' } })
  },
  {
    id: 'form-field-with-no-name',
    note: 'A field with no /TU and nothing in the structure to name it. The visible label beside it on the page is not connected to it in any way a reader can follow.',
    reaches: ['forms.name.absent'],
    spec: withElements([{ type: 'Form', fields: [{ name: 'txt_reach', label: 'Reach identifier' }] }])
  }
]
