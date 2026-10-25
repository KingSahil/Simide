# SimIDE — submission readiness

Audit started October 24, 2026 (Asia/Kolkata). This is a current readiness record,
not evidence that planning documents existed before the initial implementation.

## Official requirements

Source: [official rules](https://learn-ai-basics.devpost.com/rules), sections 1,
3, 4, and 6, checked October 24, 2026.

- Deadline: October 27, 2026, 02:30 IST (October 26, 17:00 EDT).
- New software created during September 22–October 26, 2026; disclose incorporated
  pre-existing work beyond standard tools, libraries, and templates.
- Use the Devpost Learn Skill Pack and include its project-specific `scope.md`,
  `prd.md`, and `spec.md` in the public repository.
- Provide a functioning proof of concept and reproducible setup instructions.
- Provide the public repository, source, assets, instructions, and an open source license.
- Provide an English description (or English translation) and a public YouTube or
  Vimeo demo showing the actual application functioning. Target 1–3 minutes and
  stay below three minutes, following both the overview and the official rules.
- Confirm eligibility of all team members, ownership/permissions, and the team representative.
- Keep the project available free for judging through October 30, 2026, 17:00 EDT.
- Stage one checks viability and skill-pack use evidenced by planning documents.
  Stage two weights Design, Potential Impact, Innovation/Idea, and Presentation equally.

## Evidence checked

- Local Git history begins October 15, 2026; this supports but does not establish origin.
- Owner confirmed in this conversation that the project started from an empty
  project and no earlier project code was used. Retain any applicable third-party
  library notices; this confirmation does not replace contributor rights checks.
- `skills-lock.json` records all six skills from `challengepost/learn-ai-basics`.
  Installation does not by itself establish use of the guided workflow.
- Public repository: <https://github.com/KingSahil/Simide>, MIT license visible.
- Architecture documentation exists in `docs/`. Skill templates are not completed
  project planning documents.

## Remaining submission tasks

- [ ] Complete the learner-led planning conversation and save/review `scope.md`.
- [ ] Develop and review `prd.md` from that scope.
- [ ] Develop and review `spec.md` from the product requirements.
- [ ] Record an approved build/recovery checklist with real verification and hands-on results.
- [ ] Confirm team eligibility, contributor permissions, reused assets, and representative.
- [ ] Review repository/setup documentation against the actual supported environment.
- [ ] Check the final packaged extension in VS Code using the array demo and a pointer example.
- [ ] Record an actual end-to-end demo; make the video publicly accessible.
- [ ] Owner writes the submission description and personal learning reflection.
- [ ] Review final links and required submission-form fields; owner authorizes publishing/submission.

## Recovery verification — October 24

The regression was replacement of the runtime `StateExtractor` with an incomplete
AST-only skeleton. Successful C++ compilation was followed by a call to a removed
`reset()` method, so debugger launch was never reached and the compiling status remained.

The runtime implementation from immediately before commit `d64aac7` has been
restored locally. Compilation now includes TypeScript checks. Startup errors
produce a visible, retryable error; overlapping startup requests are ignored.
Compiler discovery and compilation have bounded process timeouts.

Verified locally:

- TypeScript checking and extension bundle build.
- Regression tests for debugger launch after compilation, initialization errors,
  and successful retry after failure.
- Existing extraction, pointer, explanation, and snapshot-history tests.
- Real GDB execution for the tree, reverse-list, and array examples.
- Array example: initial values, `arr[2] = 99`, swap to `20, 10`, and output
  `20 10 99 40 50`.
- Owner clarified that bubble sort should label the compared cells with `j` and
  `j+1`, rather than its pass counter `i` or saved value `temp`. Source subscript
  hints now provide variable/constant-offset arrows within array bounds. The original
  canvas layout is retained without a scalar panel. Regression tests cover both
  arrows, initialization, advancement, bounds, later `k` traversal, and custom names.
- BST return regression: injected current-frame inspection failures previously
  replaced all five values with zero and removed their child links. Absolute-address
  node reads now retry in another user frame. If no frame can read them, the previous
  verified state is explicitly labeled as retained, rather than replaced with invented
  zero/null values. Genuine zero values and null-child changes remain accepted.
- A real GDB check confirms all five BST values/links survive the outer return of
  the final insertion. The owner confirmed that source highlighting must intentionally
  show the executed line (previous debugger stop), not the next pending line; that
  behavior is restored and protected by a regression test and project skill guidance.
  Reproducing the exact live adapter error seen in the screenshot still requires
  a hands-on check; the injected regression establishes the error-handling defect.
- OOP linked-list recovery: traversal now uses the node record selected alongside
  its link fields, instead of the last pointer-bearing wrapper class. Object-owned
  heads are resolved in owner/caller frames through debugger members, including
  private groups, or member expressions. Tests cover the existing OOP example,
  the owner's class-based lifecycle code, renamed objects, empty containers, and
  preserved history. Real GDB confirms append, front insertion, deletion, private
  member access, and destructor cleanup. Manual extension UI confirmation is pending.
  The full pasted source also exposed a declaration-hint bug: `auto` inside the
  comment word `automatically` created a false variable and delayed initialization.
  Declaration scanning now masks comments/strings and uses keyword boundaries;
  a regression test preserves this case.

These automated checks do not establish that a newly packaged extension has been
manually checked in the VS Code UI. Record that separately after it happens.

## Parser migration status

The Clang parser module remains available but is not integrated into the restored
runtime extractor. Source discovery still uses the previous regex implementation.
Do not describe the full Clang migration as complete. It requires a separate
verified integration that preserves runtime methods and returns useful metadata,
with compiler configuration, header filtering, diagnostics, and cache invalidation.

## Judging evidence to gather

- Design: actual footage of a complete open → visualize → step → inspect → history journey.
- Potential Impact: owner identifies the learner and the precise confusion this resolves.
- Innovation/Idea: demonstrate runtime C++ state synchronized with the visual explanation.
  Do not claim competitor superiority without evidence.
- Presentation: show the program and result legibly; describe only verified capabilities.

This checklist does not certify eligibility or predict a prize. Devpost determines eligibility.
