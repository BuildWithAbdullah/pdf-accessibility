// The catalogue: one entry per reason a check can fire, never one per check.
//
// This is the shape the rest of the account converged on, and the reason is
// that the fixes genuinely differ. A /Figure with no /Alt and a /Figure whose
// /Alt is the word "image" are reported by the same rule and are not the same
// job: the first needs somebody to write a description, the second needs
// somebody to notice that a description was already written and is useless. A
// catalogue that reports both as "figure has no accessible description" puts
// them in the same queue.

import { RULES } from './rules/index.mjs'

export const CATALOGUE = RULES.flatMap((rule) =>
  Object.entries(rule.findings).map(([id, entry]) => ({
    id,
    rule: rule.id,
    ruleTitle: rule.title,
    title: entry.title,
    why: entry.why,
    fix: entry.fix,
    limit: entry.limit,
    needsSource: entry.needsSource === true
  }))
)

export const CATALOGUE_BY_ID = new Map(CATALOGUE.map((entry) => [entry.id, entry]))

export const NEEDS_SOURCE_IDS = CATALOGUE.filter((entry) => entry.needsSource).map((entry) => entry.id)

export const FINDING_IDS = CATALOGUE.map((entry) => entry.id)

export function duplicateIds () {
  const seen = new Set()
  const duplicates = []
  for (const id of FINDING_IDS) {
    if (seen.has(id)) duplicates.push(id)
    seen.add(id)
  }
  return duplicates
}
