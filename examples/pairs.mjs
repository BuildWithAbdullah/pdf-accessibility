// Eleven pairs. Each is a failing document and the corrected version of the
// same document, written as specs so the difference between them is readable
// as a diff rather than as two binaries.
//
// `residual` is the exact set of findings that survive on the corrected side.
// It is asserted in both directions in test/pairs.mjs: every id listed has to
// still fire, and nothing outside the list may fire. A pair whose corrected
// side is clean declares an empty set and has to stay clean.

const BODY = 11

// A correct document, used as the base for pairs about one defect at a time.
export function sound () {
  return {
    lang: 'en-US',
    title: 'Water quality in the lower catchment',
    displayDocTitle: true,
    tabs: 'S',
    elements: [
      { type: 'H1', text: 'Water quality in the lower catchment' },
      { type: 'P', text: 'Nitrate concentrations fell in every reach measured.', size: BODY },
      { type: 'H2', text: 'Method' },
      { type: 'P', text: 'Samples were drawn monthly at eleven fixed points.', size: BODY }
    ]
  }
}

export const PAIRS = [
  {
    id: '01-untagged',
    title: 'A document that is not tagged at all',
    note: 'The commonest starting point. Nothing on the page changes between the two sides: every difference is in the catalog and the structure tree.',
    residual: [],
    fail: {
      ...sound(),
      marked: 'absent',
      structTreeRoot: false
    },
    pass: sound()
  },
  {
    id: '02-abandoned-tagging',
    title: 'A tagging pass that was started and abandoned',
    note: 'The structure tree root is there, empty, and /Marked says false. Every presence check passes and nothing is tagged. This is what an authoring tool leaves behind when the tagging step fails part way.',
    residual: [],
    fail: {
      ...sound(),
      marked: 'false',
      structRootEmpty: true
    },
    pass: sound()
  },
  {
    id: '03-document-declarations',
    title: 'The three document level declarations, all wrong at once',
    note: 'No language, a title taken from the source filename, and no request to the viewer to show the title it does have. None of the three is visible on the page.',
    residual: [],
    fail: {
      ...sound(),
      lang: undefined,
      title: 'catchment_report_v3_FINAL.docx',
      displayDocTitle: undefined
    },
    pass: sound()
  },
  {
    id: '04-headings-as-paragraphs',
    title: 'Headings that are headings only by font size',
    note: 'The document looks exactly right and its heading list is empty. The corrected side declares no residual findings, which is the claim being tested.',
    residual: [],
    fail: {
      ...sound(),
      elements: [
        { type: 'P', text: 'Water quality in the lower catchment', size: 20 },
        { type: 'P', text: 'Nitrate concentrations fell in every reach measured.', size: BODY },
        { type: 'P', text: 'Method', size: 17 },
        { type: 'P', text: 'Samples were drawn monthly at eleven fixed points.', size: BODY }
      ]
    },
    pass: sound()
  },
  {
    id: '05-figure-descriptions',
    title: 'A chart described as a chart',
    note: 'The /Alt is present, so the file reports as fully described. The corrected side keeps the caption and gives the figure a description that says what is in it, which is a different sentence from the one the caption carries.',
    residual: [],
    fail: {
      ...sound(),
      elements: [
        ...sound().elements,
        { type: 'Figure', alt: 'Chart' },
        { type: 'Caption', text: 'Figure 1. Nitrate by reach, 2019 to 2025.', size: BODY }
      ]
    },
    pass: {
      ...sound(),
      elements: [
        ...sound().elements,
        { type: 'Figure', alt: 'Nitrate falls in all eleven reaches between 2019 and 2025, steeply until 2022 and then slowly. Reach 7 remains the highest throughout.' },
        { type: 'Caption', text: 'Figure 1. Nitrate by reach, 2019 to 2025.', size: BODY }
      ]
    }
  },
  {
    id: '06-table-without-headers',
    title: 'A data table with no header cells',
    note: 'Every cell is tagged. None of them is a header, so every value is read with no label.',
    residual: [],
    fail: {
      ...sound(),
      elements: [
        ...sound().elements,
        {
          type: 'Table',
          rows: [
            { cells: [{ text: 'Reach' }, { text: 'Nitrate' }] },
            { cells: [{ text: 'Upper' }, { text: '4.1' }] },
            { cells: [{ text: 'Lower' }, { text: '2.8' }] }
          ]
        }
      ]
    },
    pass: {
      ...sound(),
      elements: [
        ...sound().elements,
        {
          type: 'Table',
          rows: [
            { header: true, cells: [{ text: 'Reach', scope: 'Column' }, { text: 'Nitrate', scope: 'Column' }] },
            { cells: [{ text: 'Upper' }, { text: '2.8' }] },
            { cells: [{ text: 'Lower' }, { text: '4.1' }] }
          ]
        }
      ]
    }
  },
  {
    id: '07-table-associations',
    title: 'A two axis table whose explicit associations point nowhere',
    note: 'The /Headers entries name identifiers that no header cell carries, and a reader that finds /Headers stops looking for headers by position. The corrected side gives every header an /ID and every data cell the right pair.',
    residual: [],
    fail: {
      ...sound(),
      elements: [
        ...sound().elements,
        {
          type: 'Table',
          rows: [
            { header: true, cells: [{ text: '' }, { text: '2024', id: 'y24', scope: 'Column' }, { text: '2025', scope: 'Column' }] },
            { cells: [{ text: 'Upper', kind: 'TH' }, { text: '3.2', headers: ['year2024', 'upper'] }, { text: '2.8', headers: ['year2025', 'upper'] }] },
            { cells: [{ text: 'Lower', kind: 'TH' }, { text: '4.6', headers: ['year2024', 'lower'] }, { text: '4.1', headers: ['year2025', 'lower'] }] }
          ]
        }
      ]
    },
    pass: {
      ...sound(),
      elements: [
        ...sound().elements,
        {
          type: 'Table',
          rows: [
            { header: true, cells: [{ text: '', id: 'corner', scope: 'Both' }, { text: '2024', id: 'y24', scope: 'Column' }, { text: '2025', id: 'y25', scope: 'Column' }] },
            { cells: [{ text: 'Upper', kind: 'TH', id: 'upper', scope: 'Row' }, { text: '3.2', headers: ['y24', 'upper'] }, { text: '2.8', headers: ['y25', 'upper'] }] },
            { cells: [{ text: 'Lower', kind: 'TH', id: 'lower', scope: 'Row' }, { text: '4.6', headers: ['y24', 'lower'] }, { text: '4.1', headers: ['y25', 'lower'] }] }
          ]
        }
      ]
    }
  },
  {
    id: '08-form-field-names',
    title: 'Form fields named after their own variables',
    note: 'Every field has a /TU, so the form reports as fully labelled. A reader hears the machine names. The required field announces nothing about being required.',
    residual: [],
    fail: {
      ...sound(),
      elements: [
        ...sound().elements,
        {
          type: 'Form',
          fields: [
            { name: 'txt_sampler_name', tu: 'txt sampler name', label: 'Name of sampler' },
            { name: 'txt_reach_id', tu: '', label: 'Reach identifier', required: true }
          ]
        }
      ]
    },
    pass: {
      ...sound(),
      elements: [
        ...sound().elements,
        {
          type: 'Form',
          fields: [
            { name: 'txt_sampler_name', tu: 'Name of sampler', label: 'Name of sampler' },
            { name: 'txt_reach_id', tu: 'Reach identifier (required)', label: 'Reach identifier', required: true }
          ]
        }
      ]
    }
  },
  {
    id: '09-form-order',
    title: 'A form with no defined tab order and a field outside the structure',
    note: 'Tab order falls back to the order the fields were created in, and the second field is not in the reading order at all, so a reader going through the document in order never meets it.',
    residual: [],
    fail: {
      ...sound(),
      tabs: undefined,
      elements: [
        ...sound().elements,
        {
          type: 'Form',
          fields: [
            { name: 'txt_site', tu: 'Site name', label: 'Site name' },
            { name: 'txt_date', tu: 'Date sampled', label: 'Date sampled', structParent: false }
          ]
        }
      ]
    },
    pass: {
      ...sound(),
      elements: [
        ...sound().elements,
        {
          type: 'Form',
          fields: [
            { name: 'txt_site', tu: 'Site name', label: 'Site name' },
            { name: 'txt_date', tu: 'Date sampled', label: 'Date sampled' }
          ]
        }
      ]
    }
  },
  {
    id: '10-links',
    title: 'A link that is a printed URL and is not in the reading order',
    note: 'Read out, the failing link is thirty seconds of punctuation, and only a reader in a forms or annotations mode finds it at all.',
    residual: [],
    fail: {
      ...sound(),
      elements: [
        ...sound().elements,
        { type: 'Link', text: 'https://example.invalid/catchment/method-2025', uri: 'https://example.invalid/catchment/method-2025', inStructure: false }
      ]
    },
    pass: {
      ...sound(),
      elements: [
        ...sound().elements,
        { type: 'Link', text: 'The 2025 sampling method', uri: 'https://example.invalid/catchment/method-2025', contents: 'The 2025 sampling method' }
      ]
    }
  },
  {
    id: '11-content-coverage',
    title: 'A running header read on every page, and a caption no reader can reach',
    note: 'Two pages. The header is tagged as a paragraph, so it is read between the end of one page and the start of the next. The caption is painted with no marked content wrapper at all, so it is read by nothing. The corrected side makes the header an artifact and brings the caption into the tree.',
    residual: [],
    fail: {
      lang: 'en-US',
      title: 'Water quality in the lower catchment',
      displayDocTitle: true,
      pages: [
        {
          elements: [
            { type: 'P', text: 'Lower catchment monitoring', size: 9 },
            { type: 'H1', text: 'Water quality in the lower catchment' },
            { type: 'P', text: 'Nitrate concentrations fell in every reach measured.', size: BODY }
          ]
        },
        {
          elements: [
            { type: 'P', text: 'Lower catchment monitoring', size: 9 },
            { type: 'H2', text: 'Method' },
            { type: 'Raw', text: 'Table 2. Sampling points by reach.', size: BODY }
          ]
        }
      ]
    },
    pass: {
      lang: 'en-US',
      title: 'Water quality in the lower catchment',
      displayDocTitle: true,
      pages: [
        {
          elements: [
            { type: 'Artifact', text: 'Lower catchment monitoring' },
            { type: 'H1', text: 'Water quality in the lower catchment' },
            { type: 'P', text: 'Nitrate concentrations fell in every reach measured.', size: BODY }
          ]
        },
        {
          elements: [
            { type: 'Artifact', text: 'Lower catchment monitoring' },
            { type: 'H2', text: 'Method' },
            { type: 'Caption', text: 'Table 2. Sampling points by reach.', size: BODY }
          ]
        }
      ]
    }
  }
]
