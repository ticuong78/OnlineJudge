import { LanguageLabels, Languages, type FeedbackMode, type Language, type ProblemSetType, type SessionDto, type SessionSettingsDto } from '@oj/contracts';

export const DEFAULT_SETTINGS: SessionSettingsDto = {
  durationMinutes: null,
  allowedLanguages: [],
  maxSubmissionsPerProblem: null,
  feedback: 'FULL',
  checkPlagiarism: false,
  checkAiUsage: false,
};

/** "Bài kiểm tra" preset: 45 minutes, 3 submissions per problem, verdict and score only. */
export const TEST_PRESET: Partial<SessionSettingsDto> = {
  durationMinutes: 45,
  maxSubmissionsPerProblem: 3,
  feedback: 'SCORE_ONLY',
};

/** "Đề thi" defaults: a longer sitting, results only after the session closes. */
const EXAM_PRESET: Partial<SessionSettingsDto> = {
  durationMinutes: 90,
  maxSubmissionsPerProblem: 3,
  feedback: 'HIDDEN_UNTIL_CLOSED',
};

/**
 * Settings the "Giao bài" form starts from. Exam and test sets get exam settings and the plagiarism check, so a hurried
 * teacher does not run an exam that shows every hidden test's result; other sets and single problems stay open.
 */
export function defaultSettingsFor(type: ProblemSetType | undefined): SessionSettingsDto {
  if (type === 'EXAM') return { ...DEFAULT_SETTINGS, ...EXAM_PRESET, checkPlagiarism: true };
  if (type === 'TEST') return { ...DEFAULT_SETTINGS, ...TEST_PRESET, checkPlagiarism: true };
  return DEFAULT_SETTINGS;
}

export const FeedbackLabels: Record<FeedbackMode, { label: string; hint: string }> = {
  FULL: { label: 'Đầy đủ', hint: 'Học sinh thấy kết quả từng test ngay sau khi chấm.' },
  SCORE_ONLY: { label: 'Chỉ điểm', hint: 'Học sinh thấy kết quả chung và điểm, không thấy từng test.' },
  HIDDEN_UNTIL_CLOSED: {
    label: 'Ẩn đến khi phiên đóng',
    hint: 'Học sinh chỉ thấy “Đã nộp”. Kết quả hiện khi phiên đóng.',
  },
};

export function allowedLanguages(settings: SessionSettingsDto | undefined): Language[] {
  const list = settings?.allowedLanguages ?? [];
  return list.length ? Languages.filter((l) => list.includes(l)) : [...Languages];
}

/** Short lines describing the rules, for the session page and the start screen. */
export function settingsSummary(s: SessionSettingsDto): string[] {
  const out: string[] = [];
  if (s.durationMinutes) out.push(`Làm trong ${s.durationMinutes} phút từ lúc bấm bắt đầu`);
  out.push(
    s.allowedLanguages.length
      ? `Ngôn ngữ: ${allowedLanguages(s)
          .map((l) => LanguageLabels[l])
          .join(', ')}`
      : 'Dùng ngôn ngữ nào cũng được',
  );
  out.push(s.maxSubmissionsPerProblem ? `Tối đa ${s.maxSubmissionsPerProblem} lần nộp mỗi bài` : 'Nộp không giới hạn số lần');
  out.push(
    s.feedback === 'FULL'
      ? 'Xem kết quả từng test ngay'
      : s.feedback === 'SCORE_ONLY'
        ? 'Chỉ xem kết quả chung và điểm'
        : 'Kết quả hiện sau khi phiên đóng',
  );
  return out;
}

/** Teacher-only chips: integrity checks are never shown to students. */
export function integritySummary(s: SessionSettingsDto): string[] {
  const out: string[] = [];
  if (s.checkPlagiarism) out.push('Kiểm tra đạo văn');
  if (s.checkAiUsage) out.push('Kiểm tra dùng AI');
  return out;
}

export function isExamLike(s: SessionSettingsDto) {
  return !!s.durationMinutes || !!s.maxSubmissionsPerProblem || s.feedback !== 'FULL' || s.allowedLanguages.length > 0;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * What the countdown counts to: the personal attempt end in a timed session,
 * otherwise the session close time when it is less than 24h away.
 */
export function timerTarget(s: SessionDto, serverNowMs: number): { endsAt: number; kind: 'attempt' | 'deadline' } | null {
  if (s.myAttempt) return { endsAt: new Date(s.myAttempt.endsAt).getTime(), kind: 'attempt' };
  if (s.needsStart || s.canManage) return null;
  if (s.state === 'OPEN' && s.closesAt) {
    const c = new Date(s.closesAt).getTime();
    if (c - serverNowMs < DAY) return { endsAt: c, kind: 'deadline' };
  }
  return null;
}

/** mm:ss, or h:mm:ss above an hour. */
export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
