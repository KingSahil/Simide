# Lesson 1: Tree Node Allocation & Child Insertion

In this lesson, you will learn how **Binary Search Trees (BST)** store hierarchical data using pointer links.

### Concepts
1. **Heap Allocation:** When `new Node(val)` executes, memory is allocated on the heap.
2. **Left vs Right Branch:**
   - Values smaller than root (`val < root->data`) become the **left child**.
   - Values larger than root (`val > root->data`) become the **right child**.

### What to Observe:
- Step through line 24 (`root = insert(root, 50)`): The root node appears on canvas.
- Step through line 25 (`root = insert(root, 30)`): Node 30 links as the left child.
- Step through line 26 (`root = insert(root, 70)`): Node 70 links as the right child.
