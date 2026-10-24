---
doc: scope
status: draft
created: 2026-10-24
---

# SimIDE

A VS Code extension that helps learners understand their C++ data structure programs
by stepping through execution and seeing the corresponding structures change.

## Planning Context

This draft captures the owner's intentions supplied on October 24, 2026 and guides
the remaining proof-of-concept and submission work. Existing implementation predates
this document; it is not evidence of planning before that implementation.

## The Unique Kernel

Visualize the learner's own running C++ program inside VS Code, with source stepping
connected to the changing data structure. The owner's key demonstration is pasting
an unfamiliar DSA example into the editor and using the visualization to understand
what happens line by line.

## Who It's For

Students struggling to follow a university or interview-practice C++ DSA example;
teachers explaining those programs; and independent learners working through similar
code. The immediate situation is someone who can read an example but feels stuck
understanding how its data structure changes as it executes.

## The Core Loop

1. Write or paste a C++ DSA example into VS Code.
2. Start SimIDE's visualization for that file.
3. Step through the program and inspect the corresponding structure changes.
4. Use those changes to reason about the example; repeat with the next operation
   or another supported example when stuck.

## Inspiration & Identity

The owner identified university code and examples encountered through LeetCode,
GeeksforGeeks, Google AI, and ChatGPT as learning contexts. These are sources of
programs learners may want to understand, not claims of integration or endorsement.
The owner has not yet specified a visual reference or requested a redesign.

## Why This Matters to the Learner

The owner wants students, teachers, and other learners to gain a clearer understanding
of basic data structures through the code they are already working with. Their stated
ambition is worldwide usefulness. Improved learning outcomes have not yet been measured.

## What "Working" Looks Like

A learner opens a supported, compilable C++ example in VS Code, starts visualization,
and steps through it. The displayed structure changes with the executing program so
they can follow an operation that was previously difficult to understand.

The owner's requested array example is one concrete candidate: initialize five values,
change the third value to 99, swap the first two, and traverse the resulting array.
Automated compilation and GDB checks pass; the final hands-on extension demonstration
is still pending.

## The POC Boundary

The owner selected all seven of the following for the hackathon proof of concept:

- Arrays.
- Stacks.
- Queues.
- Strings.
- Linked lists.
- Binary search trees (BSTs).
- Graphs.

Each selected structure must have an executable example whose changing state can
be visualized while stepping through the C++ source. After the owner requested that
work continue, the agent proposed the following concrete baseline for review:

| Structure | Proposed demonstration |
| --- | --- |
| Array | Initialization, element update, swap, indexed traversal. |
| Stack | Push, inspect top, pop, return to empty. |
| Queue | Enqueue, inspect front/back, dequeue, return to empty. |
| String | Character indexing, replacement, append, character traversal. |
| Linked list | Allocate, link, traverse, reverse, unlink/delete. |
| BST | Insert, inspect parent/children, traverse, delete a leaf or single-child node. |
| Graph | Add vertices/edges and follow a breadth-first traversal, including a disconnected vertex. |

These operations are agent proposals, not additional owner statements or verified
capabilities. Proposed C++ representations and acceptance criteria are in the draft
`prd.md` and `spec.md`. Approval of the reviewed documents is still pending.

Current automated evidence covers arrays, linked-list examples, and binary search
trees. That is an implementation observation, not an approved limit on the owner's
intended product. Stacks, queues, strings, and graphs require further implementation
assessment and verification. Support for arbitrary C++ programs or arbitrary online
examples has not been established by these checks.

## Later

No selected structure has been deferred. The agent proposes deferring arbitrary
custom container layouts, weighted-graph algorithms, and advanced tree variants
until the seven baseline demonstrations work reliably. These are proposed cuts
for review, not owner-approved exclusions.

## Explicitly Cut

No additional product cuts have been approved. The agent recommends avoiding a
promise of universal C++ visualization: complete, compilable examples and a tested
set of representations make the proof of concept verifiable.

## Open Questions Before Approval

- Review the proposed operations and representations with the owner.
- Confirm the proposed limits and error behavior in `prd.md > States and Boundaries`.
- Leave status draft until the displayed documents have been approved; a request
  to continue preparing documents is not a claim of having reviewed unseen contents.
