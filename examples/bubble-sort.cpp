#include <iostream>
using namespace std;

// Bubble Sort demonstration in SimIDE
// Step through with "Next" to watch:
// 1. Index pointers (j, j+1) mark the adjacent elements being compared
// 2. Elements compare and glow
// 3. Adjacent out-of-order elements swap with hop animations
// 4. Drag any card anywhere across the canvas - release to bounce back!
int main() {
    int arr[5] = {64, 34, 25, 12, 22};
    int n = 5;

    cout << "Starting Bubble Sort on array of size 5..." << endl;

    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            // Compare adjacent elements
            if (arr[j] > arr[j + 1]) {
                // Swap adjacent elements
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }

    cout << "Sorted array: ";
    for (int k = 0; k < n; k++) {
        cout << arr[k] << " ";
    }
    cout << endl;

    return 0;
}
