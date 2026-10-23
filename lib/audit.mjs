// The one entry point. Bytes in, findings out.
//
// The chain is always spec, then bytes, then a parsed object graph, then
// findings. A rule never sees the spec that produced the file, so no rule can
// read the author's intent by accident.

import { parse, UnsupportedPdf } from './parser/parse.mjs'
import { documentModel } from './parser/model.mjs'
import { RULES } from './rules/index.mjs'
import { CATALOGUE_BY_ID } from './catalogue.mjs'

export { UnsupportedPdf }

export function auditModel (model) {
  const findings = []
  for (const rule of RULES) {
    for (const finding of rule.check(model)) {
      if (!CATALOGUE_BY_ID.has(finding.id)) {
        throw new Error('rule ' + rule.id + ' reported ' + finding.id + ', which is not in the catalogue')
      }
      findings.push({ ...finding, rule: rule.id })
    }
  }
  return findings
}

export function audit (bytes) {
  const file = parse(bytes)
  const model = documentModel(file)
  return { findings: auditModel(model), model }
}

export function findingIds (bytes) {
  return [...new Set(audit(bytes).findings.map((finding) => finding.id))].sort()
}
