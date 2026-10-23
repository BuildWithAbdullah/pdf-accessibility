import { tagging, language, title, roleMap } from './document.mjs'
import { coverage, readingOrder, textLayer, artifacts } from './content.mjs'
import { headings, lists, figures } from './semantics.mjs'
import { tables } from './tables.mjs'
import { forms, links } from './interactive.mjs'

// The order here is the order findings are reported in, which runs from the
// document level declarations down to individual controls.
export const RULES = [
  tagging, language, title, roleMap,
  coverage, readingOrder, textLayer, artifacts,
  headings, lists, figures,
  tables,
  forms, links
]

export const RULES_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]))
