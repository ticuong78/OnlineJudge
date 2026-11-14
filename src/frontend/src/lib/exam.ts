import { LanguageLabels, Languages, type FeedbackMode, type Language, type ProblemSetType, type SessionDto, type SessionSettingsDto } from '@oj/contracts';
import { tr } from '@/i18n/runtime';

export const DEFAULT_SETTINGS: SessionSettingsDto = {
  durationMinutes: null,
  allowedLanguages: [],
  maxSubmissionsPerProblem: null,
  feedback: 'FULL',
  checkPlagiarism: false,
  checkAiUsage: false,
  hideTopics: false,
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

/** Feedback modes in the order the settings form lists them. */
export const FEEDBACK_MODES: FeedbackMode[] = ['FULL', 'SCORE_ONLY', 'HIDDEN_UNTIL_CLOSED'];

/** Label and hint for a feedback mode, in the active language (looked up at call time). */
export function feedbackLabel(f: FeedbackMode): { label: string; hint: string } {
  const t = tr();
  return { label: t(`assign.feedback.${f}.label`), hint: t(`assign.feedback.${f}.hint`) };
}

export function allowedLanguages(settings: SessionSettingsDto | undefined): Language[] {
  const list = settings?.allowedLanguages ?? [];
  return list.length ? Languages.filter((l) => list.includes(l)) : [...Languages];
}

/** Short lines describing the rules, for the session page and the start screen. */
export function settingsSummary(s: SessionSettingsDto): string[] {
  const t = tr();
  const out: string[] = [];
  if (s.durationMinutes) out.push(t('assign.summary.duration', { minutes: s.durationMinutes }));
  out.push(
    s.allowedLanguages.length
      ? t('assign.summary.languages', {
          list: allowedLanguages(s)
            .map((l) => LanguageLabels[l])
            .join(', '),
        })
      : t('assign.summary.anyLanguage'),
  );
  out.push(
    s.maxSubmissionsPerProblem
      ? t('assign.summary.maxSubmissions', { count: s.maxSubmissionsPerProblem })
      : t('assign.summary.unlimitedSubmissions'),
  );
  out.push(
    s.feedback === 'FULL'
      ? t('assign.summary.feedbackFull')
      : s.feedback === 'SCORE_ONLY'
        ? t('assign.summary.feedbackScoreOnly')
        : t('assign.summary.feedbackHidden'),
  );
  return out;
}

/** Teacher-only chips: integrity checks are never shown to students. */
export function integritySummary(s: SessionSettingsDto): string[] {
  const t = tr();
  const out: string[] = [];
  if (s.checkPlagiarism) out.push(t('assign.summary.plagiarism'));
  if (s.checkAiUsage) out.push(t('assign.summary.aiUsage'));
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

/**
 * Milliseconds to add to this computer's clock to get the server's, from `serverNow` in a session response.
 * `null` until it is known: nothing that decides "time is up" may run before then, or a computer whose clock is fast
 * would end a student's exam early (OJ-15 F3). Computed when the data arrives, so the very first check is right.
 */
export function serverOffsetMs(serverNow: string | undefined, localNowMs: number): number | null {
  if (!serverNow) return null;
  const server = new Date(serverNow).getTime();
  return Number.isNaN(server) ? null : server - localNowMs;
}
