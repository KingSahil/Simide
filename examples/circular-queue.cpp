// Circular Queue (FIFO) Operations Example
// Standard circular buffer queue implementation with front/rear wrap-around
#include <iostream>

struct CircularQueue {
    int arr[5];
    int front;
    int rear;
    int capacity;
    int count;

    CircularQueue() {
        front = -1;
        rear = -1;
        capacity = 5;
        count = 0;
    }

    bool isFull() const {
        return (front == 0 && rear == capacity - 1) || (rear + 1) % capacity == front;
    }

    bool isEmpty() const {
        return front == -1;
    }

    bool enqueue(int val) {
        if (isFull()) {
            std::cout << "Queue Overflow! Cannot enqueue " << val << "\n";
            return false;
        }

        if (isEmpty()) {
            front = 0;
            rear = 0;
        } else {
            rear = (rear + 1) % capacity;
        }

        arr[rear] = val;
        count++;
        std::cout << "Enqueued: " << val << " at rear " << rear << ", front is " << front << "\n";
        return true;
    }

    int dequeue() {
        if (isEmpty()) {
            std::cout << "Queue Underflow! Cannot dequeue\n";
            return -1;
        }

        int val = arr[front];
        if (front == rear) {
            front = -1;
            rear = -1;
        } else {
            front = (front + 1) % capacity;
        }
        count--;
        std::cout << "Dequeued: " << val << ", new front: " << front << "\n";
        return val;
    }

    int getFront() const {
        if (isEmpty()) return -1;
        return arr[front];
    }

    int getRear() const {
        if (isEmpty()) return -1;
        return arr[rear];
    }
};

int main() {
    CircularQueue q;

    // Fill slots 0, 1, 2, 3
    q.enqueue(10);
    q.enqueue(20);
    q.enqueue(30);
    q.enqueue(40);

    // Dequeue two elements from front (slots 0 and 1 freed)
    int first = q.dequeue();
    int second = q.dequeue();

    // Enqueue element into slot 4 (rear reaches end of array)
    q.enqueue(50);

    // Wrap around! Slot 4 -> Slot 0: (4 + 1) % 5 = 0
    q.enqueue(60);

    std::cout << "Circular Queue front: " << q.getFront() << " at index " << q.front << "\n";
    std::cout << "Circular Queue rear: " << q.getRear() << " at index " << q.rear << "\n";
    return 0;
}
