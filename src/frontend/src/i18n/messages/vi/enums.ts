/**
 * Display names for shared enums. The `*Labels` maps in @oj/contracts stay for the backend (always Vietnamese);
 * the frontend uses these. Language names (C++17, Python 3) are not translated and still come from LanguageLabels.
 */
export const enums = {
  role: { ADMIN: 'Quản trị viên', TEACHER: 'Giáo viên', STUDENT: 'Học sinh' },
  difficulty: { EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó', EXPERT: 'Rất khó' },
  verdict: {
    AC: 'Chấp nhận',
    WA: 'Sai kết quả',
    TLE: 'Quá thời gian',
    MLE: 'Quá bộ nhớ',
    RE: 'Lỗi khi chạy',
    CE: 'Lỗi biên dịch',
    IE: 'Lỗi hệ thống',
  },
  problemSetType: { EXAM: 'Đề thi', TEST: 'Đề kiểm tra', HOMEWORK: 'Bài tập về nhà', PRACTICE: 'Luyện tập' },
  sessionState: { UPCOMING: 'Sắp mở', OPEN: 'Đang mở', CLOSED: 'Đã đóng' },
  problemTextField: {
    statement: 'Đề bài',
    inputFormat: 'Dữ liệu vào',
    outputFormat: 'Kết quả',
    constraints: 'Ràng buộc',
  },
};
