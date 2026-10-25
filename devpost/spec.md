---
doc: spec
status: draft
created: 2026-10-24
---

# SimIDE — Technical Spec

## Status and Implementation Boundary

This is an October 24 specification for recovery and remaining work, written after
the initial implementation. Scope and product requirements remain drafts awaiting
review. Existing architecture is described as observed; proposed extensions are
labeled below. This document does not establish past planning or completed features.

## How This Works, In Plain Language

SimIDE compiles the learner's C++ program and starts a debugger. Each pause supplies
the live values and pointer addresses. Source analysis describes declarations and
fields, helping the extension interpret those values. SimIDE saves a snapshot and
draws the corresponding structure next to the code. Previous displays an earlier
snapshot rather than undoing the C++ program.

Clang's AST is structured source information, not a source of live runtime values.
The immediate recovery restores the old runtime extractor. A later, separately tested
change should connect Clang to source discovery without deleting runtime behavior.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

1. Visualize reaches `LinkedListViewProvider.startVisualization()`.
2. `CppCompiler` resolves the source and builds an executable with debug symbols.
3. Session reset clears identity/deletion/output tracking. Source metadata is prepared
   before runtime queries need it once the AST integration exists.
4. `DebugSessionManager` launches the C/C++ debug adapter.
5. `DebugTrackerFactory` observes a pause; `StateExtractor` requests stack/scopes,
   variables, and supported non-mutating evaluations from the debugger.
6. Extraction produces the shared snapshot; `ExplanationGenerator` describes changes;
   `SnapshotManager` records history; the provider posts the state to the webview.
7. `webview/app.ts` renders the selected structure and source highlighting is updated.
8. Errors replace progress. Restart clears prior-session state and repeats the journey.

Owner-confirmed highlighting policy: associate each snapshot with the executed line
that produced it, using the previous debugger stop. Do not replace it with the current
frame's next pending line. Frame selection for runtime reads is a separate concern.

## Stack

Preserve the repository's installed architecture rather than introduce a new framework:

- TypeScript with strict checking; manifest range `^5.3.3`.
- VS Code extension API, minimum engine `^1.85.0`.
- Node extension host and `child_process.execFile` for compiler/parser processes.
- esbuild, manifest range `^0.20.0`, for extension and browser bundles.
- Existing HTML/CSS/TypeScript webview and bundled d3-force (`^3.0.0`).
- C++17, debug symbols, no optimization in the current compiler path.
- C/C++ extension (`ms-vscode.cpptools`) with the Debug Adapter Protocol.
- GDB on Windows/MinGW is the environment verified in this recovery. Other compiler,
  platform, standard-library, and LLDB combinations require separate tests before claims.

The manifest ranges describe this repository, not recommendations for latest versions.
Existing choices are observed architecture; proposed extensions preserve them.

Documentation references: [VS Code extensions](https://code.visualstudio.com/api),
[Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/),
[Node child processes](https://nodejs.org/api/child_process.html),
[esbuild](https://esbuild.github.io/), [d3-force](https://d3js.org/d3-force).

## Where It Runs and How Someone Tries It

Run locally in VS Code with a C++ compiler, GDB, and the Microsoft C/C++ extension.
Use an environment able to run the repository's pinned development tooling. This
recovery used the installed Node runtime; a broad minimum Node compatibility claim
requires validation against the locked dependencies.

From the repository root:

```sh
npm ci
npm run compile
npm test
```

Open this repository in VS Code and press F5 to launch its Extension Development Host.
In that host, open `examples/array-operations.cpp`, open SimIDE, and click Visualize.
Step through the array example. F5 alone does not initiate a visualization.

Local packaging:

```sh
npx vsce package --out dist/simide-ide-recovery.vsix
```

Install through Extensions → Install from VSIX and reload if needed. The existing
root VSIX predates the recovery; use the newly built artifact. Compilation runs
type checking before bundling. Publishing or submitting is a separate authorized step.

Submission needs a public source repository and public demo video. No hosted backend,
paid service, API key, or cloud deployment is needed for this architecture.

## Look and Feel

PRD ref: `prd.md > Look and Feel` and `prd.md > Screens and Layout`.

Retain existing dark CSS and execution controls. Extend the renderer with structure
specific labels: stack top/bottom, queue front/back, string indices, graph vertices
and edges. Preserve readable text, diagram/source synchronization, and visible errors.
Render user-controlled labels with text-safe DOM methods rather than executable markup.

## Components

### Startup and Compiler

PRD ref: `prd.md > Execution and Navigation`.

Keep `CppCompiler`, `DebugSessionManager`, and provider startup APIs. Recovery adds
timeouts to compiler discovery/build, a startup guard, and an error boundary so a
failed reset cannot leave Compiling displayed. Add a bounded debugger-pause wait and
explicit cleanup as a follow-up if the adapter never reaches entry. Runtime callback
errors also need a visible diagnostic rather than an unhandled promise rejection.

### Source Analysis

PRD ref: `prd.md > Linked Lists`, `prd.md > Binary Search Trees`.

Current: regex source discovery restored to recover the working debugger path.
Planned: use `src/parser/clangAstParser.ts` to invoke Clang asynchronously with
`-Xclang -ast-dump=json -fsyntax-only`; build a compact metadata index for records,
fields, variables, parameters, and function ranges. Replace the six source discovery
methods only after their AST equivalents have meaningful return values and tests.

Preserve runtime APIs including `reset`, `setActiveSourceFile`, `extractState`, source
helpers, address identity tracking, and the address-or-null `parsePointer` contract.
Classify self-referential records separately from parsing. Field names can help select
roles but must not be mandatory. Distinguish doubly linked structures from trees
instead of treating every two-pointer record as a tree.

Resolve compiler standard, defines, include directories, flags, and working directory
from the active build configuration or a matching `compile_commands.json` entry.
Use the same resolved configuration for build and analysis when supported; report
unsupported build setups explicitly. Execute argument arrays without a shell. Do not
execute compilation-database command strings directly. Normalize source locations,
including inherited/omitted Clang file locations, and filter system/unrelated headers.

Cache compact metadata by normalized file, content/configuration, and relevant header
changes; invalidate on edits and changed compilation settings. Keep traversal queries
in memory so debugger stepping does not run Clang repeatedly. A missing Clang binary,
syntax error, timeout, oversized output, or malformed JSON must produce a visible
diagnostic; do not cache a partial AST as a successful analysis. Whether a legacy
fallback is offered must be explicit, not silent.

### Runtime Structure Extraction

PRD ref: all seven structure sections under `prd.md > Features and Behavior`.

Keep debugger values authoritative. Add focused extractors rather than another wholesale
rewrite. The proposed first representation set is:

| Category | Representation | Snapshot information |
| --- | --- | --- |
| Arrays | Built-in integer arrays and `std::vector<int>` | Ordered elements and active indices. |
| Stacks | Default-container `std::stack<int>` | Bottom-to-top values and top marker. |
| Queues | Default-container `std::queue<int>` | Front-to-back values and end markers. |
| Strings | ASCII `std::string` | Characters, indices, length, changed positions. |
| Linked lists | Integer records with one successor | Stable address-based node IDs, links, pointers. |
| BSTs | Integer records with child pointers | Stable IDs, child links, traversal pointer. |
| Graphs | `std::vector<std::vector<int>>` | Vertex IDs, explicit directed edges, traversal state when readable. |

Validate standard-container child shapes using real GDB/DAP output before choosing
the extraction path. Prefer debugger-provided children/pretty printers. Public container
accessors may be optimized/inlined or unavailable; never assume `.size()` evaluation
works. Avoid algorithms that call pop/dequeue or execute helper code to obtain values.
If read-only extraction is unavailable, explain the unsupported environment instead
of fabricating values or changing the program. Test empty, duplicate, and multiple values.

Graph intent needs an explicit graph-view selection for compatible adjacency data.
Add that choice to existing controls/messages; avoid guessing from a nested vector's
shape. Include isolated vertices and use a visited set for cyclic traversals. Runtime
visited/frontier data may only be shown if observed from a supported example; do not
animate a separately simulated algorithm as if it were the student's execution.

### Snapshot Model and History

PRD ref: `prd.md > Execution and Navigation`, `prd.md > States and Boundaries`.

Extend `StructureType`, currently only `linked_list | tree | array`, with distinct
`stack`, `queue`, `string`, and `graph` modes. Add optional typed sequence/container
and graph payloads to the shared snapshot, preserving existing node/array fields.
Use one shared definition in extension and webview rather than drift-prone copies.

Represent unsupported/unavailable values explicitly, along with diagnostics and
truncation metadata. Distinguish uninitialized, initialized-empty, and populated states.
Do not use array fallback size five or substitute zero for unreadable data in new modes;
remove those misleading fallbacks in the array path as part of its hardening.
Historical snapshots must be immutable after insertion; test nested payload mutation.

### Explanation and Rendering

PRD ref: `prd.md > Screens and Layout` and each structure's acceptance criteria.

Add change descriptions for push/pop, enqueue/dequeue, string changes, and graph
edge/vertex changes based on consecutive snapshots. Do not use current-program
values to explain a historical frame. Reuse ordered-element styling for sequences
with correct labels; add a graph renderer with stable vertex identity and explicit
edges. An internal `graphCanvas` name does not currently provide graph-data support.

## Data Model

Current data lives in in-memory snapshots; node addresses map to session-stable IDs.
New snapshots should carry their mode, source location, extracted payload, diagnostics,
and observed changes. A new session clears identity, caches tied to the session,
deleted-address tracking, accumulated output, and snapshot history. Source metadata
may be reused only while its source/configuration signature remains valid.

## File Structure

```text
src/
  extension.ts                          existing extension activation
  debug/
    compiler.ts                         source build and bounded process execution
    debugSessionManager.ts              debug adapter launch/lifecycle
    debugAdapterTracker.ts              execution event tracking
    executionController.ts              shared stepping commands
    stateExtractor.ts                   preserved runtime extraction entry points
    containerExtractor.ts               proposed read-only stack/queue/string extraction
    graphExtractor.ts                   proposed adjacency-list extraction
  parser/
    clangAstParser.ts                   existing module, integration unfinished
    sourceMetadata.ts                   proposed compact declaration/field index
  visualization/
    linkedListModel.ts                  shared snapshot extensions
    explanationGenerator.ts             observed change explanations
    snapshotManager.ts                  session history
  sidebar/
    linkedListViewProvider.ts           lifecycle, controls, state posting
    messages.ts                         mode-selection and diagnostic messages
webview/
  app.ts                               existing renderer; add sequence/graph modes
  index.html                           current surface; proposed graph-mode selection
  styles.css                           shared visual language
examples/                              one complete program per selected category
test/                                  unit, startup, extraction, and real-debugger tests
devpost/                               scope, PRD, spec, checklist, readiness evidence
```

Proposed filenames are implementation guidance, not claims that those files exist.

## External Services and Dependencies

No network service is required for visualization. Compiler, debugger, and VS Code
extensions are local dependencies and must be installed by the learner. Their license
notices still apply. Repository/video hosting is needed for submission. Review example
provenance, library notices, and contributed assets before public submission; do not
assume an MIT project license grants rights to copied third-party material.

## Important Failure Modes

- Compiler/source error → diagnostic with retry; no indefinite progress indicator.
- Missing/unresponsive debugger or unavailable container children → explicit error or
  unavailable data; bounded waiting; release startup/session guards.
- Incomplete source metadata → visible Clang/configuration diagnostic; preserve runtime
  contracts and do not report partial analysis as success.
- Empty, cyclic, large, or invalid structures → honest empty/unavailable/truncated state
  and bounded traversal; never endless extraction or fabricated nodes.

## What Was Simplified and Why

Agent proposals: one local process, no backend/account, integer sequence containers,
ASCII strings, and one bounded graph representation. These keep all seven selected
categories demonstrable without claiming universal C++ support. They await plan review.
The recovery deliberately restores legacy source discovery while preserving runtime
inspection; this is a known temporary state, not a completed AST migration.

## Decisions and Open Issues

- Owner selected seven structure categories and authorized repair/preparation.
- Existing runtime architecture is preserved; implementation defaults above are agent
  proposals and must not be attributed to the owner before review.
- A real uncertainty raised by the owner was why compilation never appeared to end.
  Investigation showed a missing runtime `reset()` after successful compilation.
  Startup/error/retry tests verify the recovery; manual UI confirmation remains pending.
- New container extraction is the next material technical risk: prove GDB/DAP can read
  default stack/queue/string and nested-vector values without mutating the program.
- Graph mode selection, unsupported-type messaging, and representation limits need
  owner review as part of the combined draft plan.
- No claim of completed hands-on testing or full eligibility until the readiness
  checklist and submission materials have actually been checked.
