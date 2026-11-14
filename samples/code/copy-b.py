# bai tong
def read_numbers():
    parts = input().split()
    first = int(parts[0])
    second = int(parts[1])
    return first, second

def add(p, q):
    total = 0
    total = total + p
    total = total + q
    return total

def main():
    a, b = read_numbers()
    print(add(a, b))

main()
