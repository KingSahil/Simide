#include <iostream>

// Standard LeetCode ListNode definition
struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

// LeetCode 206: Reverse Linked List
ListNode* reverseList(ListNode* head) {
    ListNode* prev = nullptr;
    ListNode* curr = head;
    while (curr != nullptr) {
        ListNode* forward = curr->next;
        curr->next = prev;
        prev = curr;
        curr = forward;
    }
    return prev;
}

int main() {
    ListNode* head = new ListNode(1);
    head->next = new ListNode(2);
    head->next->next = new ListNode(3);

    std::cout << "Original: " << head->val << " -> " << head->next->val << " -> " << head->next->next->val << std::endl;

    ListNode* reversedHead = reverseList(head);

    std::cout << "Reversed: " << reversedHead->val << " -> " << reversedHead->next->val << " -> " << reversedHead->next->next->val << std::endl;

    return 0;
}
