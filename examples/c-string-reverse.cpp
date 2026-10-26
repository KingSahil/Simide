#include <iostream>
#include <cstring>
#include <algorithm>

int main() {
    char str[10] = "hello";
    int i = 0;
    int j = strlen(str) - 1;
    while (i < j) {
        std::swap(str[i], str[j]);
        i++;
        j--;
    }
    std::cout << "Reversed: " << str << std::endl;
    return 0;
}
