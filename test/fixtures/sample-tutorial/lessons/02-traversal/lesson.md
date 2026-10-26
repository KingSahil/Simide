# Lesson 2: Recursive Inorder Traversal

Inorder traversal visits nodes in non-decreasing order: **Left $\rightarrow$ Root $\rightarrow$ Right**.

### Algorithm
1. Recursively traverse the left subtree.
2. Visit and print the root node.
3. Recursively traverse the right subtree.

### What to Observe:
- Notice how `inorder` pulses the visited node green (`isVisiting: true`).
- Watch terminal output display: `30 50 70`.
