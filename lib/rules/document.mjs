// Document level declarations: is the file tagged at all, what language is it
// in, what is it called, and does it explain its own non standard structure
// types.

import { STANDARD_TYPES } from '../parser/model.mjs'

const BCP47 = /^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|\d{3}))?(-[A-Za-z0-9]{5,8}|-\d[A-Za-z0-9]{3})*$/

export const tagging = {
  id: 'tagging',
  title: 'The document has to say it is tagged, and then be tagged',
  findings: {
    'tagging.markinfo.absent': {
      title: 'No /MarkInfo, so the document does not claim to be tagged',
      why: 'Assistive technology decides between the structure tree and the raw content stream on this one entry. Without it, every reader falls back to painting order whatever else the file contains.',
      fix: 'Add /MarkInfo << /Marked true >> to the catalog, and only once the structure tree below it is real.',
      limit: 'This says nothing about whether the structure that follows is correct. A file can carry /Marked true and a complete tree that describes the wrong document.'
    },
    'tagging.marked.false': {
      title: '/MarkInfo is present and /Marked is false',
      why: 'This is the explicit statement that the content is not tagged. Some tools write it when a tagging pass was started and abandoned, which leaves a structure tree in the file that nothing will read.',
      fix: 'Set /Marked true once the structure tree is complete, or remove the half built tree so the file is honest about what it is.',
      limit: 'A false /Marked with no structure tree is a correct statement about an untagged file, not a defect in itself. This finding is about the claim disagreeing with the contents.'
    },
    'tagging.structtree.absent': {
      title: '/Marked is true and there is no /StructTreeRoot',
      why: 'The file claims to be tagged and carries no tags. A checker reading only the catalog reports it as tagged, which is how an untagged file acquires a clean report.',
      fix: 'Either build the structure tree or set /Marked false. The claim and the contents have to agree.',
      limit: 'Detecting this needs the catalog only, so it is cheap and it is also the shallowest thing in this repository. It does not look at a single page.'
    },
    'tagging.structtree.empty': {
      title: '/StructTreeRoot exists with no children',
      why: 'An empty root is the same outcome as no root for a reader, but it passes a presence check. Tools that add the root before walking the content leave this behind when the walk fails.',
      fix: 'Populate the tree, or remove the root and set /Marked false.',
      limit: 'A root with children can still describe none of the page content. The coverage rules, not this one, are what establish that the tree reaches the content.'
    }
  },
  check (model) {
    const out = []
    if (!model.markInfoPresent) out.push({ id: 'tagging.markinfo.absent', where: 'catalog' })
    else if (model.marked !== true) out.push({ id: 'tagging.marked.false', where: 'catalog /MarkInfo' })
    if (model.marked === true && !model.structTreeRootPresent) {
      out.push({ id: 'tagging.structtree.absent', where: 'catalog' })
    }
    if (model.structTreeRootPresent) {
      const kids = model.file.at(model.structRoot, 'K')
      const empty = kids === undefined || (Array.isArray(kids) && kids.length === 0)
      if (empty) out.push({ id: 'tagging.structtree.empty', where: 'StructTreeRoot /K' })
    }
    return out
  }
}

export const language = {
  id: 'language',
  title: 'The document language has to be declared and has to be a language tag',
  findings: {
    'language.absent': {
      title: 'No /Lang on the catalog',
      why: 'A screen reader picks a voice and a pronunciation dictionary from this entry. With nothing to go on it uses the user default, so an English document is read with Spanish phonetics to a Spanish user.',
      fix: 'Set /Lang on the catalog to the BCP 47 tag of the document body, and override it on any element in another language.',
      limit: 'A document level tag does not make a mixed language document correct. Nothing here checks whether the declared language matches the text, which no automated check can do reliably.'
    },
    'language.empty': {
      title: '/Lang is present and empty',
      why: 'An empty string satisfies a presence check and carries no information. It is what a template produces when the authoring tool had no language set.',
      fix: 'Replace the empty string with the real tag.',
      limit: 'Same as the absent case: this is about the declaration, not about the text it describes.'
    },
    'language.malformed': {
      title: '/Lang is not shaped like a BCP 47 tag',
      why: 'Values like "English" or "en_US" are common and are not language tags. A reader that cannot parse the value falls back to the user default, so the effect is the same as declaring nothing while the file looks compliant.',
      fix: 'Use a tag such as en, en-US or pt-BR. The separator is a hyphen.',
      limit: 'This checks the shape, not the registry. A well shaped tag naming a language that does not exist passes.'
    }
  },
  check (model) {
    if (!model.langPresent) return [{ id: 'language.absent', where: 'catalog' }]
    const value = model.lang
    if (value === undefined || value === '') return [{ id: 'language.empty', where: 'catalog /Lang' }]
    if (!BCP47.test(value)) return [{ id: 'language.malformed', where: 'catalog /Lang' }]
    return []
  }
}

export const title = {
  id: 'title',
  title: 'The document title has to exist, say something, and be the thing the window shows',
  findings: {
    'title.absent': {
      title: 'No /Title in the document information dictionary',
      why: 'The title is the first thing announced when the document opens and the label a user picks this window out of twenty by. Without it they get the filename.',
      fix: 'Set /Title in the information dictionary to the title a reader would call the document.',
      limit: 'This reads the information dictionary only. A title carried solely in XMP metadata is not read here and will be reported as absent.'
    },
    'title.empty': {
      title: '/Title is present and empty',
      why: 'An empty title passes every presence check and behaves exactly like no title at all.',
      fix: 'Put the title of the document in it. A document information dictionary with an empty title is worth less than one with no title entry, because it stops anybody looking.',
      limit: 'Whitespace only titles are treated as empty here, which is a judgement rather than a reading of the specification.'
    },
    'title.filename': {
      title: '/Title looks like a filename rather than a title',
      why: 'Authoring tools default the title to the source filename. A user hearing "final_v3_FOR_REVIEW.docx" learns nothing about what they have opened, and a document set titled this way is unnavigable.',
      fix: 'Replace it with prose. The test is whether you would read it aloud to somebody.',
      limit: 'This is a heuristic on the shape of the string, so a document genuinely called by a filename is a false positive, and a bad title that happens not to look like a filename passes.'
    },
    'title.not.displayed': {
      title: 'A real /Title is present and /DisplayDocTitle is not true',
      why: 'Without this entry the viewer shows the filename in the window title and the task bar regardless of what the title says. The title is set, and nobody sees it.',
      fix: 'Add /ViewerPreferences << /DisplayDocTitle true >> to the catalog.',
      limit: 'This is a request to the viewer, not a guarantee. A viewer is free to ignore it, and some embedded viewers do.'
    }
  },
  check (model) {
    const out = []
    if (!model.titlePresent) return [{ id: 'title.absent', where: 'document information dictionary' }]
    const value = (model.title || '').trim()
    if (value === '') return [{ id: 'title.empty', where: '/Title' }]
    if (/\.(pdf|docx?|pptx?|xlsx?|indd|pages|odt|rtf|tex)$/i.test(value) || /^[\w-]+_(v\d|final|draft|copy)/i.test(value)) {
      out.push({ id: 'title.filename', where: '/Title' })
    }
    if (model.displayDocTitle !== true) out.push({ id: 'title.not.displayed', where: 'catalog /ViewerPreferences' })
    return out
  }
}

export const roleMap = {
  id: 'rolemap',
  title: 'A non standard structure type has to map to one a reader understands',
  findings: {
    'rolemap.entry.absent': {
      title: 'A structure element uses a type that is neither standard nor in the /RoleMap',
      why: 'A reader meeting an unknown type has no idea whether it is a heading, a paragraph or a table cell. Most treat it as a grouping element with no semantics, so the content is read with none of the meaning the author thought they had added.',
      fix: 'Add the type to /RoleMap on the structure tree root, pointing at the standard type that behaves the same way.',
      limit: 'Mapping a type makes it readable, not correct. A /RoleMap sending a heading to /P removes the heading from the document outline and this finding will not fire on it.'
    },
    'rolemap.target.nonstandard': {
      title: 'A /RoleMap entry points at another non standard type',
      why: 'The map exists to end at a type a reader knows. One that points at another custom name leaves the reader exactly where it started, and the presence of the entry makes a checker report the type as mapped.',
      fix: 'Point the entry at a standard type. Chains are permitted by the specification and are not worth the risk.',
      limit: 'This does not follow a chain to see whether it eventually terminates at a standard type, because a reader is not obliged to follow one either.'
    }
  },
  check (model) {
    const out = []
    const seen = new Set()
    for (const node of model.nodes) {
      if (node.type !== undefined || seen.has(node.rawType)) continue
      seen.add(node.rawType)
      out.push({ id: 'rolemap.entry.absent', where: 'structure type ' + node.rawType })
    }
    for (const [from, to] of Object.entries(model.roleMap)) {
      if (to === undefined) continue
      if (!STANDARD_TYPES.has(to)) out.push({ id: 'rolemap.target.nonstandard', where: '/RoleMap ' + from })
    }
    return out
  }
}
