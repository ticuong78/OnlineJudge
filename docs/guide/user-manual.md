# Online Judge: user manual

Who this is for: product, support, testers and trainers. It describes what each kind of user does, step by step,
with the exact Vietnamese labels shown on screen (in quotes) so you can find them in the app.

Contents
1. [Concepts in one page](#1-concepts-in-one-page)
2. [Student (Học sinh)](#2-student-học-sinh)
3. [Teacher (Giáo viên)](#3-teacher-giáo-viên)
4. [VIP teacher: the AI features](#4-vip-teacher-the-ai-features)
5. [Organization admin (Quản lý tổ chức)](#5-organization-admin-quản-lý-tổ-chức)
6. [System administrator (Quản trị viên)](#6-system-administrator-quản-trị-viên)
7. [Rules and limits everyone should know](#7-rules-and-limits-everyone-should-know)
8. [Troubleshooting for users](#8-troubleshooting-for-users)

---

## 1. Concepts in one page

| Term | Meaning |
|---|---|
| **Problem** ("Bài tập") | A programming task in a teacher's bank: statement, limits, test cases, solution. Private by default. |
| **Test case** | Input + expected output + points. "Là ví dụ" tests are shown to students as examples; the others stay hidden. |
| **Problem set** ("Đề") | An ordered list of the teacher's own problems with points: an exam, a test, homework or practice. |
| **Bank** ("Ngân hàng") | A teacher's own problems and sets, plus what others share. |
| **Session** ("Phiên") | A problem or set **given** ("Giao bài") to a class or to everyone, with open/close times and rules. The content is frozen when it is given. Submissions, scores and "solved" belong to the session. |
| **Class** ("Lớp") | One teacher in charge, students, a join code (e.g. `22DTHC5`). Personal, or belonging to an organization. |
| **Organization** ("Tổ chức") | A centre or school on the organization plan: teacher seats, an end date, AI included or not. A teacher may be in several. |
| **Learning record** ("Học bạ") | A student's history of solved problems and finished sessions; kept even if a class is deleted. |
| **Integrity hints** ("Cần xem lại") | Automatic hints of copied or AI-written code. Never a verdict, never changes scores. |
| **Verdicts** | "Chấp nhận" (AC), "Sai kết quả" (WA), "Quá thời gian" (TLE), "Quá bộ nhớ" (MLE), "Lỗi khi chạy" (RE), "Lỗi biên dịch" (CE), "Lỗi hệ thống" (IE). |
| **Score** | Share of the problem's test points earned; a session keeps the **best** score per problem. A problem worth 40 points with 33.33 % earns 13.33 points ("Cao nhất 13.33/40 điểm"). |

Languages: "C++17", "C11", "Python 3", "Java 17", "JavaScript (Node.js)". Programs read **standard input** and
write **standard output** (no files).

Interface language (OJ-12): Vietnamese by default. The **VI / EN** switch in the header (in the mobile menu on a phone)
and on the sign-in, register, invite and forgot-password pages changes every label, button and message to English
and back. The browser remembers the choice (a cookie, one year), also after signing out. It changes only the
interface: problem statements, test data, class names, posts, AI output and emails stay as they were written
(emails are always Vietnamese). This manual quotes the Vietnamese labels.

Who can do what (summary)

| | Student | Teacher | VIP teacher | Org admin | Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Join classes, solve, see own learning record | ✓ | | | | |
| Bank, import, classes, give sessions, results | | ✓ | ✓ | ✓ | ✓ (all) |
| AI: read exams, rewrite sections, suggest tests, AI-usage check | | ✓ only while in an active organization that includes AI | ✓ | ✓ same rule as teachers | ✓ |
| Manage the organization's members and all its classes | | | | ✓ | ✓ |
| Users, teacher invitations, VIP, organizations | | | | | ✓ |

---

## 2. Student (Học sinh)

### 2.1 Create an account
1. Open the site, click "Chưa có tài khoản? Đăng ký (học sinh)".
2. Fill "Họ và tên", "Email", optional "Số điện thoại (không bắt buộc)", "Mật khẩu" (≥ 6 characters), "Nhập lại mật khẩu".
   Optionally type the **class code** from your teacher in "Mã lớp (không bắt buộc)": a join request is sent.
3. Click "Gửi mã xác minh". Open your email (check Spam), type the 6 digits, click "Xác minh và tạo tài khoản".
   - Wrong code: try again (5 tries). Expired: "Gửi lại mã" (available after 60 seconds).
   - Typo in the email: "Đổi email".

Teachers do **not** sign up here; they are invited by email.

### 2.2 Sign in, forgot password
- "Đăng nhập" with email and password.
- "Quên mật khẩu?" → type email → "Gửi liên kết" → open the email link (valid once, until the time shown)
  → "Mật khẩu mới", "Nhập lại mật khẩu mới" → "Đặt lại mật khẩu". All other devices are signed out.

### 2.3 Join or leave a class
- Menu "Lớp của tôi" → "Tham gia lớp": "Mã lớp", optional "Lời nhắn cho giáo viên (không bắt buộc)" →
  "Gửi yêu cầu vào lớp". The request shows "Chờ giáo viên duyệt" until the teacher decides ("Đã duyệt",
  "Bị từ chối"); you can "Hủy yêu cầu".
- Meanwhile you can still practise public sessions ("Luyện tập").
- To leave: on the class row "Xin rời lớp" (optional reason) → "Gửi yêu cầu rời lớp". The teacher approves.
- Classes you left or that were archived stay under "Lớp cũ" ("Xem lại"), read-only.

### 2.4 Home page
- Primary card: "Vào thi" when a timed exam is open and you have not started it yet; otherwise "Làm tiếp" (the last problem you opened, while its session is still open; forgotten when you sign out), "Làm bài" (next open session) or "Luyện tập".
- "Bài đang mở" lists timed exams waiting for you first, marked "Chưa bắt đầu, N phút".
- "Bài đang mở": sessions waiting for you. "Thông báo của lớp": announcements. "Học bạ": your progress.

### 2.5 Solve a problem
1. Open a session from the home page or the class page. The list shows each problem with "Đã giải ✓",
   "Cao nhất x/y điểm", "Chưa làm", and "Còn n/m lần nộp" when submissions are limited.
2. **Timed session** ("Phiên này tính giờ"): you see the rules first. "Bắt đầu làm bài" → confirm
   "Bắt đầu tính giờ?". The timer starts and **cannot be paused**; it ends at your personal end time or at the
   session close, whichever is first. Warnings at 15, 5 and 1 minutes ("Bật/Tắt âm báo").
3. Open a problem: read "Đề bài", "Dữ liệu vào", "Kết quả", "Ràng buộc" and the examples ("Sao chép" copies them).
4. Choose the language ("Ngôn ngữ"), write code in the editor ("Mã mẫu" restores the template), click "Nộp bài".
   Your draft is kept per problem and language in this browser.
5. "Kết quả chấm" appears under the editor: "Đang chờ chấm" → "Đang chấm" → the verdict and score; with full
   feedback, "Chi tiết từng test". After an AC: "Sang bài tiếp theo". Earlier tries: tab "Bài nộp của tôi".
6. What you see depends on the teacher's choice, shown as a rule on the session page: every test ("Xem kết quả từng
   test ngay"), only the verdict and score ("Chỉ xem kết quả chung và điểm"), or nothing until the session closes
   ("Kết quả hiện sau khi phiên đóng"; the result says "Đã nộp").
7. Questions: "Câu hỏi về bài này" → "Hỏi về bài này" (class sessions only). The teacher answers on the class board.

Limits: source code up to 64 KB; at most 3 of your submissions waiting to be judged at once.
You cannot submit when: the session has not opened ("Phiên chưa mở…"), it is closed ("Phiên đã đóng, không nhận bài
nộp mới."), the class is archived, your time is up, you used all attempts, or the language is not allowed.

### 2.6 Learning record and practice
- "Học bạ": problems solved ("Đã giải"), tried ("Đã thử, chưa đúng hết"), not tried, grouped by class and
  "Luyện tập tự do". Kept even after a class is deleted (then you cannot reopen the statements).
- "Luyện tập": public sessions anyone signed in can do.
- "Bài nộp" (menu): all your submissions with verdict, score, language, time and memory.
- Class board: open a class, "Bảng tin lớp" → "Đặt câu hỏi"; classmates and the teacher can reply.

Scores: the result card under the editor and the problem list show points ("36/60", "Cao nhất 36/60 điểm"); the
submissions pages show the share of tests passed as a percentage ("60%").

---

## 3. Teacher (Giáo viên)

### 3.1 Get your account
The administrator (or an organization admin) invites you by email. Open the link "Kích hoạt tài khoản giáo viên": the
6-digit "Mã mời" is filled in from the link (otherwise type it from the email), choose "Mật khẩu", "Nhập lại mật
khẩu" → "Kích hoạt tài khoản". The invitation is valid for 7 days.

If you already have an account and were invited into an **organization**, the invitation appears on your home page
("Lời mời vào tổ chức"): "Tham gia" or "Từ chối". Any member can later leave: "Tổ chức" → the organization →
"Rời tổ chức" (see 5.4 for what stays with the organization).

### 3.2 Classes
1. "Lớp" → "Tạo lớp": "Tên lớp", "Mã lớp" ("Gợi ý" proposes one; 4–20 letters, digits or "-").
   If you belong to an organization: "Lớp thuộc" → "Cá nhân" or the organization (see 5.3 for what that means).
2. Give students the code. Their requests appear under "Yêu cầu chờ duyệt": "Duyệt vào lớp", "Từ chối",
   or "Duyệt tất cả yêu cầu vào lớp (n)". You can also add an existing student account directly:
   "Thêm học sinh bằng email" → "Thêm học sinh".
3. Per student: "Thêm vào lớp khác", "Mời ra khỏi lớp". Leave requests: "Duyệt rời lớp".
4. "Sửa lớp": rename, change the code (the old code stops working).
5. "Chuyển vào tổ chức" (personal class, you are in an organization): one way, it cannot be moved out again.
6. End of course: "Lưu trữ lớp" (read-only, students keep their history). Then "Khôi phục", "Hẹn xóa sau N ngày",
   "Hủy hẹn xóa", or "Xóa ngay" (type the class name to confirm; deletes sessions and submissions for good).
7. Class board "Bảng tin lớp": "Đăng bài" as "Thông báo" (announcement, can be pinned "Ghim") or answer students'
   "Hỏi đáp" questions ("Trả lời" → "Gửi trả lời").

### 3.3 Problem bank
- "Ngân hàng" → tabs "Bài tập" / "Đề"; scopes "Của tôi", "Công khai", and on "Bài tập" only "Tổ chức" (if you are in
  an organization).
  Search "Tìm theo tên hoặc mã bài", filter "Chủ đề (tag)", difficulty.
- **Create** ("Tạo bài"): "Tên bài *", "Độ khó", tags, "Thời gian (ms)", "Bộ nhớ (MB)"; the four sections
  "Đề bài", "Dữ liệu vào", "Kết quả", "Ràng buộc" (Markdown and `$math$`, "Soạn"/"Xem trước"); "Bộ test": "Thêm test",
  Input, "Output mong đợi", "Là ví dụ", points. Save "Tạo bài".
  - A statement asking to read/write files (e.g. `BAI1.INP`) cannot be saved: "Chưa lưu được vì đề còn yêu cầu
    đọc/ghi file". Regular accounts click "Chuyển sang nhập/xuất chuẩn"; VIP accounts turn on "Dùng gợi ý" for that
    section (they do not see the conversion button).
  - Limits: time 100–15,000 ms, memory 16–1024 MB, up to 200 tests, each test up to 8 MB.
- **Problem page**: "Giao bài", "Xóa bài" (sessions already given keep their frozen copy); tabs "Đề bài & bộ test", "Xem như học sinh", "Lời giải"
  ("Hướng dẫn giải", code, "Tải file code", "Lưu lời giải").
- **Sharing** ("Chia sẻ"): "Công khai đề bài" (other teachers see the statement and examples and can copy),
  then optionally "Cho xem test ẩn", "Cho xem lời giải". "Chia sẻ trong tổ chức": one switch per organization;
  its teachers see everything (statement, hidden tests, solution). Students never see blueprints.
  Making a problem private is refused while it is part of a public set (make the set private first).
- **Copy**: on someone else's shared problem, "Lưu vào ngân hàng của tôi". You get what they share.

### 3.4 Import an exam document ("Nhập đề")
1. "Nhập đề" → tab "Tải file lên": drop a `.docx` or `.pdf` (≤ 10 MB), or tab "Dán nội dung": paste text
   (≤ 100,000 characters) → "Tái cấu trúc bằng AI" (the button has this name for everyone; without AI the text is
   read by pattern). Up to 50 problems per import.
2. The system splits the document into problems. Without AI it reads by pattern ("Đọc theo mẫu"): headings like
   "Bài 1.", "Câu 2:", sections "Dữ liệu vào", "Kết quả", "Giới hạn", "Ví dụ" with "Input"/"Output" or a two-column
   table, and lines like "Thời gian: 2 giây", "Bộ nhớ: 512 MB", "Độ khó: Khó". With AI (VIP) it reads messy PDFs and scans.
3. Review each draft ("Chỉnh sửa chi tiết"): name, difficulty, limits, sections, tests. Yellow warnings tell you what
   was guessed (e.g. "Đề không ghi độ khó — mặc định "Trung bình"").
4. Links to other sites, Zalo/Facebook group invitations and adverts are removed automatically.
5. Problems that still read/write files are blocked: open them and "Chuyển sang nhập/xuất chuẩn".
6. "Nhập N bài" → "Đã nhập N bài vào ngân hàng của bạn" → "Thêm lời giải" or "Tạo đề từ các bài này".

Sample files to try: `samples/exams/` (see docs/testing/local-setup.md).

### 3.5 Problem sets
- "Đề" tab → "Tạo đề": "Tên đề", "Loại đề" ("Đề thi", "Đề kiểm tra", "Bài tập về nhà", "Luyện tập"), "Lời dặn cho học
  sinh"; add problems from "Ngân hàng của tôi" ("Thêm"), set points, order them with the up/down arrows, "Lưu đề".
  A set holds up to 50 problems, all from your own bank: copy shared ones first.
- Set page: "Giao bài", "In đề" and "In đáp án" (print or save as PDF), "Sửa", delete ("Xóa đề này?"; sessions already
  given keep their copy), "Công khai đề" (all its problems must be public). Someone else's public set: "Lưu vào ngân
  hàng của tôi" copies the set and its problems into your bank.

### 3.6 Give work: sessions ("Giao bài")
1. From a problem, a set, or the class page ("Giao bài cho lớp"). Only problems and sets from **your own bank** can be
   given (copy shared ones first), and every problem needs at least one test.
2. "Giao cho": a class, or "Công khai cho mọi người". "Tên phiên", "Lời dặn".
3. Time: "Mở lúc" (empty = now), "Đóng lúc" (empty = no deadline), or "Làm trong 7 ngày" / "Làm trong 10 ngày" /
   "Không giới hạn".
4. "Chế độ thi / Cài đặt" (preset "Bài kiểm tra": 45 minutes, 3 attempts, score only). Giving a set of type "Đề thi"
   fills in 90 minutes, 3 attempts, results hidden until the session closes and the plagiarism check; "Đề kiểm tra" fills
   in the "Bài kiểm tra" preset and the plagiarism check. Change anything before "Giao bài":
   - "Thời gian làm bài": personal timer per student, up to 600 minutes (starts with "Bắt đầu làm bài").
   - "Ngôn ngữ được phép", "Số lần nộp tối đa mỗi bài" (1–100).
   - "Hiển thị kết quả cho học sinh": "Đầy đủ", "Chỉ điểm", "Ẩn đến khi phiên đóng".
   - "Kiểm tra đạo văn"; "Kiểm tra dùng AI" (VIP).
5. A problem or set is given **once** per class (or once publicly); giving it again points you to the existing session
   ("Mở phiên đã giao"): edit that one instead ("Sửa").

### 3.7 Follow up
- Session page: "Kết quả" (scoreboard; "Tải bảng điểm (CSV)"), "Sửa", "Xóa".
- "Chấm lại": "Chấm lại tất cả" or one problem re-runs the submissions with the **session's own copy** of the tests
  (e.g. after a system error). A test fixed in the bank does **not** reach the session this way: use "Cập nhật nội dung
  bài từ ngân hàng & chấm lại" (any session), or "Đồng bộ với đề gốc" (sessions given from a set).
- "Đồng bộ với đề gốc" (sessions from a set): preview what changed in the bank (problems added/removed, points,
  content) then "Đồng bộ"; changed problems are rejudged. Students keep earlier submissions.
- "Bài nộp": choose a session, see everyone's submissions and code.
- "Cần xem lại": plagiarism pairs ("Có nguy cơ sao chép", "giống x%") with side-by-side code, AI-usage hints with
  highlighted lines. "Đánh dấu đã xem". Hints never change scores. A copied pair appears as one entry.

### 3.8 Home page
"Giao bài" (or "Tạo lớp đầu tiên" with no class), shortcuts "Nhập đề", "Tạo bài", "Ngân hàng", "Luyện tập"; "Lớp của
tôi" with pending request counts; "N bài nộp cần xem lại" when there are new hints; "Phiên sắp hết hạn" / "Phiên đang
mở"; organization invitations ("Lời mời vào tổ chức") at the top.

---

## 4. VIP teacher: the AI features

VIP is given by the administrator ("Nâng cấp VIP"), or comes from an organization whose plan includes AI and is
active. Regular teachers see the same buttons marked "· chỉ dành cho VIP".

| Feature | Where | Notes |
|---|---|---|
| Read exams with AI | "Nhập đề" (upload and paste) | Handles messy PDFs and scans; falls back to pattern reading if AI fails. 20–60 s. |
| "Dùng gợi ý" | Each statement section, and "Dùng gợi ý cho cả bài" | AI rewrites that section; switch off to get your text back; "Viết lại" for another version. Never produces file I/O. |
| "Gợi ý test bằng AI" | Test list | AI proposes edge-case tests and runs code to compute outputs ("Output đã chạy thử"); outputs it only guessed are marked "AI tự tính, hãy kiểm tra". Nothing is saved until "Thêm N test đã chọn". 30 s – 2 min. |
| "Kiểm tra dùng AI" | Session settings | Flags submissions that look AI-written, with reasons and highlighted lines. |

Without a server API key the AI features are off; pattern reading still works.

---

## 5. Organization admin (Quản lý tổ chức)

An org admin is a teacher with the role "Quản lý" in an organization (set by the administrator, or promoted by
another org admin). Menu "Tổ chức" → the organization.

### 5.1 The organization page
- Status: "Đến hết dd/mm/yyyy" or "Hết hạn từ …", "Có AI", seats "used/total chỗ".
- "Giáo viên": members with role, "Cho làm quản lý" / "Bỏ quyền quản lý", "Mời ra". Yourself: "Rời tổ chức".
  An organization always keeps at least one "Quản lý" (those buttons are disabled for the last one).
- "Lời mời đang chờ": "Hủy lời mời".
- "Lớp của tổ chức": every class of the organization, whoever teaches it.

### 5.2 Invite teachers
"Mời giáo viên" → "Email", "Họ và tên (dùng khi email chưa có tài khoản)" → "Gửi lời mời".
- Email of an existing teacher: they get a notice and accept on their home page.
- New email: they get the teacher invitation (link + code) and join when they activate the account.
- Each invitation holds a seat for 7 days. Full: "đã dùng hết N chỗ giáo viên". Student or admin emails are refused.

### 5.3 Organization classes
- Teachers choose "Lớp thuộc" = the organization when creating a class, or "Chuyển vào tổ chức" later.
- The org admin manages these classes like their teacher: students, requests, sessions, results, submissions,
  rejudging, integrity hints, the board, archive/restore, and handing the class to another member
  ("Sửa lớp" → "Giáo viên phụ trách"). Deleting a class for good is for its teacher and the administrator only.
- Personal classes of members stay private to them.

### 5.4 When a teacher leaves (removed, or "Rời tổ chức")
- The seat is freed.
- The organization's classes they taught **stay in the organization**, now taught by the org admin who removed them
  (or the longest-standing other org admin).
- They keep their own problems; the ones they shared with the organization stop being shared, and the org admin gets
  a copy of each ("Dựa trên …").

### 5.5 Plan end
After "Hoạt động đến hết ngày" (Vietnam time): AI from the organization stops; no new invitations, no teacher can be
added, and **pending invitations can no longer be accepted** (including a new teacher activating an account from an
organization invitation). Classes, data and sharing keep working. Nothing is deleted. The administrator extends it
("Sửa gói").

---

## 6. System administrator (Quản trị viên)

One administrator account (from the server settings).

- **Users** ("Người dùng"): search, filter by role; teachers' organizations; "Nâng cấp VIP" / "Bỏ VIP"; delete a user
  ("Xóa người dùng?"). A deleted teacher leaves their organizations (their organization classes go to an org admin) and
  their personal classes go to the administrator; a deleted student loses their class memberships. A teacher who is
  the only "Quản lý" of an organization cannot be deleted until another is named.
- **Invite teachers**: "Mời giáo viên" → name, email, optional phone → "Gửi lời mời". "Lời mời đang chờ": "Gửi lại lời
  mời" (new code; 1-minute cooldown), "Hủy lời mời".
- **Organizations** ("Tổ chức") → "Tạo tổ chức": "Tên tổ chức (trung tâm, trường)", "Số chỗ giáo viên", "Hoạt động đến
  hết ngày", AI included, "Quản lý tổ chức (giáo viên có sẵn)". On the organization: "Sửa gói" (seats cannot go below
  what is used), "Thêm giáo viên có sẵn" (joins directly), and everything an org admin can do.
- **Everything else**: the admin sees and manages every bank (scope "Tất cả"), every class and session, and can create a
  class for a teacher ("Giáo viên phụ trách").

---

## 7. Rules and limits everyone should know

| Rule | Value |
|---|---|
| Sign-up / invitation code | 6 digits; 5 tries; sign-up code 10 minutes, invitation 7 days; resend after 60 s |
| Wrong passwords | 10 per account from one network (IP) address per 10 minutes, and 100 per account per hour from addresses that have not signed in to it recently; while blocked even the right password is refused |
| Wrong sign-up codes | 20 per email address per 24 hours (across resends) |
| Password reset link | valid 10 minutes, once |
| Pending submissions per student | 3 at a time |
| System errors ("Lỗi hệ thống") | Never count as an attempt, except a program's own failures beyond 2 per problem |
| Upload | `.docx` / `.pdf`, ≤ 10 MB; paste ≤ 100,000 characters; ≤ 50 problems per import |
| Problems | time 100–15,000 ms; memory 16–1024 MB; ≤ 200 tests, each ≤ 8 MB; ≤ 50 problems per set |
| Source code | ≤ 64 KB per submission |
| Join / leave message | ≤ 500 characters |
| Class code | 4–20 characters: A–Z, 0–9, "-" |
| Organization invitations | 60 per hour per network (IP) address; each holds a seat for 7 days |
| Programs | standard input/output only; output larger than allowed is cut and judged wrong |

---

## 8. Troubleshooting for users

| Symptom | What to do |
|---|---|
| No email | Check Spam; wait 60 s then "Gửi lại mã"; check the address ("Đổi email"). |
| "Mã lớp không đúng hoặc lớp đã kết thúc" | The code changed or the class is archived; ask the teacher. |
| Cannot submit | Read the message under the editor: not open yet, closed, time up, attempts used, class archived, 3 still waiting. |
| "Lỗi hệ thống" verdict | Not your fault; submit again or ask the teacher to "Chấm lại". |
| Using Chrome's "Translate to English" | Supported; if a label looks stale, it updates after the next action. |
| PDF import says the document has no text | It is a scan: retype it, use a Word file, or ask a VIP teacher (AI reads scans). |
