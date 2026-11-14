import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Actor } from '../src/shared/application/actor.js';
import { fingerprint, normalizedTokens, similarity } from '../src/modules/integrity/domain/fingerprint.js';
import { IntegrityFlag } from '../src/modules/integrity/domain/integrity-flag.js';
import { Thread } from '../src/modules/community/domain/thread.js';

const original = `#include <bits/stdc++.h>
using namespace std;
// đếm số chẵn trong dãy
int main() {
  int n; cin >> n;
  vector<int> a(n);
  for (int i = 0; i < n; i++) cin >> a[i];
  int cnt = 0;
  for (int i = 0; i < n; i++) {
    if (a[i] % 2 == 0) cnt++;
  }
  long long total = 0;
  for (int x : a) total += x;
  cout << cnt << " " << total << endl;
  return 0;
}`;

// Same program: identifiers renamed, comments removed, reformatted.
const renamed = `#include <bits/stdc++.h>
using namespace std;
int main(){int soLuong;cin>>soLuong;vector<int> day(soLuong);
for(int j=0;j<soLuong;j++)cin>>day[j];
int dem=0;
for(int j=0;j<soLuong;j++){ if(day[j]%2==0) dem++; }
long long tong=0; for(int v:day) tong+=v;
cout<<dem<<" "<<tong<<endl; return 0;}`;

const different = `#include <bits/stdc++.h>
using namespace std;
int main() {
  string s; getline(cin, s);
  map<char, int> freq;
  for (char c : s) if (isalpha(c)) freq[tolower(c)]++;
  char best = 'a'; int most = -1;
  for (auto& [c, k] : freq) if (k > most) { most = k; best = c; }
  printf("%c %d\\n", best, most);
  return 0;
}`;

test('tokens ignore names, comments and formatting', () => {
  assert.deepEqual(normalizedTokens('int a = 1; // x'), normalizedTokens('int   bienDem=7;'));
});

test('renamed copy is detected; a different program is not; trivial code is skipped', () => {
  const a = fingerprint(original)!, b = fingerprint(renamed)!, c = fingerprint(different)!;
  assert.ok(similarity(a, b) > 0.9, `renamed similarity ${similarity(a, b)}`);
  assert.ok(similarity(a, c) < 0.3, `different similarity ${similarity(a, c)}`);
  assert.equal(fingerprint('a,b=map(int,input().split())\nprint(a+b)'), null);
});

const ctx = { sessionId: 's', sessionTitle: 'Kiểm tra', problemKey: 'A', problemTitle: 'A. Đếm' };
const an = { submissionId: 'x1', userId: 'u1', userDisplayName: 'An' };
const binh = { submissionId: 'x2', userId: 'u2', userDisplayName: 'Bình' };
const teacher: Actor = { id: 't', role: 'TEACHER', name: 'Cô Lan' };

test('flags: thresholds, levels and acknowledging', () => {
  assert.equal(IntegrityFlag.plagiarism(ctx, an, binh, 0.6), null);
  const medium = IntegrityFlag.plagiarism(ctx, an, binh, 0.8)!;
  assert.equal(medium.snapshot.level, 'MEDIUM');
  assert.match(medium.snapshot.summary, /giống 80% với bài của Bình/);
  assert.equal(IntegrityFlag.plagiarism(ctx, an, binh, 0.95)!.snapshot.level, 'HIGH');
  assert.equal(IntegrityFlag.aiUsage(ctx, an, { risk: 'LOW', summary: '', reasons: [], segments: [] }), null);
  const ai = IntegrityFlag.aiUsage(ctx, an, { risk: 'HIGH', summary: 'nhiều chú thích kiểu hướng dẫn', reasons: ['r'], segments: [] })!;
  assert.equal(ai.snapshot.status, 'OPEN');
  ai.acknowledge(teacher);
  assert.equal(ai.snapshot.status, 'ACKNOWLEDGED');
  assert.equal(ai.snapshot.acknowledgedByName, 'Cô Lan');
});

test('thread: replies, deletion rights and pinning', () => {
  const author = { id: 'u1', name: 'An', role: 'STUDENT' as const };
  const t = Thread.start({ classId: 'c', kind: 'QUESTION', title: ' Bài A sai test 3? ', body: 'Em bị WA', author, topic: null });
  assert.equal(t.snapshot.title, 'Bài A sai test 3?');
  const r = t.reply({ id: 't', name: 'Cô Lan', role: 'TEACHER' }, 'Kiểm tra tràn số nhé');
  assert.equal(t.snapshot.replies.length, 1);
  assert.throws(() => t.removeReply(r.id, 'u1', false), /của mình/);
  t.removeReply(r.id, 't', false);
  assert.ok(t.canBeDeletedBy('u1', false) && !t.canBeDeletedBy('u2', false) && t.canBeDeletedBy('u2', true));
  assert.throws(() => t.reply(author, '   '), /Nội dung/);
  t.pin(true);
  assert.ok(t.snapshot.pinned);
});

test('thread: a question awaits an answer until a teacher or administrator replies', () => {
  const student = { id: 'u1', name: 'An', role: 'STUDENT' as const };
  const q = Thread.start({ classId: 'c', kind: 'QUESTION', title: 'Bài A?', body: 'Em bị WA', author: student, topic: null });
  assert.equal(q.awaitsAnswer, true);
  q.reply({ id: 'u2', name: 'Bình', role: 'STUDENT' }, 'Mình cũng bị');
  assert.equal(q.awaitsAnswer, true, 'a classmate is not an answer');
  const r = q.reply({ id: 't', name: 'Cô Lan', role: 'TEACHER' }, 'Kiểm tra tràn số nhé');
  assert.equal(q.awaitsAnswer, false);
  q.removeReply(r.id, 't', true);
  assert.equal(q.awaitsAnswer, true, 'deleting the answer reopens the question');
  q.reply({ id: 'a', name: 'Quản trị', role: 'ADMIN' }, 'Đã sửa test');
  assert.equal(q.awaitsAnswer, false);
  const news = Thread.start({ classId: 'c', kind: 'ANNOUNCEMENT', title: 'Lịch thi', body: 'Thứ 2', author: { id: 't', name: 'Cô Lan', role: 'TEACHER' }, topic: null });
  assert.equal(news.awaitsAnswer, false);
  const own = Thread.start({ classId: 'c', kind: 'QUESTION', title: 'Ai đã xong bài A?', body: 'Giơ tay nhé', author: { id: 't', name: 'Cô Lan', role: 'TEACHER' }, topic: null });
  assert.equal(own.awaitsAnswer, false, "a teacher's own question is not waiting for the teacher");
});
