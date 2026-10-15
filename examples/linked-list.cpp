#include <iostream>

struct Node {
    int data;
    Node* next;
};

// Simplest Traversal Function
void printList(Node* head) {
    Node* current = head;
    while (current != nullptr) {
        std::cout << current->data << " -> ";
        current = current->next; // Move to the next node
    }
    std::cout << "NULL\n";
}

int main() {
    // 1. Create 3 isolated nodes
    Node* head = new Node{10, nullptr};
    Node* second = new Node{20, nullptr};
    Node* third = new Node{30, nullptr};

    // 2. Link them together
    head->next = second;
    second->next = third;

    // 3. Traverse and display
    printList(head);

    return 0;
}
