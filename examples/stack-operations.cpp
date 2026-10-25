// Stack (LIFO) Operations Example
// Standard array-based stack implementation with push, pop, and peek
#include <iostream>

struct Stack {
    int arr[6];
    int top;
    int capacity;

    Stack() {
        top = -1;
        capacity = 6;
    }

    bool isFull() const {
        return top >= capacity - 1;
    }

    bool isEmpty() const {
        return top < 0;
    }

    bool push(int val) {
        if (isFull()) {
            std::cout << "Stack Overflow! Cannot push " << val << "\n";
            return false;
        }
        top++;
        arr[top] = val;
        std::cout << "Pushed: " << val << " at top index " << top << "\n";
        return true;
    }

    int pop() {
        if (isEmpty()) {
            std::cout << "Stack Underflow! Cannot pop\n";
            return -1;
        }
        int popped = arr[top];
        top--;
        std::cout << "Popped: " << popped << ", new top: " << top << "\n";
        return popped;
    }

    int peek() const {
        if (isEmpty()) {
            std::cout << "Stack is empty\n";
            return -1;
        }
        std::cout << "Peeked: " << arr[top] << " at top index " << top << "\n";
        return arr[top];
    }
};

int main() {
    Stack s;

    // Push elements into stack
    s.push(10);
    s.push(20);
    s.push(30);

    // Peek at current top
    int topVal = s.peek();

    // Pop top element (LIFO)
    int poppedVal = s.pop();

    // Push another element
    s.push(40);

    int finalTop = s.peek();
    std::cout << "Final stack top value: " << finalTop << "\n";
    return 0;
}
