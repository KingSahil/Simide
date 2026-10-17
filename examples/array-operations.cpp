#include <iostream>
using namespace std;

int main() {
    // 1. Array declaration & initialization
    int arr[5] = {10, 20, 30, 40, 50};

    // 2. Element update
    arr[2] = 99;

    // 3. Swap two elements
    int temp = arr[0];
    arr[0] = arr[1];
    arr[1] = temp;

    // 4. Traversal loop with index pointer i
    for (int i = 0; i < 5; i++) {
        cout << arr[i] << " ";
    }
    cout << endl;

    return 0;
}
