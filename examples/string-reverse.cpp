#include <algorithm>
#include <iostream>
#include <string>


void reverseString(std::string &s) {
  int left = 0;
  int right = s.length() - 1;
  while (left < right) {
    std::swap(s[left], s[right]);
    left++;
    right--;
  }
}

nd e aint main() {
  std::string str = "algorithm";
  reverseString(str);
  std::cout << "Reversed string: " << str << std::endl;
  return 0;
}
