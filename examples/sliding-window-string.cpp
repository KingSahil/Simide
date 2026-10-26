#include <iostream>
#include <string>
#include <vector>
#include <algorithm>

int lengthOfLongestSubstring(std::string s) {
    std::vector<int> charIndex(256, -1);
    int maxLen = 0;
    int windowStart = 0;
    
    for (int windowEnd = 0; windowEnd < (int)s.length(); windowEnd++) {
        char c = s[windowEnd];
        if (charIndex[(unsigned char)c] >= windowStart) {
            windowStart = charIndex[(unsigned char)c] + 1;
        }
        charIndex[(unsigned char)c] = windowEnd;
        maxLen = std::max(maxLen, windowEnd - windowStart + 1);
    }
    return maxLen;
}

int main() {
    std::string text = "abcabcbb";
    int ans = lengthOfLongestSubstring(text);
    std::cout << "Longest substring without repeating characters: " << ans << std::endl;
    return 0;
}
