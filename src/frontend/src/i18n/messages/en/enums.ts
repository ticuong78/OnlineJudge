import type { enums as vi } from '../vi/enums';
import type { Dict } from '../types';

export const enums = {
  role: { ADMIN: 'Administrator', TEACHER: 'Teacher', STUDENT: 'Student' },
  difficulty: { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard', EXPERT: 'Expert' },
  verdict: {
    AC: 'Accepted',
    WA: 'Wrong answer',
    TLE: 'Time limit exceeded',
    MLE: 'Memory limit exceeded',
    RE: 'Runtime error',
    CE: 'Compilation error',
    IE: 'Internal error',
  },
  problemSetType: { EXAM: 'Exam', TEST: 'Quiz', HOMEWORK: 'Homework', PRACTICE: 'Practice' },
  sessionState: { UPCOMING: 'Upcoming', OPEN: 'Open', CLOSED: 'Closed' },
  problemTextField: {
    statement: 'Statement',
    inputFormat: 'Input',
    outputFormat: 'Output',
    constraints: 'Constraints',
  },
} satisfies Dict<typeof vi>;
