// For P0002 "Tổng dãy số": the sum (up to 5*10^9) does not fit in a 32-bit int.
#include <iostream>
int main() {
    int n, x, sum = 0;
    std::cin >> n;
    while (n--) { std::cin >> x; sum += x; }
    std::cout << sum << "\n";
}
