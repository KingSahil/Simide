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
 * Updates the 'loc' and 'par' references.
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
 * Handles the deletion of a node (loc) with zero or one child.
 */
void caseA(Node*& root, Node* loc, Node* par) {
    // Step 1: Identify the child node (if any exists)
    Node* child = nullptr;
    if (loc->left != nullptr) {
        child = loc->left;
    } else {
        child = loc->right;
    }

    // Step 2: Replace the node at loc with its child
    if (par == nullptr) {
        root = child;             // Node to delete is the root
    } else if (loc == par->left) {
        par->left = child;        // Node is a left child
    } else {
        par->right = child;       // Node is a right child
    }

    // Step 3: Free the memory allocated for the deleted node
    delete loc;
}

int main() {
    Node* root = nullptr;

    // Building a sample BST
    //          50
    //        /    \
    //      30      70
    //        \    /
    //        40  60
    root = insert(root, 50);
    root = insert(root, 30);
    root = insert(root, 70);
    root = insert(root, 40);
    root = insert(root, 60);

    std::cout << "Original tree (Inorder): ";
    inorder(root);
    std::cout << "\n\n";

    // --- TEST 1: Delete a leaf node (40) ---
    std::cout << "--- Test 1: Deleting leaf node 40 ---" << std::endl;
    Node* loc = nullptr;
    Node* par = nullptr;
    
    findNodeAndParent(root, 40, loc, par);
    if (loc != nullptr) {
        caseA(root, loc, par);
        std::cout << "Tree after deleting 40: ";
        inorder(root);
        std::cout << "\n\n";
    }

    // --- TEST 2: Delete a node with one child (30) ---
    // (After 40 was deleted, 30 now has no children, so let's pick 70 which has child 60)
    std::cout << "--- Test 2: Deleting node 70 (has one child: 60) ---" << std::endl;
    findNodeAndParent(root, 70, loc, par);
    if (loc != nullptr) {
        caseA(root, loc, par);
        std::cout << "Tree after deleting 70: ";
        inorder(root);
        std::cout << "\n";
    }

    return 0;
}
