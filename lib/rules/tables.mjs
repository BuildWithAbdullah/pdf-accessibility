// Table tagging. A table is the structure where the difference between tagged
// and accessible is widest: the cells are almost always tagged, and the
// relationships between them almost never are.

export const tables = {
  id: 'tables',
  title: 'A data table needs headers, and the cells need to say which headers are theirs',
  findings: {
    'tables.header.absent': {
      title: 'A table with no /TH anywhere',
      why: 'Every cell is read as a value with no label. On a five column table the reader has to count columns from the top of the table for every row, and most cannot, so the table becomes a list of numbers.',
      fix: 'Tag the header cells as /TH. If the table has no headers it is a layout table, which is the last finding in this rule.',
      limit: 'This counts header cells. It cannot tell whether the cells tagged /TH are the right ones, and a table whose first data row is tagged as the header passes.'
    },
    'tables.header.no.scope': {
      title: 'A /TH with no /Scope in a table that needs one',
      why: 'With one header row a reader can guess that the headers run down the columns. As soon as there are row headers too, the guess fails, and the cell at the top left of the table is the one that breaks it. The result is values read against the wrong label, which is worse than no label.',
      fix: 'Set /Scope to /Column, /Row or /Both on every /TH in a table with headers on two axes.',
      limit: 'This fires only where headers appear on more than one axis, because /Scope is optional and harmless to omit on a single header row. Tables whose header arrangement this check reads wrongly will be reported wrongly.'
    },
    'tables.headers.dangling': {
      title: 'A /Headers entry naming an identifier no header cell carries',
      why: 'An explicit association that points nowhere is worse than no association, because a reader that finds /Headers stops looking for headers by position. The cell ends up with no label at all, on a table that was deliberately marked up.',
      fix: 'Correct the identifier, or give the header cell the /ID that is being referenced.',
      limit: 'This resolves identifiers inside the document. It does not check that the header a correct identifier reaches is the right header for the cell.'
    },
    'tables.header.id.absent': {
      title: 'A table uses /Headers and some header cells have no /ID',
      why: 'A table that associates some cells explicitly and leaves others to position is read inconsistently, and which half a reader gets depends on the software. Half an association is the hardest version of this defect to see, because the table demonstrably works in whichever tool the author tried.',
      fix: 'Give every /TH an /ID once any cell in the table uses /Headers, and reference them all.',
      limit: 'The threshold here is that the table uses /Headers at all. A table with no explicit associations anywhere is judged by the scope finding instead.'
    },
    'tables.row.ragged': {
      title: 'Rows with different cell counts and no span attributes to explain it',
      why: 'The reader is told the table has one shape and finds another. Navigating by column walks off the end of the short rows, and the cells after the gap are read against the wrong headers for the rest of the table.',
      fix: 'Add the /ColSpan or /RowSpan the layout actually uses, or add the empty cells the table is missing.',
      limit: 'Only the declared spans are read. A table whose spans are declared and wrong will balance arithmetically here and still be read incorrectly.'
    },
    'tables.cell.outside.row': {
      title: 'A /TH or /TD that is not inside a /TR',
      why: 'Rows are what make a table two dimensional. Cells hanging directly under the table have a column position and no row, so a reader either flattens the table into a list or gives up on it.',
      fix: 'Wrap each run of cells in a /TR.',
      limit: 'This checks the immediate parent chain for a /TR. A /TR nested inside an unexpected grouping element is accepted.'
    },
    'tables.layout.single.column': {
      title: 'A table with a single column',
      why: 'A one column table is a list that has been given a grid to sit in. The reader is told they are entering a table, given the dimensions, and then read a sequence of single cells, all of which is noise around content that was never tabular.',
      fix: 'Tag it as /L with list items, or as a sequence of paragraphs.',
      limit: 'A genuine single column table of one variable exists and will be reported. The judgement is that the cost of the false positive is lower than the cost of the pattern it catches.'
    }
  },
  check (model) {
    const out = []
    const tableNodes = model.nodes.filter((node) => node.type === 'Table')

    for (const node of model.nodes) {
      if (node.type !== 'TH' && node.type !== 'TD') continue
      let parent = node.parent
      let insideRow = false
      while (parent) {
        if (parent.type === 'TR') { insideRow = true; break }
        if (parent.type === 'Table') break
        parent = parent.parent
      }
      if (!insideRow) out.push({ id: 'tables.cell.outside.row', where: node.type + ' at tree position ' + node.order })
    }

    for (const table of tableNodes) {
      const where = 'table at tree position ' + table.order
      const rows = table.descendants.filter((node) => node.type === 'TR')
      const cells = table.descendants.filter((node) => node.type === 'TH' || node.type === 'TD')
      const headerCells = cells.filter((node) => node.type === 'TH')

      if (headerCells.length === 0) out.push({ id: 'tables.header.absent', where })

      const rowShapes = rows.map((row) => row.kids
        .filter((kid) => kid.type === 'TH' || kid.type === 'TD')
        .reduce((total, kid) => total + span(kid, 'ColSpan'), 0))
      const distinct = new Set(rowShapes.filter((count) => count > 0))
      if (distinct.size > 1) out.push({ id: 'tables.row.ragged', where: where + ' has rows of ' + [...distinct].join(' and ') + ' cells' })

      const columns = rowShapes.length ? Math.max(...rowShapes) : 0
      if (columns === 1 && cells.length > 1) out.push({ id: 'tables.layout.single.column', where })

      const ids = new Set(headerCells.map((cell) => cell.id).filter((id) => id !== undefined))
      const usesHeaders = cells.some((cell) => Array.isArray(cell.attributes.Headers) && cell.attributes.Headers.length > 0)
      if (usesHeaders) {
        let dangling = false
        for (const cell of cells) {
          const headers = cell.attributes.Headers
          if (!Array.isArray(headers)) continue
          for (const id of headers) if (!ids.has(id)) dangling = true
        }
        if (dangling) out.push({ id: 'tables.headers.dangling', where })
        if (headerCells.some((cell) => cell.id === undefined)) {
          out.push({ id: 'tables.header.id.absent', where })
        }
      }

      if (headerCells.length > 0 && headersOnTwoAxes(rows) && headerCells.some((cell) => cell.attributes.Scope === undefined)) {
        out.push({ id: 'tables.header.no.scope', where })
      }
    }
    return out
  }
}

function span (cell, key) {
  const value = cell.attributes[key]
  return typeof value === 'number' && value > 0 ? value : 1
}

// Headers run on two axes when at least one row is entirely header cells and at
// least one other row begins with a header cell and then holds data.
function headersOnTwoAxes (rows) {
  let headerRow = false
  let rowHeader = false
  for (const row of rows) {
    const cells = row.kids.filter((kid) => kid.type === 'TH' || kid.type === 'TD')
    if (cells.length === 0) continue
    if (cells.every((cell) => cell.type === 'TH')) { headerRow = true; continue }
    if (cells[0].type === 'TH' && cells.some((cell) => cell.type === 'TD')) rowHeader = true
  }
  return headerRow && rowHeader
}
