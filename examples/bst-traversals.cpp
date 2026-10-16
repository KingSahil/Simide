#include <iostream>

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
};

// BST Insertion Helper
TreeNode* insert(TreeNode* root, int val) {
    if (root == nullptr) {
        return new TreeNode(val);
    }
    if (val < root->val) {
        root->left = insert(root->left, val);
    } else {
        root->right = insert(root->right, val);
    }
    return root;
}

// 1. Preorder Traversal: Root -> Left -> Right
void preorder(TreeNode* root) {
    if (root == nullptr) return;
    std::cout << root->val << " ";
    preorder(root->left);
    preorder(root->right);
}

// 2. Inorder Traversal: Left -> Root -> Right (Produces sorted order for BST)
void inorder(TreeNode* root) {
    if (root == nullptr) return;
    inorder(root->left);
    std::cout << root->val << " ";
    inorder(root->right);
}

// 3. Postorder Traversal: Left -> Right -> Root
void postorder(TreeNode* root) {
    if (root == nullptr) return;
    postorder(root->left);
    postorder(root->right);
    std::cout << root->val << " ";
}

int main() {
    TreeNode* root = nullptr;

    // Build BST with 7 nodes
    root = insert(root, 50);
    insert(root, 30);
    insert(root, 70);
    insert(root, 20);
    insert(root, 40);
    insert(root, 60);
    insert(root, 80);

    std::cout << "Preorder: ";
    preorder(root);
    std::cout << "\n";

    std::cout << "Inorder: ";
    inorder(root);
    std::cout << "\n";

    std::cout << "Postorder: ";
    postorder(root);
    std::cout << "\n";

    return 0;
}
