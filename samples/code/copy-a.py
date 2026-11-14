# tinh tong hai so nguyen
def doc_hai_so():
    dong = input().split()
    so_thu_nhat = int(dong[0])
    so_thu_hai = int(dong[1])
    return so_thu_nhat, so_thu_hai

def tinh_tong(x, y):
    ket_qua = 0
    ket_qua = ket_qua + x
    ket_qua = ket_qua + y
    return ket_qua

def main():
    a, b = doc_hai_so()
    print(tinh_tong(a, b))

main()
