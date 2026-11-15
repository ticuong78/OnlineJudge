/**
 * Development seed: fills a local database with a realistic classroom so every screen has something to show,
 * for every kind of account (administrator, VIP teacher, regular teachers, students).
 *
 *   pnpm --filter @oj/backend seed        (backend .env must point at the local database; the judge engine should run)
 *
 * Everything goes through the real application services with the right actor, so the data obeys the same rules as
 * the UI (ownership, sharing, class windows, submission limits). Submissions are judged by the running engine.
 * Accounts are created through the identity domain directly, because the normal paths need an emailed code.
 *
 * Refuses to run with NODE_ENV=production, or when the database or Redis is not on this machine (seed-guard.ts),
 * and checks this before Nest starts, so nothing is connected or written first.
 * Runs once: if the seeded teacher account already exists it stops without changing anything.
 *
 * Every seeded account (teachers and students, not the administrator) signs in with SEED_PASSWORD below.
 * The administrator is the one from ADMIN_EMAIL / ADMIN_PASSWORD (see .env.example).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import type {
  CreateSessionRequest,
  Language,
  SessionDto,
  SessionSettingsDto,
  UpsertProblemRequest,
  UpsertTestCaseRequest,
} from '@oj/contracts';
import type { Actor } from './shared/application/actor.js';
import { ClassroomService } from './modules/classroom/application/classroom.service.js';
import { ProblemService } from './modules/catalog/application/problem.service.js';
import { ProblemSetService } from './modules/assessment/application/problem-set.service.js';
import { SessionService } from './modules/assessment/application/session.service.js';
import { CommunityService } from './modules/community/application/community.service.js';
import { JudgingService } from './modules/judging/application/judging.service.js';
import { TeamService } from './modules/identity/application/team.service.js';
import { PasswordHasher } from './modules/identity/application/ports.js';
import { UserRepository } from './modules/identity/domain/user.repository.js';
import { IntegrityService } from './modules/integrity/application/integrity.service.js';
import { OrganizationService } from './modules/identity/application/organization.service.js';
import { actorOrganizations } from './modules/identity/application/organization-memberships.js';
import { OrganizationRepository } from './modules/identity/domain/organization.repository.js';
import { DisplayName, Email, Phone, User } from './modules/identity/domain/user.js';
import { effectiveEnv, seedRefusal } from './seed-guard.js';

/** Development only. Shared by every seeded teacher and student account. */
export const SEED_PASSWORD = 'seed12345';
const DOMAIN = 'oj.local';
const MARKER_EMAIL = `gv.lan@${DOMAIN}`;
const JUDGE_WAIT_MS = 180_000;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

// ---------- People ----------

interface Person { key: string; name: string; phone: string | null }

const TEACHERS: (Person & { vip: boolean })[] = [
  { key: 'gv.lan', name: 'Nguyễn Thị Lan', phone: '0901234567', vip: true },
  { key: 'gv.minh', name: 'Trần Văn Minh', phone: '0912345678', vip: false },
  { key: 'gv.hoa', name: 'Lê Thu Hoa', phone: null, vip: false },
];

const STUDENT_NAMES = [
  'Phạm Minh Anh', 'Hoàng Gia Bảo', 'Vũ Ngọc Chi', 'Đặng Quốc Dũng', 'Bùi Thanh Hà', 'Đỗ Đức Huy',
  'Ngô Khánh Linh', 'Dương Hoài Nam', 'Lý Bảo Ngọc', 'Trịnh Công Phúc', 'Mai Thảo Quyên', 'Hồ Tuấn Kiệt',
];
const STUDENTS: Person[] = STUDENT_NAMES.map((name, i) => ({
  key: `hs${String(i + 1).padStart(2, '0')}`,
  name,
  phone: i % 3 === 0 ? `09876543${String(i).padStart(2, '0')}` : null,
}));

// ---------- Problems ----------

interface ProblemSeed {
  ref: string;
  owner: string;
  problem: UpsertProblemRequest;
  tests: UpsertTestCaseRequest[];
  solution: { language: Language; code: string; explanation: string };
  share?: { publicTests: boolean; publicSolution: boolean };
}

const sample = (input: string, expectedOutput: string): UpsertTestCaseRequest => ({ input, expectedOutput, isSample: true, points: 1 });
const hidden = (input: string, expectedOutput: string, points = 1): UpsertTestCaseRequest => ({ input, expectedOutput, isSample: false, points });
const limits = { timeLimitMs: 1000, memoryLimitMb: 256 };

const PROBLEMS: ProblemSeed[] = [
  {
    ref: 'sum2', owner: 'gv.lan', share: { publicTests: true, publicSolution: true },
    problem: {
      title: 'Tổng hai số', difficulty: 'EASY', tags: ['cơ bản', 'nhập xuất'], ...limits,
      statement: 'Cho hai số nguyên $a$ và $b$. Hãy in ra tổng $a + b$.',
      inputFormat: 'Một dòng gồm hai số nguyên $a$, $b$ cách nhau bởi dấu cách.',
      outputFormat: 'Một số nguyên duy nhất là $a + b$.',
      constraints: '$-10^9 \\le a, b \\le 10^9$',
    },
    tests: [sample('1 2', '3'), sample('10 20', '30'), hidden('-5 5', '0'), hidden('0 0', '0'), hidden('1000000000 1000000000', '2000000000', 2)],
    solution: {
      language: 'python', explanation: 'Đọc hai số và in tổng. Python không bị tràn số nên không cần lưu ý gì thêm.',
      code: 'a, b = map(int, input().split())\nprint(a + b)\n',
    },
  },
  {
    ref: 'arraysum', owner: 'gv.lan', share: { publicTests: false, publicSolution: false },
    problem: {
      title: 'Tổng dãy số', difficulty: 'EASY', tags: ['vòng lặp', 'mảng'], ...limits,
      statement: 'Cho dãy gồm $n$ số nguyên. Hãy tính tổng các phần tử của dãy.',
      inputFormat: 'Dòng đầu là số $n$. Dòng thứ hai gồm $n$ số nguyên.',
      outputFormat: 'Tổng các phần tử của dãy.',
      constraints: '$1 \\le n \\le 10^5$, $|a_i| \\le 10^9$',
    },
    tests: [sample('3\n1 2 3', '6'), hidden('1\n-7', '-7'), hidden('5\n1000000000 1000000000 1000000000 1000000000 1000000000', '5000000000', 2), hidden('4\n-1 1 -1 1', '0')],
    solution: {
      language: 'cpp', explanation: 'Cộng dồn vào biến kiểu long long để tránh tràn số.',
      code: '#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n  int n; cin >> n;\n  long long s = 0;\n  for (int i = 0; i < n; i++) { long long x; cin >> x; s += x; }\n  cout << s << "\\n";\n}\n',
    },
  },
  {
    ref: 'prime', owner: 'gv.lan',
    problem: {
      title: 'Kiểm tra số nguyên tố', difficulty: 'MEDIUM', tags: ['số học'], ...limits,
      statement: 'Cho số nguyên dương $n$. In `YES` nếu $n$ là số nguyên tố, ngược lại in `NO`.',
      inputFormat: 'Một số nguyên dương $n$.',
      outputFormat: '`YES` hoặc `NO`.',
      constraints: '$1 \\le n \\le 10^{12}$',
    },
    tests: [sample('7', 'YES'), sample('10', 'NO'), hidden('1', 'NO'), hidden('2', 'YES'), hidden('999999000001', 'NO', 2), hidden('1000000000039', 'YES', 3)],
    solution: {
      language: 'python', explanation: 'Thử chia đến $\\sqrt{n}$: chỉ khoảng $10^6$ phép chia.',
      code: 'n = int(input())\nok = n >= 2\ni = 2\nwhile i * i <= n:\n    if n % i == 0:\n        ok = False\n        break\n    i += 1\nprint("YES" if ok else "NO")\n',
    },
  },
  {
    ref: 'lis', owner: 'gv.lan', share: { publicTests: false, publicSolution: true },
    problem: {
      title: 'Dãy con tăng dài nhất', difficulty: 'HARD', tags: ['quy hoạch động', 'tìm kiếm nhị phân'], ...limits,
      statement: 'Cho dãy $n$ số nguyên. Tìm độ dài dãy con tăng ngặt dài nhất (không cần liên tiếp).',
      inputFormat: 'Dòng đầu là $n$. Dòng thứ hai gồm $n$ số nguyên.',
      outputFormat: 'Độ dài dãy con tăng dài nhất.',
      constraints: '$1 \\le n \\le 10^5$',
    },
    tests: [sample('6\n1 3 2 4 3 5', '4'), hidden('1\n5', '1'), hidden('5\n5 4 3 2 1', '1'), hidden('8\n2 2 2 3 3 4 1 5', '4', 2)],
    solution: {
      language: 'python', explanation: 'Duy trì mảng `tails` và dùng tìm kiếm nhị phân: $O(n \\log n)$.',
      code: 'import bisect\ninput()\na = list(map(int, input().split()))\ntails = []\nfor x in a:\n    i = bisect.bisect_left(tails, x)\n    if i == len(tails):\n        tails.append(x)\n    else:\n        tails[i] = x\nprint(len(tails))\n',
    },
  },
  {
    ref: 'reverse', owner: 'gv.minh', share: { publicTests: true, publicSolution: false },
    problem: {
      title: 'Đảo ngược chuỗi', difficulty: 'EASY', tags: ['chuỗi'], ...limits,
      statement: 'Cho một chuỗi ký tự không chứa dấu cách. Hãy in chuỗi đó theo thứ tự ngược lại.',
      inputFormat: 'Một dòng chứa chuỗi $s$.',
      outputFormat: 'Chuỗi $s$ viết ngược.',
      constraints: '$1 \\le |s| \\le 10^5$',
    },
    tests: [sample('abc', 'cba'), sample('olympic', 'cipmylo'), hidden('a', 'a'), hidden('racecar', 'racecar'), hidden('xyz123', '321zyx')],
    solution: { language: 'python', explanation: 'Dùng lát cắt `s[::-1]`.', code: 'print(input()[::-1])\n' },
  },
  {
    ref: 'words', owner: 'gv.minh',
    problem: {
      title: 'Đếm số từ', difficulty: 'MEDIUM', tags: ['chuỗi'], ...limits,
      statement: 'Cho một dòng văn bản. Đếm số từ trong dòng, biết các từ cách nhau bởi một hoặc nhiều dấu cách.',
      inputFormat: 'Một dòng văn bản.',
      outputFormat: 'Số từ.',
      constraints: 'Độ dài dòng không quá $10^5$.',
    },
    tests: [sample('xin chao cac ban', '4'), hidden('   mot    hai   ', '2'), hidden('mot', '1'), hidden('a b c d e f g h', '8')],
    solution: { language: 'python', explanation: '`split()` không tham số bỏ qua mọi khoảng trắng thừa.', code: 'print(len(input().split()))\n' },
  },
  {
    ref: 'fib', owner: 'gv.minh',
    problem: {
      title: 'Số Fibonacci', difficulty: 'MEDIUM', tags: ['số học', 'quy hoạch động'], ...limits,
      statement: 'Dãy Fibonacci: $F_0 = 0$, $F_1 = 1$, $F_n = F_{n-1} + F_{n-2}$. Tính $F_n \\bmod (10^9 + 7)$.',
      inputFormat: 'Một số nguyên $n$.',
      outputFormat: '$F_n \\bmod (10^9 + 7)$.',
      constraints: '$0 \\le n \\le 10^6$',
    },
    tests: [sample('10', '55'), hidden('0', '0'), hidden('1', '1'), hidden('100', '687995182', 2)],
    solution: {
      language: 'python', explanation: 'Tính lặp với hai biến, lấy dư sau mỗi bước.',
      code: 'n = int(input())\na, b = 0, 1\nfor _ in range(n):\n    a, b = b, (a + b) % 1000000007\nprint(a)\n',
    },
  },
  {
    ref: 'max', owner: 'gv.hoa',
    problem: {
      title: 'Giá trị lớn nhất', difficulty: 'EASY', tags: ['mảng'], ...limits,
      statement: 'Cho dãy $n$ số nguyên, in ra giá trị lớn nhất.',
      inputFormat: 'Dòng đầu là $n$, dòng thứ hai gồm $n$ số nguyên.',
      outputFormat: 'Giá trị lớn nhất của dãy.',
      constraints: '$1 \\le n \\le 10^5$',
    },
    tests: [sample('4\n3 9 2 7', '9'), hidden('1\n-4', '-4'), hidden('3\n-1 -2 -3', '-1')],
    solution: { language: 'python', explanation: 'Dùng hàm `max`.', code: 'input()\nprint(max(map(int, input().split())))\n' },
  },
];

// Wrong programs, one per outcome the judge can give.
const WRONG: Record<'WA' | 'RE' | 'TLE', { language: Language; code: string }> = {
  WA: { language: 'python', code: 'print(0)\n' },
  RE: { language: 'python', code: 'data = []\nprint(data[3])\n' },
  TLE: { language: 'python', code: 'while True:\n    pass\n' },
};
const COMPILE_ERROR = { language: 'cpp' as Language, code: '#include <iostream>\nint main() {\n  std::cout << "thiếu dấu chấm phẩy"\n}\n' };
// int overflows on the big tests: a partial score.
const SUM2_OVERFLOW = { language: 'cpp' as Language, code: '#include <iostream>\nint main() { int a, b; std::cin >> a >> b; std::cout << a + b; }\n' };
// The same program handed in by two students: the plagiarism check should pair them.
// Long enough to be fingerprinted (the check skips programs under MIN_TOKENS tokens).
const COPIED_WORDS = {
  language: 'python' as Language,
  code: [
    '# dem so tu trong mot dong',
    'def dem_tu(dong):',
    '    so_luong = 0',
    '    dang_trong_tu = False',
    '    for ky_tu in dong:',
    '        if ky_tu == " " or ky_tu == "\\t":',
    '            dang_trong_tu = False',
    '        elif not dang_trong_tu:',
    '            dang_trong_tu = True',
    '            so_luong = so_luong + 1',
    '    return so_luong',
    '',
    'def main():',
    '    dong = input()',
    '    ket_qua = dem_tu(dong)',
    '    print(ket_qua)',
    '',
    'main()',
    '',
  ].join('\n'),
};

type Attempt = 'AC' | 'WA' | 'RE' | 'TLE' | 'CE';
/** A few typical stories, picked per student and problem so the results look varied. */
const STORIES: Attempt[][] = [['AC'], ['WA', 'AC'], ['CE', 'AC'], ['WA'], ['TLE', 'AC'], ['RE', 'WA'], ['AC'], []];

// ---------- Seeding ----------

class Seeder {
  private readonly actors = new Map<string, Actor>();
  private readonly problemIds = new Map<string, string>();
  private readonly log: string[] = [];

  constructor(private readonly app: INestApplicationContext) {}

  private get<T>(type: abstract new (...args: never[]) => T): T {
    return this.app.get(type as never, { strict: false }) as T;
  }

  private actor(key: string): Actor {
    const a = this.actors.get(key);
    if (!a) throw new Error(`Unknown seed account ${key}`);
    return a;
  }

  private note(line: string) {
    this.log.push(line);
    console.log(`  ${line}`);
  }

  async run(): Promise<void> {
    await this.people();
    const classes = await this.classes();
    await this.problems();
    const sets = await this.problemSets();
    const sessions = await this.sessions(classes, sets);
    await this.community(classes, sessions);
    await this.submissions(sessions);
    await this.afterwards(classes, sessions);
    await this.organizations();
  }

  /** The actor with its current organization memberships, as the authenticator builds it per request. */
  private async withOrganizations(key: string): Promise<Actor> {
    const a = this.actor(key);
    return { ...a, organizations: await actorOrganizations(this.get(OrganizationRepository), a.id) };
  }

  /**
   * Organization plan (OJ-8): an active center with AI (Lan org admin, Minh member, an organization class with
   * students, a problem shared inside it, two pending invitations), and an expired school (Hoa org admin).
   */
  private async organizations() {
    console.log('Organizations');
    const orgs = this.get(OrganizationService);
    const admin = this.actor('admin');
    const inDays = (n: number) => new Date(Date.now() + n * DAY + 7 * HOUR).toISOString().slice(0, 10);
    const saoMai = await orgs.create(admin, {
      name: 'Trung tâm Tin học Sao Mai', seats: 5, activeUntil: inDays(60), aiIncluded: true, adminUserId: this.actor('gv.lan').id,
    });
    await orgs.addMember(admin, saoMai.id, { userId: this.actor('gv.minh').id, role: 'TEACHER' });
    const minh = await this.withOrganizations('gv.minh');
    const lan = await this.withOrganizations('gv.lan');

    const classes = this.get(ClassroomService);
    const team = await classes.create(minh, { name: 'Đội tuyển HSG Sao Mai', code: 'SAOMAI-HSG', organizationId: saoMai.id });
    for (const s of ['hs03', 'hs06', 'hs09']) await classes.addStudent(lan, this.actor(s).id, team.id);

    const words = this.problemIds.get('words')!;
    await this.get(ProblemService).share(minh, words, { isPublic: false, publicTests: false, publicSolution: false, organizationIds: [saoMai.id] });
    const fib = this.problemIds.get('fib')!;
    const session = await this.get(SessionService).create(minh, {
      source: { kind: 'PROBLEM', problemId: fib }, classId: team.id, opensAt: null, closesAt: null,
      title: 'Luyện đội tuyển: Số Fibonacci',
    });
    await this.get(CommunityService).create(lan, team.id, {
      kind: 'ANNOUNCEMENT', title: 'Lịch luyện đội tuyển', body: 'Đội tuyển luyện vào **thứ 7 hằng tuần**, 8h–11h tại phòng máy 2.',
    });
    // An existing teacher (accepts on the home page) and a new email (gets the account invitation with a code).
    await orgs.invite(lan, saoMai.id, { email: `gv.hoa@${DOMAIN}`, displayName: 'Lê Thu Hoa' });
    await orgs.invite(lan, saoMai.id, { email: `gv.tuan@${DOMAIN}`, displayName: 'Võ Minh Tuấn' });
    this.note(`Trung tâm Tin học Sao Mai: Lan org admin, Minh member, class SAOMAI-HSG (3 students, session "${session.title}"), problem shared in the org, invitations to gv.hoa and gv.tuan`);

    await orgs.create(admin, {
      name: 'THPT Chuyên Lê Quý Đôn (hết hạn)', seats: 3, activeUntil: inDays(-10), aiIncluded: true, adminUserId: this.actor('gv.hoa').id,
    });
    this.note('THPT Chuyên Lê Quý Đôn (hết hạn): expired plan, Hoa org admin (AI off, no new invitations)');
  }

  private async people() {
    console.log('Accounts');
    const users = this.get(UserRepository);
    const hasher = this.get(PasswordHasher);
    const passwordHash = await hasher.hash(SEED_PASSWORD);
    const admin = (await users.findByRole('ADMIN'))[0];
    if (!admin) throw new Error('No administrator yet: start the backend once so it creates the ADMIN_EMAIL account.');
    this.actors.set('admin', { id: admin.id, role: 'ADMIN', name: admin.displayName });

    const create = async (p: Person, make: typeof User.registerStudent) => {
      const user = make({
        email: Email.of(`${p.key}@${DOMAIN}`),
        displayName: DisplayName.of(p.name),
        phone: Phone.optional(p.phone),
        passwordHash,
      });
      return user;
    };
    for (const t of TEACHERS) {
      const user = await create(t, User.acceptTeacherInvitation);
      if (t.vip) user.setVip(true);
      await users.save(user);
      this.actors.set(t.key, { id: user.id, role: 'TEACHER', name: user.displayName });
      this.note(`teacher ${t.key}@${DOMAIN}${t.vip ? ' (VIP)' : ''}`);
    }
    for (const s of STUDENTS) {
      const user = await create(s, User.registerStudent);
      await users.save(user);
      this.actors.set(s.key, { id: user.id, role: 'STUDENT', name: user.displayName });
    }
    this.note(`${STUDENTS.length} students hs01..hs${STUDENTS.length}@${DOMAIN}`);

    // A teacher invitation still waiting to be accepted, for the administrator's Users page.
    await this.get(TeamService).invite({ email: `gv.phuong@${DOMAIN}`, displayName: 'Phan Thị Phương', phone: null });
    this.note(`pending teacher invitation gv.phuong@${DOMAIN}`);
  }

  private async classes() {
    console.log('Classes');
    const svc = this.get(ClassroomService);
    const open = async (teacher: string, name: string, code: string, students: string[]) => {
      const cls = await svc.create(this.actor(teacher), { name, code });
      for (const s of students) await svc.addStudent(this.actor(teacher), this.actor(s).id, cls.id);
      this.note(`${code} "${name}" (${teacher}): ${students.length} students`);
      return cls.id;
    };
    const c10 = await open('gv.lan', 'Tin học 10A1', '10A1-TIN', ['hs01', 'hs02', 'hs03', 'hs04', 'hs05', 'hs06']);
    const c11 = await open('gv.minh', 'Tin học 11B2', '11B2-TIN', ['hs01', 'hs07', 'hs08', 'hs09']);
    // Created by the administrator on Hoa's behalf; archived at the end, once it has some history.
    const c12 = await svc.create(this.actor('admin'), { name: 'Tin học 12C3 (năm trước)', code: '12C3-TIN', teacherId: this.actor('gv.hoa').id });
    await svc.addStudent(this.actor('admin'), this.actor('hs11').id, c12.id);
    this.note('12C3-TIN "Tin học 12C3 (năm trước)" (gv.hoa, made by admin): 1 student, archived at the end');

    // Join requests: one approved, two still waiting for the teacher.
    const approved = await svc.requestJoin(this.actor('hs10'), '11B2-TIN', 'Em chuyển từ lớp 11B1 sang ạ.');
    await svc.decide(this.actor('gv.minh'), approved.id, true);
    await svc.requestJoin(this.actor('hs12'), '10A1-TIN', 'Em là học sinh mới của lớp 10A1.');
    await svc.requestJoin(this.actor('hs11'), '11B2-TIN', null);
    this.note('join requests: hs10 -> 11B2 approved; hs12 -> 10A1 and hs11 -> 11B2 waiting');
    return { c10: c10, c11: c11, c12: c12.id };
  }

  private async problems() {
    console.log('Problem banks');
    const svc = this.get(ProblemService);
    for (const p of PROBLEMS) {
      const owner = this.actor(p.owner);
      const created = await svc.create(owner, p.problem, p.tests);
      this.problemIds.set(p.ref, created.id);
      await svc.setSolution(owner, created.id, p.solution);
      if (p.share) await svc.share(owner, created.id, { isPublic: true, organizationIds: [], ...p.share });
      this.note(`${created.code} ${p.problem.title} (${p.owner}${p.share ? ', public' : ''})`);
    }
    // A copy of a public problem into another teacher's bank shows "copied from".
    const copy = await svc.copy(this.actor('gv.minh'), this.problemIds.get('lis')!);
    this.problemIds.set('lis-minh', copy.id);
    this.note(`${copy.code} copied by gv.minh from gv.lan's public problem`);
  }

  private async problemSets() {
    console.log('Problem sets');
    const svc = this.get(ProblemSetService);
    const make = async (owner: string, title: string, type: 'EXAM' | 'TEST' | 'HOMEWORK' | 'PRACTICE', description: string,
      items: [string, number][]) => {
      const set = await svc.create(this.actor(owner), {
        title, type, description,
        items: items.map(([ref, points]) => ({ problemId: this.problemIds.get(ref)!, points })),
      });
      this.note(`${type} "${title}" (${owner}, ${set.totalPoints} điểm)`);
      return set.id;
    };
    const homework = await make('gv.lan', 'Bài tập về nhà tuần 1', 'HOMEWORK', 'Ôn tập nhập xuất và vòng lặp.', [['sum2', 40], ['arraysum', 60]]);
    await svc.share(this.actor('gv.lan'), homework, true);
    const quiz = await make('gv.lan', 'Kiểm tra 15 phút: vòng lặp', 'TEST', 'Làm trong 15 phút.', [['arraysum', 50], ['prime', 50]]);
    const exam = await make('gv.lan', 'Thi học kỳ I', 'EXAM', 'Không sử dụng tài liệu.', [['prime', 40], ['lis', 60]]);
    const strings = await make('gv.minh', 'Luyện tập xử lý chuỗi', 'PRACTICE', 'Các bài cơ bản về chuỗi.', [['reverse', 50], ['words', 50]]);
    const midterm = await make('gv.minh', 'Kiểm tra giữa kỳ', 'EXAM', 'Thời gian 60 phút kể từ khi bấm bắt đầu.', [['words', 40], ['fib', 60]]);
    return { homework, quiz, exam, strings, midterm };
  }

  private async sessions(classes: Awaited<ReturnType<Seeder['classes']>>, sets: Awaited<ReturnType<Seeder['problemSets']>>) {
    console.log('Sessions');
    const svc = this.get(SessionService);
    const settings = (s: Partial<SessionSettingsDto> = {}): SessionSettingsDto => ({
      durationMinutes: null, allowedLanguages: [], maxSubmissionsPerProblem: null, feedback: 'FULL',
      checkPlagiarism: false, checkAiUsage: false, ...s,
    });
    const give = async (teacher: string, input: CreateSessionRequest, label: string) => {
      const session = await svc.create(this.actor(teacher), input);
      this.note(`${label}: "${session.title}"`);
      return session;
    };
    const homework = await give('gv.lan', {
      source: { kind: 'SET', setId: sets.homework }, classId: classes.c10,
      opensAt: at(-2 * DAY), closesAt: at(5 * DAY), settings: settings(),
    }, '10A1 open homework');
    // Opened now so students can hand in; closed in the past once the submissions are judged (see afterwards()).
    const quiz = await give('gv.lan', {
      source: { kind: 'SET', setId: sets.quiz }, classId: classes.c10,
      opensAt: at(-3 * DAY), closesAt: at(DAY), settings: settings({ feedback: 'SCORE_ONLY', maxSubmissionsPerProblem: 3 }),
    }, '10A1 quiz (closed afterwards)');
    const exam = await give('gv.lan', {
      source: { kind: 'SET', setId: sets.exam }, classId: classes.c10,
      opensAt: at(3 * DAY), closesAt: at(3 * DAY + 2 * HOUR),
      settings: settings({ durationMinutes: 90, feedback: 'HIDDEN_UNTIL_CLOSED', checkPlagiarism: true, allowedLanguages: ['cpp', 'python'] }),
    }, '10A1 upcoming timed exam');
    const open = await give('gv.lan', {
      source: { kind: 'PROBLEM', problemId: this.problemIds.get('lis')! }, classId: null,
      title: 'Luyện tập mở: Dãy con tăng dài nhất', description: 'Phiên công khai, mọi người đều có thể tham gia.',
      opensAt: null, closesAt: null, settings: settings(),
    }, 'public practice');
    const strings = await give('gv.minh', {
      source: { kind: 'SET', setId: sets.strings }, classId: classes.c11,
      opensAt: at(-DAY), closesAt: at(14 * DAY), settings: settings({ checkPlagiarism: true, allowedLanguages: ['python', 'cpp'] }),
    }, '11B2 practice with plagiarism check');
    const midterm = await give('gv.minh', {
      source: { kind: 'SET', setId: sets.midterm }, classId: classes.c11,
      opensAt: at(-HOUR), closesAt: at(DAY), settings: settings({ durationMinutes: 60, feedback: 'SCORE_ONLY' }),
    }, '11B2 timed midterm, running now');
    const old = await give('gv.hoa', {
      source: { kind: 'PROBLEM', problemId: this.problemIds.get('max')! }, classId: classes.c12,
      opensAt: at(-30 * DAY), closesAt: at(DAY), settings: settings(),
    }, '12C3 last year (closed afterwards)');
    return { homework, quiz, exam, open, strings, midterm, old };
  }

  private async community(classes: Awaited<ReturnType<Seeder['classes']>>, s: Awaited<ReturnType<Seeder['sessions']>>) {
    console.log('Class discussions');
    const svc = this.get(CommunityService);
    const notice = await svc.create(this.actor('gv.lan'), classes.c10, {
      kind: 'ANNOUNCEMENT', title: 'Lịch thi học kỳ I',
      body: 'Các em lưu ý: bài thi học kỳ I mở sau 3 ngày nữa, làm trong 90 phút kể từ lúc bấm **Bắt đầu**. Chỉ dùng C++ hoặc Python.',
    });
    await svc.pin(this.actor('gv.lan'), notice.id, true);
    const question = await svc.create(this.actor('hs02'), classes.c10, {
      kind: 'QUESTION', title: 'Bài Tổng dãy số bị sai test ẩn', sessionId: s.homework.id, problemKey: s.homework.problems[1].key,
      body: 'Em chạy ví dụ thì đúng nhưng nộp lên bị sai một test. Thầy cô xem giúp em với ạ.',
    });
    await svc.reply(this.actor('gv.lan'), question.id, 'Em kiểm tra lại kiểu dữ liệu nhé: tổng có thể vượt quá giới hạn của `int`.');
    await svc.reply(this.actor('hs02'), question.id, 'Em đổi sang `long long` thì đúng rồi ạ. Em cảm ơn cô!');
    await svc.create(this.actor('hs04'), classes.c10, {
      kind: 'QUESTION', title: 'Có được dùng Java không ạ?', body: 'Bài tập về nhà có cho nộp bằng Java không ạ?',
    });
    await svc.create(this.actor('gv.minh'), classes.c11, {
      kind: 'ANNOUNCEMENT', title: 'Kiểm tra giữa kỳ đang mở',
      body: 'Bài kiểm tra giữa kỳ đã mở. Mỗi em có 60 phút kể từ khi bấm bắt đầu, hạn chót là ngày mai.',
    });
    const q2 = await svc.create(this.actor('hs08'), classes.c11, {
      kind: 'QUESTION', title: 'Bài Đếm số từ: dấu cách ở đầu dòng', sessionId: s.strings.id, problemKey: s.strings.problems[1].key,
      body: 'Nếu dòng có dấu cách ở đầu thì có tính là một từ không ạ?',
    });
    await svc.reply(this.actor('gv.minh'), q2.id, 'Không em nhé, chỉ đếm các từ có ít nhất một ký tự khác dấu cách.');
    this.note('10A1: pinned announcement, 2 questions (1 answered); 11B2: announcement, 1 answered question');
  }

  private async submissions(s: Awaited<ReturnType<Seeder['sessions']>>) {
    console.log('Submissions (judged by the engine, this takes a few minutes)');
    const judging = this.get(JudgingService);
    const sessions = this.get(SessionService);
    const plan = new Map<string, { session: SessionDto; key: string; ref: string; attempt: Attempt | 'COPY' | 'OVERFLOW' }[]>();
    const add = (student: string, session: SessionDto, index: number, ref: string, attempt: Attempt | 'COPY' | 'OVERFLOW') => {
      const list = plan.get(student) ?? [];
      list.push({ session, key: session.problems[index].key, ref, attempt });
      plan.set(student, list);
    };
    const story = (student: string, n: number) => STORIES[(Number(student.slice(2)) * 3 + n) % STORIES.length];
    const play = (students: string[], session: SessionDto, refs: string[]) => {
      students.forEach((st) => refs.forEach((ref, i) => story(st, i + refs.length).forEach((a) => add(st, session, i, ref, a))));
    };

    play(['hs01', 'hs02', 'hs03', 'hs04', 'hs05', 'hs06'], s.homework, ['sum2', 'arraysum']);
    add('hs02', s.homework, 0, 'sum2', 'OVERFLOW');
    play(['hs01', 'hs02', 'hs03', 'hs05'], s.quiz, ['arraysum', 'prime']);
    play(['hs01', 'hs03', 'hs06', 'hs09'], s.open, ['lis']);
    play(['hs01', 'hs07', 'hs09', 'hs10'], s.strings, ['reverse', 'words']);
    add('hs07', s.strings, 1, 'words', 'COPY');
    add('hs08', s.strings, 1, 'words', 'COPY');
    // Timed: the student starts the clock first.
    await sessions.start(this.actor('hs07'), s.midterm.id);
    await sessions.start(this.actor('hs08'), s.midterm.id);
    add('hs07', s.midterm, 0, 'words', 'AC');
    add('hs07', s.midterm, 1, 'fib', 'WA');
    add('hs08', s.midterm, 0, 'words', 'AC');
    add('hs11', s.old, 0, 'max', 'WA');
    add('hs11', s.old, 0, 'max', 'AC');

    const sourceOf = (ref: string, attempt: Attempt | 'COPY' | 'OVERFLOW') => {
      const p = PROBLEMS.find((x) => x.ref === ref)!;
      if (attempt === 'AC') return p.solution;
      if (attempt === 'CE') return COMPILE_ERROR;
      if (attempt === 'COPY') return COPIED_WORDS;
      if (attempt === 'OVERFLOW') return SUM2_OVERFLOW;
      return WRONG[attempt];
    };
    let total = 0;
    const verdicts = new Map<string, number>();
    // One submission at a time per student (the pending limit), students in parallel.
    await Promise.all([...plan.entries()].map(async ([student, list]) => {
      for (const item of list) {
        const { language, code } = sourceOf(item.ref, item.attempt);
        const sub = await judging.submit(this.actor(student), {
          sessionId: item.session.id, problemKey: item.key, language, sourceCode: code,
        });
        const verdict = await this.waitForVerdict(judging, this.actor(student), sub.id);
        verdicts.set(verdict, (verdicts.get(verdict) ?? 0) + 1);
        total++;
      }
    }));
    this.note(`${total} submissions: ${[...verdicts.entries()].map(([v, n]) => `${v} ${n}`).join(', ')}`);

    // The plagiarism check runs in the background after judging; let it finish before this process exits.
    const integrity = this.get(IntegrityService);
    const deadline = Date.now() + 30_000;
    let flags = 0;
    while (Date.now() < deadline) {
      flags = (await integrity.list(this.actor('gv.minh'), { sessionId: s.strings.id })).length;
      if (flags > 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    this.note(`plagiarism check: ${flags} flag(s) in "${s.strings.title}"`);
  }

  private async waitForVerdict(judging: JudgingService, actor: Actor, id: string): Promise<string> {
    const deadline = Date.now() + JUDGE_WAIT_MS;
    while (Date.now() < deadline) {
      const sub = await judging.get(actor, id);
      if (sub.status === 'DONE') return sub.verdict ?? 'hidden';
      await new Promise((r) => setTimeout(r, 750));
    }
    return 'still pending (is the engine running?)';
  }

  private async afterwards(classes: Awaited<ReturnType<Seeder['classes']>>, s: Awaited<ReturnType<Seeder['sessions']>>) {
    console.log('History');
    const svc = this.get(SessionService);
    const close = async (teacher: string, session: SessionDto, opensAt: number, closesAt: number) => {
      const { title, description, settings } = session;
      await svc.update(this.actor(teacher), session.id, { title, description, settings, opensAt: at(opensAt), closesAt: at(closesAt) });
    };
    await close('gv.lan', s.quiz, -3 * DAY, -2 * DAY);
    await close('gv.hoa', s.old, -30 * DAY, -20 * DAY);
    await this.get(ClassroomService).archive(this.actor('gv.hoa'), classes.c12);
    this.note('10A1 quiz and 12C3 session closed in the past; 12C3 archived');
  }
}

async function main() {
  // Before Nest starts: creating the context already connects, syncs the schema and starts background jobs.
  const refusal = seedRefusal(effectiveEnv(process.cwd()));
  if (refusal) throw new Error(refusal);
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'], abortOnError: false });
  try {
    if (await app.get(UserRepository, { strict: false }).findByEmail(Email.of(MARKER_EMAIL))) {
      console.log(`Already seeded (${MARKER_EMAIL} exists). Nothing changed.`);
      return;
    }
    await new Seeder(app).run();
    console.log(`\nDone. Teachers and students sign in with the password in SEED_PASSWORD (src/backend/src/seed.ts).`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
