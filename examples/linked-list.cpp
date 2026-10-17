#include <iostream>

// Structure for a Node in the Binary Search Tree
struct Node {
    int data;
    Node* left;
    Node* right;

    Node(int val) {
        data = val;
        left = nullptr;
        right = nullptr;
    }
};

// Helper function to insert a new node into the BST
Node* insert(Node* root, int val) {
    if (root == nullptr) {
        return new Node(val);
    }
    if (val < root->data) {
        root->left = insert(root->left, val);
    } else {
        root->right = insert(root->right, val);
    }
    return root;
}

// Helper function to display the tree (Inorder traversal gives sorted order)
void inorder(Node* root) {
    if (root == nullptr) return;
    inorder(root->left);
    std::cout << root->data << " ";
    inorder(root->right);
}

/**
 * Searches for a target node and tracks its parent.
 */
void findNodeAndParent(Node* root, int item, Node*& loc, Node*& par) {
    loc = root;
    par = nullptr;

    while (loc != nullptr && loc->data != item) {
        par = loc;
        if (item < loc->data) {
            loc = loc->left;
        } else {
            loc = loc->right;
        }
    }
}

/**
 * CASE A: Handles deletion of a node (loc) with ZERO or ONE child.
 */
void caseA(Node*& root, Node* loc, Node* par) {
    Node* child = nullptr;
    if (loc->left != nullptr) {
        child = loc->left;
    } else {
        child = loc->right;
    }

    if (par == nullptr) {
        root = child;             // Node to delete is the root
    } else if (loc == par->left) {
        par->left = child;        // Node is a left child
    } else {
        par->right = child;       // Node is a right child
    }

    delete loc;
}

/**
 * CASE B: Handles deletion of a node (loc) with TWO children.
 * Finds the inorder successor, copies its value, and deletes the successor.
 */
void caseB(Node*& root, Node* loc) {
    // Find the inorder successor (leftmost node in the right subtree)
    Node* parSuccessor = loc;
    Node* successor = loc->right;

    while (successor->left != nullptr) {
        parSuccessor = successor;
        successor = successor->left;
    }

    // Copy the successor's data to the original node
    loc->data = successor->data;

    // Delete the duplicate successor node using Case A logic
    caseA(root, successor, parSuccessor);
}

/**
 * Main routing function to safely delete any node from the tree.
 */
void deleteNode(Node*& root, int item) {
    Node* loc = nullptr;
    Node* par = nullptr;

    // Locate the item and its parent
    findNodeAndParent(root, item, loc, par);

    // Error handling: Node not found
    if (loc == nullptr) {
        std::cout << "Error: Value " << item << " not found in the tree.\n";
        return;
    }

    // Route based on the number of children
    if (loc->left != nullptr && loc->right != nullptr) {
        caseB(root, loc); // Node has two children
    } else {
        caseA(root, loc, par); // Node has zero or one child
    }
}

int main() {
    Node* root = nullptr;

    // Building a sample BST
    //          50
    //        /    \
    //      30      70
    //     /  \    /  \
    //    20  40  60  80
    root = insert(root, 50);
    root = insert(root, 30);
    root = insert(root, 70);
    root = insert(root, 20);
    root = insert(root, 40);
    root = insert(root, 60);
    root = insert(root, 80);

    std::cout << "Original tree (Inorder): ";
    inorder(root);
    std::cout << "\n\n";

    // --- TEST 1: Delete a leaf node (0 children) ---
    std::cout << "--- Test 1: Deleting leaf node 20 ---\n";
    deleteNode(root, 20);
    std::cout << "Tree: "; inorder(root); std::cout << "\n\n";

    // --- TEST 2: Delete a node with 1 child ---
    // Let's delete 30 after its left child (20) was removed, so it only has child 40
    std::cout << "--- Test 2: Deleting node 30 (has 1 child) ---\n";
    deleteNode(root, 30);
    std::cout << "Tree: "; inorder(root); std::cout << "\n\n";

    // --- TEST 3: Delete a node with 2 children ---
    std::cout << "--- Test 3: Deleting node 70 (has 2 children: 60 and 80) ---\n";
    deleteNode(root, 70);
    std::cout << "Tree: "; inorder(root); std::cout << "\n\n";

    // --- TEST 4: Delete the Root Node ---
    std::cout << "--- Test 4: Deleting the root node 50 ---\n";
    deleteNode(root, 50);
    std::cout << "Tree: "; inorder(root); std::cout << "\n\n";

    // --- TEST 5: Edge Case (Item doesn't exist) ---
    std::cout << "--- Test 5: Attempting to delete non-existent node 99 ---\n";
    deleteNode(root, 99);

    return 0;
}
