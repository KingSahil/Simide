---
doc: prd
status: draft
created: 2026-10-24
---

# SimIDE — Product Requirements

SimIDE helps students, teachers, and independent learners understand C++ data
structure programs by watching their execution inside VS Code.
Source: `scope.md > Who It's For` and `scope.md > The Unique Kernel`.

## Document Status and Decision Sources

This document was prepared after an existing implementation, during the October 24
recovery and submission-planning conversation. The owner supplied the audience,
paste-code learning goal, and seven structure categories. They requested continued
work without specifying operations. The operations, representations, and limits below
are explicit agent proposals for review. No claim is made that this document guided
earlier commits or that the proposed features are already implemented.

## The Core Journey

Source: `scope.md > The Core Loop` and `scope.md > What "Working" Looks Like`.

1. Open a complete C++ program in VS Code, either written by the learner or obtained
   from a source they may use. Pasting a function alone may require a runnable driver.
2. Open the SimIDE sidebar and select Visualize.
3. See preparation and compilation progress, then a paused program with a source location.
4. Advance execution. See the relevant structure, values, and pointer/index roles
   change in sync with the program. Read an explanation of the observed change.
5. Select Previous to inspect an earlier saved state; move forward through history
   and then resume live stepping. History review does not reverse the running process.
6. Observe completion and the final state, or a clear error with a way to correct/retry.
7. Restart or open another supported example to explore another operation.

## Screens and Layout

Preserve the existing editor plus SimIDE sidebar. Keep the visualization, execution
controls, explanation, and program-output area together. Source highlighting connects
the diagram to the current program location. A separate website, account, or dashboard
is not proposed for this proof of concept.

## Look and Feel

The owner has not requested a redesign. Preserve the current dark interface, readable
values, pointer arrows, pan/zoom, and visual emphasis for changed elements. New modes
should use the same controls and avoid displaying debugger internals as learning content.
This is a proposal to preserve existing styling, not a newly elicited aesthetic preference.

## Features and Behavior

### Execution and Navigation

- Visualize operates on the selected C++ source file and reports failures visibly.
- Next advances execution at a supported source location. Step In/Out remain available.
- Previous displays a saved snapshot without mutating it or advancing execution.
- Restart clears the previous session's state and begins a fresh session.
- Owner requirement: highlight the line whose execution produced the displayed state
  (the previous debugger stop), rather than the debugger's next pending line. Preserve
  this association in history; the offset from the native debugger arrow is intentional.
- A failed startup replaces progress with a useful error and offers retry.
- Unsupported values must be identified as unavailable; the view must not invent data.

Acceptance: the array example reaches debugger launch, values change with stepping,
history remains unchanged after further execution, and an injected startup failure
displays an error and permits a successful retry.

### Arrays

Source: `scope.md > The POC Boundary`. Owner provided the concrete array example.

Proposed baseline: built-in one-dimensional integer arrays and `std::vector<int>`.
Show indices, values, and a relevant traversal index when available.

Acceptance: `[10,20,30,40,50]` becomes `[10,20,99,40,50]`, then
`[20,10,99,40,50]`. Traversal output is `20 10 99 40 50`. An empty vector stays empty;
it must not acquire placeholder elements.

### Stacks

Proposed baseline: `std::stack<int>` with its default underlying container. Show
elements in a clearly labeled bottom-to-top order and identify the current top.

Acceptance: push 10 then 20; top is 20; pop reveals 10; the final pop produces a visible
empty state. Reading visualization data must not pop or otherwise mutate the program.
Custom array-backed or linked-list-backed stack recognition is not yet promised.

### Queues

Proposed baseline: `std::queue<int>` with its default underlying container. Show
front-to-back order and label both ends.

Acceptance: enqueue 10 then 20; front is 10 and back is 20; dequeue removes 10;
the next dequeue produces a visible empty queue. Inspection must not dequeue values.
Circular-buffer and priority-queue modes are outside this proposed baseline.

### Strings

Proposed baseline: `std::string` containing ordinary ASCII characters. Show character
indices and distinguish a space from an absent character.

Acceptance: initialize `"cat"`, replace index 0 with `b`, append `!`, and show `"bat!"`.
Traversal visits indices 0 through 3. Empty strings remain visibly empty. Unicode
grapheme interpretation and arbitrary C-style string pointers are not yet promised.

### Linked Lists

Proposed baseline: singly linked integer nodes with a data field and one successor
pointer, plus the existing tested examples. Source metadata should allow custom
record/field names without relying only on `Node` and `next`.

Acceptance: allocate nodes, link them, follow a traversal pointer, reverse a three-node
list, unlink/delete a node, and preserve stable identities and past snapshots.
The custom-name example must include a successor field such as `Entry* successor`.

### Binary Search Trees

Proposed baseline: integer BST nodes with two child pointers. Show parent/child
relationships and the active traversal node.

Acceptance: insert 50, 30, 70; show the correct left/right relationship; demonstrate
inorder traversal; verify a leaf deletion and a single-child deletion. Two-child
deletion, balanced-tree rotations, and arbitrary tree representations are deferred proposals.

### Graphs

Proposed baseline: an unweighted adjacency-list graph represented by
`std::vector<std::vector<int>>`, with vertices indexed from zero and directed edges.
An undirected example explicitly inserts both directions. Do not infer graph intent
from every nested vector; the learner must have a clear way to select the graph view.

Acceptance: show vertices 0–3 including isolated vertex 3; show edges 0→1 and 0→2;
follow BFS from 0 with order 0,1,2. Adding/removing an edge updates the diagram.
Cycles must not cause endless visual traversal. Weighted edges and shortest-path
algorithms are not part of this proposed first example.

## States and Boundaries

- **Before use:** explain that a complete C++ program, compiler, and debugger are required.
- **Preparing:** show the current stage; repeated clicks must not start overlapping sessions.
- **Before initialization:** distinguish uninitialized data from an initialized empty container.
- **Paused/live:** show a source location and trustworthy observed state.
- **Historical:** identify saved state clearly; Previous does not rewind the executable.
- **Completed:** retain inspectable results without presenting them as a live process.
- **Build failure:** show compiler diagnostics and allow correction/retry.
- **Unsupported representation:** identify the unsupported value or container; do not silently
  substitute an unrelated structure or assume a missing numeric value is zero.
- **Large data:** apply a documented display limit with an explicit truncation indication.
- **Session lifetime:** snapshots are in-memory and reset on a fresh visualization; no account
  or cross-restart persistence is proposed.

## Product Decisions

- Owner: intended audience is students, teachers, and learners worldwide.
- Owner: the learning journey starts with C++ code in VS Code and proceeds line by line.
- Owner: scope includes arrays, stacks, queues, strings, linked lists, BSTs, and graphs.
- Agent proposal: use the bounded operations and representations above to make that scope testable.
- Agent proposal: preserve the existing interface and extend it without a redesign.

## What We're Building

One working end-to-end example for each selected category, shared execution/history
controls, honest error states, reproducible installation, and a demonstrable learning
journey. A category is complete only after extraction, rendering, explanation,
automated verification, and hands-on checks agree.

## Deferred From the POC

Proposed for review: arbitrary library internals, every custom implementation of a
container, weighted-graph algorithms, advanced tree variants, universal support for
all copied snippets, and multi-structure mixed-program guarantees. These limits
protect an observable, reliable proof rather than silently dropping a selected category.

## Non-Goals

No claims of measured learning improvement, universal C++ compatibility, or completed
Clang integration without evidence. No external code-source integration is implied.

## Open Questions

- Review proposed operations, representation limits, and error behavior with the owner
  before declaring this PRD approved.
- Confirm styling preservation during the hands-on review; no owner design preference
  has been invented here.
