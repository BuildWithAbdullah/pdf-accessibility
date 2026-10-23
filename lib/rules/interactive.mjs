// Form fields and links: the parts of a PDF a reader has to operate rather than
// read, where an unlabelled control is not an inconvenience but a dead end.

export const forms = {
  id: 'forms',
  title: 'A form field needs a name a person would recognise, a place in the structure, and a defined tab order',
  findings: {
    'forms.name.absent': {
      title: 'A widget annotation with no /TU and nothing in the structure to name it',
      why: 'The field is announced as an edit box with no label. The visible text next to it on the page is not connected to it in any way a reader can follow, so the user is typing into an unnamed box on a form they cannot review.',
      fix: 'Set /TU on the field to the visible label text. /TU is what readers announce, and it is the only reliable place to put the name.',
      limit: 'A label sitting beside the field is not an association. This check looks for /TU and for /Alt on the field structure element, and treats everything else as absent, which is what readers do.'
    },
    'forms.name.empty': {
      title: 'A widget annotation whose /TU is empty',
      why: 'Present and empty passes a presence check and announces nothing. It is the normal result of a tool that writes /TU for every field whether or not it found a label.',
      fix: 'Fill it in, field by field. There is no way to generate these correctly.',
      limit: 'Whitespace only values are treated as empty here.'
    },
    'forms.name.is.field.name': {
      title: 'The /TU repeats the field machine name',
      why: 'A reader hears "text underscore 7" or "FullName1". The field has a name, it passes every check that looks for one, and it tells the user nothing. This is the most common shape of a form that reports clean and cannot be filled in.',
      fix: 'Replace /TU with the label a sighted user reads. Leave /T as the machine name: they are different fields for different audiences.',
      limit: 'Comparison is on the normalised strings, so a /TU that merely resembles the machine name passes.'
    },
    'forms.field.unstructured': {
      title: 'A widget annotation with no /StructParent',
      why: 'The field is not in the reading order. A reader going through the document in order never meets it, and only discovers it by switching to a forms mode, if their software has one. On a page of prose with one field in the middle, the field is invisible.',
      fix: 'Add a /Form structure element in the right position in the tree, point it at the annotation with an /OBJR, and set /StructParent on the annotation to match.',
      limit: 'Presence of the entry is checked, not whether the element it names sits where the field appears on the page.'
    },
    'forms.tabs.absent': {
      title: 'A page with widget annotations and no /Tabs /S',
      why: 'Without /Tabs /S the tab order is the order of the annotation array, which is the order the fields were created in. That is often the order they were edited in, so tabbing through a form jumps around the page and no keyboard user can complete it in one pass.',
      fix: 'Set /Tabs /S on every page with fields, so tab order follows the structure tree.',
      limit: 'This says the order is defined, not that it is right. A /Tabs /S over a structure tree in the wrong order produces a wrong tab order with no finding here, which is why the reading order rules matter to forms too.'
    },
    'forms.required.unannounced': {
      title: 'A required field whose /TU does not say it is required',
      why: 'The required flag is in the field dictionary and most readers do not announce it. The user finds out on submission, if the form tells them, and on a printed form never. An asterisk in the visible label is not connected to the field.',
      fix: 'Say so in /TU, in words, as well as setting the flag.',
      limit: 'This looks for the word required or an asterisk in /TU. A form that announces the requirement some other way is reported anyway.'
    }
  },
  check (model) {
    const out = []
    const formNodes = model.nodes.filter((node) => node.type === 'Form')
    const altByObj = new Map()
    for (const node of formNodes) {
      for (const objr of node.objrs) if (objr.objNum !== undefined) altByObj.set(objr.objNum, node.alt)
    }

    for (const page of model.pages) {
      const widgets = page.annots.filter((annot) => annot.subtype === 'Widget')
      if (widgets.length > 0 && page.tabs !== 'S') {
        out.push({ id: 'forms.tabs.absent', where: 'page ' + (page.index + 1) })
      }
      for (const widget of widgets) {
        const where = 'field ' + (widget.fieldName || 'with no name') + ' on page ' + (page.index + 1)
        if (widget.structParent === undefined) out.push({ id: 'forms.field.unstructured', where })

        const structureAlt = altByObj.get(widget.objNum)
        if (!widget.tuPresent) {
          if (structureAlt === undefined || structureAlt.trim() === '') out.push({ id: 'forms.name.absent', where })
        } else if ((widget.userName || '').trim() === '') {
          out.push({ id: 'forms.name.empty', where })
        } else if (widget.fieldName && normalise(widget.userName) === normalise(widget.fieldName)) {
          out.push({ id: 'forms.name.is.field.name', where })
        }

        const required = (widget.flags & 2) === 2
        if (required && !/required|\*/i.test(widget.userName || '')) {
          out.push({ id: 'forms.required.unannounced', where })
        }
      }
    }
    return out
  }
}

function normalise (text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export const links = {
  id: 'links',
  title: 'A link needs a description, a place in the reading order, and text worth hearing',
  findings: {
    'links.alt.absent': {
      title: 'A /Link annotation with no /Contents',
      why: 'The annotation is the thing a reader activates, and /Contents is its description. Without it some readers announce the destination URL and some announce nothing, so whether the link is usable depends on the software.',
      fix: 'Set /Contents on the annotation to the same words as the link text.',
      limit: 'A link whose text already reads well is usable in most software without /Contents, so this is a robustness finding rather than a blocker. It is listed separately from the structure finding below because the fix is a different edit.'
    },
    'links.unstructured': {
      title: 'A /Link annotation with no /StructParent',
      why: 'The link is not in the reading order. The words are read as ordinary text with no indication that they are a link, and the annotation is reachable only by tabbing through annotations, so a reader going through the document in order cannot find it.',
      fix: 'Add a /Link structure element containing both the text and an /OBJR for the annotation, and set /StructParent on the annotation.',
      limit: 'As with form fields, the entry is checked rather than its position.'
    },
    'links.text.is.url': {
      title: 'The link text is a bare URL',
      why: 'It is read out character by character, including the protocol and every slash. A long link becomes thirty seconds of punctuation, and a list of them is indistinguishable one from another.',
      fix: 'Use the title of the destination as the link text and keep the URL in the action. In print, put the URL in a footnote.',
      limit: 'A document that is deliberately printing URLs for a paper reader will be reported. There is no way to tell that intent from the file.'
    }
  },
  check (model) {
    const out = []
    const linkNodes = model.nodes.filter((node) => node.type === 'Link')
    for (const page of model.pages) {
      for (const annot of page.annots) {
        if (annot.subtype !== 'Link') continue
        const where = 'link on page ' + (page.index + 1)
        if (!annot.contentsPresent || (annot.contents || '').trim() === '') {
          out.push({ id: 'links.alt.absent', where })
        }
        if (annot.structParent === undefined) out.push({ id: 'links.unstructured', where })
      }
    }
    for (const node of linkNodes) {
      const text = (node.text || '').trim()
      if (/^(https?:\/\/|www\.)\S+$/i.test(text)) {
        out.push({ id: 'links.text.is.url', where: 'link text at tree position ' + node.order })
      }
    }
    return out
  }
}
