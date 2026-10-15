#include <iostream>

// Standard GeeksforGeeks Node definition
struct Node {
    int data;
    struct Node* next;
    Node() : data(0), next(nullptr) {}
    Node(int d) : data(d), next(nullptr) {}
};

// Given a reference (pointer to pointer) to the head of a list and an int, inserts a new node on the front
void push(Node** head_ref, int new_data) {
    Node* new_node = new Node(new_data);
    new_node->next = (*head_ref);
    (*head_ref) = new_node;
}

// Given a reference to the head and a key, deletes the first occurrence of key
void deleteNode(Node** head_ref, int key) {
    Node* temp = *head_ref;
    Node* prev = nullptr;

    if (temp != nullptr && temp->data == key) {
        *head_ref = temp->next;
        delete temp;
        return;
    }

    while (temp != nullptr && temp->data != key) {
        prev = temp;
        temp = temp->next;
    }

    if (temp == nullptr) return;

    prev->next = temp->next;
    delete temp;
}

int main() {
    Node* head = nullptr;

    push(&head, 7);
    push(&head, 1);
    push(&head, 3);
    push(&head, 2);

    std::cout << "Created Linked list: " << head->data << " -> " << head->next->data << std::endl;

    deleteNode(&head, 1);

    std::cout << "Linked List after Deletion of 1: " << head->data << std::endl;

    return 0;
}
