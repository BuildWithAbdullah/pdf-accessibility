# pdf-accessibility

Tagged PDF accessibility, worked out in code rather than described in prose.

A PDF is the format where the gap between tagged and accessible is widest. The
cells of a table are almost always tagged and the relationships between them
almost never are. A heading is a heading everywhere except in the structure
tree. A form field has a name, and the name is the variable the developer typed.
Every one of those files passes a presence check.

This repository is a catalogue of 50 catalogued findings, each one a
single reason a check can fire, with its own fix and its own statement of what it
cannot establish. Every finding is proven against a document generated for it,
and the limits of the method are asserted rather than claimed.

## The shape of it

The chain is always the same, and it runs one way:

```
a spec  ->  PDF bytes  ->  a parsed object graph  ->  findings
```

A spec is a small declarative object, so a failing document and its correction
sit side by side as a readable diff rather than as two binaries. The
[writer](lib/writer/document.mjs) turns a spec into bytes. The
[parser](lib/parser/model.mjs) reads those bytes back into an object graph with
no knowledge of the spec. The [rules](lib/rules) judge the graph.

That ordering is the point, and `npm run verify` enforces it: no rule may import
the writer or the corpus, so no rule can read the author's intent by accident. A
finding is always derived from parsed bytes.

## One entry per reason, not one per check

This is the structural decision the whole repository rests on. Eleven rules here
can each fire for several reasons, and reporting them under the rule name would
make this a catalogue of fourteen entries instead of 50.

The reason to split them is that the fixes genuinely differ. A `/Figure` with no
`/Alt` and a `/Figure` whose `/Alt` is the word "image" are the same rule and are
not the same job: the first needs somebody to write a description, the second
needs somebody to notice that a description was already written and is useless.
Reporting both as "figure has no accessible description" puts them in the same
queue.

The full catalogue is in [CATALOGUE.md](CATALOGUE.md), generated from
[lib/catalogue.mjs](lib/catalogue.mjs) and regenerated in CI.

## The corpus, and why half of it is not examples

[Eleven example pairs](examples/pairs.mjs), each a failing document and its
correction. Every corrected side declares the exact set of findings that survive
it, and that set is asserted in both directions: every id declared has to still
fire, and nothing outside it may fire. Ten of the eleven declare an empty set
and have to stay clean.

The eleven pairs reach 24 of the 50 findings. The other 26 are reached
only by a [fixture](fixtures/index.mjs), and that ratio is the argument for
having them. A verifier that asserted only that every rule had an example pair
would have been green over 26 findings that had never fired once.

## What this cannot establish

Five limits are declared in [lib/limits.mjs](lib/limits.mjs). Four of them are
asserted in both directions in [test/gap.test.mjs](test/gap.test.mjs), which
means each sentence fails the build if it stops being true as well as if it was
never true.

**The three orders are independent.** A document carries three reading orders:
the structure tree order, the content stream painting order, and where the words
actually sit on the page. This repository reports a disagreement between the
first two. That verdict is not even weak evidence about whether the document
reads correctly, and the test reaches all four combinations to show it. The case
that matters is the one nothing is reported for: a two column layout exported
from a page layout tool has a tree and a content stream that agree with each
other and both disagree with the page, so the file is clean here and misordered
for every reader including a tagged one.

**A clean result is not a conforming document.** The test suite carries a
document that produces no findings at all and is wrong anyway: the description is
fluent, specific, well formed, and about a different image. Nothing in a PDF can
say so.

**Seven of the findings infer intent** from the shape of a string or the size of
a glyph, and those are named rather than mixed in with the rest. For each one,
the test suite constructs a document that is correct by intent and asserts that
it is reported anyway. A short identification in `/Alt` with the detail in the
body text is the recommended practice for a complex diagram, and this repository
reports it.

**Three findings cannot be repaired in the PDF at all.** A page with no text
layer, text drawn as paths, and a font with no mapping back to characters. The
bytes that would carry the answer are not in the file, so the fix is to rebuild
the document from its source. Repairing those in the PDF produces a file that
passes a checker and still cannot be read, which is worse than the original
because it now looks finished. Those three are the only findings in the
catalogue with no corrected example, and the test suite asserts that they have
none, because there cannot be one.

**The corpus is generated by this repository's own writer**, which covers an
uncompressed subset: a classic cross reference table, no object streams, no
stream filters, no encryption. A file from a real authoring tool is usually
outside that subset, and the parser raises rather than reading around what it
does not understand. A tool that returns zero findings for a file it could not
read is worse than no tool, so a refusal is reported as a refusal and exits with
its own status.

## Using it against a real file

```
npm run audit -- path/to/file.pdf
npm run audit -- path/to/file.pdf --why
```

Exit 0 is no findings, 1 is findings, and 2 is a file outside the readable
subset, which is not a clean result. `--why` prints what each finding costs a
reader, what the fix is, and what the finding cannot establish.

To render the whole corpus to real PDFs and open them in a viewer:

```
npm run artefacts
```

Artefacts are generated rather than committed, so no binary in the history can
drift away from the spec that describes it.

## Verifying

No dependencies. Node 20.0.0 or newer.

```
npm test          # 198 tests
npm run verify    # 679 repository assertions
npm run count     # the live test count against every figure in this file
npm run catalogue # regenerate CATALOGUE.md
```

`npm test` runs 198 tests.
`npm run verify` makes 679 repository assertions, which include the comparison
of that figure against this file, so the number printed beside the command is
the number you get when you run it. It
also checks that every finding is reached by the corpus and that nothing the
corpus produces is outside the catalogue, both directions, and that every
corrected example matches its declared residual set exactly.

`npm run count` reads the test total from the structured event stream that
`node:test` emits rather than from the reporter output, because Node 20 and 22
print TAP when the output is piped and Node 24 prints the spec reporter, so a
verifier that greps for a count passes on two of the three versions in the
matrix and fails on the third with nothing wrong.

CI runs the suite and the verifier on Node 20.0.0, 22 and 24, with the floor
written out in full because a job named `20` resolves to the newest release of
that line and is therefore not a test of the declared floor at all. Separate
jobs check the generated catalogue, the test count, an install with the engines
floor enforced, and that the tool actually runs against a generated artefact and
refuses a file it cannot read.

## Layout

| Path | What is in it |
|---|---|
| [lib/catalogue.mjs](lib/catalogue.mjs) | The 50 catalogued findings, assembled from the rules |
| [lib/rules](lib/rules) | Fourteen rules, judging a parsed graph and nothing else |
| [lib/writer](lib/writer/document.mjs) | A dependency free PDF writer: structure tree, marked content, tables, form fields, annotations |
| [lib/parser](lib/parser/model.mjs) | The reader, and the four views the rules use |
| [lib/encoding.mjs](lib/encoding.mjs) | Glyph codes to characters and back, shared by both directions |
| [lib/limits.mjs](lib/limits.mjs) | What this cannot establish, in a form a test can read |
| [examples/pairs.mjs](examples/pairs.mjs) | Eleven failing documents and their corrections |
| [fixtures/index.mjs](fixtures/index.mjs) | The documents that reach the other 26 findings |
| [test/gap.test.mjs](test/gap.test.mjs) | The limits, asserted |
| [tools/verify.mjs](tools/verify.mjs) | The verifier |
| [tools/audit.mjs](tools/audit.mjs) | The command line tool |

## Scope

Patterns only. Nothing here comes from a delivered engagement: no client code,
no client names, no domains. The techniques are generalised and then written
from scratch against a corpus built for the purpose.

[MIT](LICENSE), no attribution required.
