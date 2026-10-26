#include <iostream>

int main() {
    char greeting[] = "Hello World";
    char* ptr = greeting;
    int length = 0;

    while (*ptr != '\0') {
        length++;
        ptr++;
    }

    std::cout << "String: " << greeting << ", Length: " << length << std::endl;
    return 0;
}
