#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
};

int main() {
    Node* head = nullptr;
    Node* first = new Node{10, nullptr};
    head = first;
    Node* second = new Node{20, nullptr};
    first->next = second;
    Node* third = new Node{30, nullptr};
    second->next = third;
    return 0;
}
