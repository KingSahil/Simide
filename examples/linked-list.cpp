#include <iostream>

// Represents an individual node in the linked list
class Node {
public:
    int data;
    Node* next;

    // Constructor to initialize a node with data
    Node(int val) : data(val), next(nullptr) {}
};

// Manages the linked list and its operations
class LinkedList {
private:
    Node* head; // Pointer to the first node

public:
    // Constructor initializes an empty list
    LinkedList() : head(nullptr) {}

    // Destructor to free dynamically allocated memory and prevent leaks
    ~LinkedList() {
        Node* current = head;
        while (current != nullptr) {
            Node* nextNode = current->next;
            delete current;
            current = nextNode;
        }
        head = nullptr;
    }

    // 1. Insert a new node at the front (head) of the list
    void insertAtHead(int val) {
        Node* newNode = new Node(val);
        newNode->next = head;
        head = newNode;
    }

    // 2. Insert a new node at the end (tail) of the list
    void append(int val) {
        Node* newNode = new Node(val);
        
        // If the list is empty, make the new node the head
        if (head == nullptr) {
            head = newNode;
            return;
        }

        // Traverse to the last node
        Node* temp = head;
        while (temp->next != nullptr) {
            temp = temp->next;
        }
        temp->next = newNode;
    }

    // 3. Delete the first occurrence of a node containing the given value
    void deleteValue(int val) {
        if (head == nullptr) return; // Empty list

        // Case 1: The node to delete is the head node
        if (head->data == val) {
            Node* temp = head;
            head = head->next;
            delete temp;
            return;
        }

        // Case 2: The node is somewhere else in the list
        Node* current = head;
        Node* prev = nullptr;

        while (current != nullptr && current->data != val) {
            prev = current;
            current = current->next;
        }

        // If the value wasn't found in the list
        if (current == nullptr) return;

        // Unlink the node from the list and delete it
        prev->next = current->next;
        delete current;
    }

    // 4. Display the complete linked list
    void printList() const {
        Node* temp = head;
        while (temp != nullptr) {
            std::cout << temp->data << " -> ";
            temp = temp->next;
        }
        std::cout << "nullptr" << std::endl;
    }
};

int main() {
    LinkedList list;

    // Build the list
    list.append(10);
    list.append(20);
    list.append(30);
    std::cout << "List after appending 10, 20, 30:\n";
    list.printList();

    // Insert at front
    list.insertAtHead(5);
    std::cout << "\nList after inserting 5 at the front:\n";
    list.printList();

    // Delete a node
    list.deleteValue(20);
    std::cout << "\nList after deleting 20:\n";
    list.printList();

    // The destructor automatically cleans up memory when 'list' goes out of scope
    return 0;
}