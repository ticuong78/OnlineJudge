# Sample submissions

For "Tổng hai số" (P0001 in the dev seed, homework "Bài tập về nhà tuần 1", Bài 1): input `a b`, output `a + b`.
Except `wa-int-overflow.cpp`, which is for "Tổng dãy số" (P0002, Bài 2): its big hidden test sums to 5·10^9.

| File | Language | Expected verdict |
|---|---|---|
| `ac.py`, `ac.cpp`, `ac.c`, `ac.java`, `ac.js` | each language | Chấp nhận (AC), 100 |
| `wa-int-overflow.cpp` | C++17 | **P0002 (Bài 2)**: Sai kết quả (WA), partial score (only the big test fails) |
| `wa-wrong-answer.py` | Python 3 | Sai kết quả (WA) |
| `tle-infinite-loop.py` | Python 3 | Quá thời gian (TLE) |
| `re-index-error.py` | Python 3 | Lỗi khi chạy (RE) |
| `ce-missing-semicolon.cpp` | C++17 | Lỗi biên dịch (CE), compiler message shown |
| `mle-big-list.py` | Python 3 | Quá bộ nhớ (MLE) with a 256 MB limit |
| `copy-a.py`, `copy-b.py` | Python 3 | AC; submitted by two students in a session with "Kiểm tra đạo văn" on, they are flagged as near copies (names differ, structure is the same) |
