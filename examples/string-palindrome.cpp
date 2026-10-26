#include <iostream>
#include <string>

bool isPalindrome(const std::string& s) {
    int left = 0;
    int right = s.length() - 1;
    while (left < right) {
        if (s[left] != s[right]) {
            return false;
        }
        left++;
        right--;
    }
    return true;
}

int main() {
    std::string word = "racecar";
    bool result = isPalindrome(word);
    std::cout << word << " is palindrome? " << (result ? "true" : "false") << std::endl;
    return 0;
}
