# Online Judge (lớp học)

Hệ thống chấm bài lập trình tự động cho lớp học:

- **Ngân hàng của giáo viên**: mỗi giáo viên có ngân hàng bài tập và đề riêng (đây là "bản thiết kế"). Giáo viên tự soạn bài hoặc **tải đề `.docx` / `.pdf`** lên; hệ thống tách đề thành từng bài để giáo viên duyệt lại và chọn độ khó. Mỗi bài có test và **đáp án** (lời giải thích + code).
- **Chia sẻ**: bài tập riêng tư theo mặc định. Có thể công khai riêng từng phần: đề bài, test ẩn, lời giải. Giáo viên khác xem và **lưu bản sao** về ngân hàng của mình (có ghi nguồn). Đề chỉ công khai được khi mọi bài trong đề đã công khai.
- **Phiên (giao bài)**: giáo viên tạo một phiên từ một đề hoặc một bài, giao cho một lớp hoặc **công khai** cho mọi người, có thời gian mở/đóng tùy chọn. Phiên chụp lại nội dung bài lúc tạo, nên sửa ngân hàng không làm đổi đề đang làm. Bài nộp, điểm và trạng thái "đã giải" thuộc về từng phiên.
- **Lớp**: mỗi lớp có một giáo viên phụ trách, nhiều học sinh và mã lớp riêng (ví dụ `22DTHC5`). Học sinh có thể học **nhiều lớp cùng lúc** hoặc không thuộc lớp nào (thí sinh tự do, làm các phiên công khai và luyện tập). Học sinh muốn vào hay rời lớp phải **gửi yêu cầu** để giáo viên duyệt; giáo viên được chủ động thêm học sinh bằng email hoặc mời ra khỏi lớp. Các lớp đã rời là lịch sử. Khi kết thúc khóa, giáo viên **lưu trữ** lớp: lớp chỉ còn đọc, học sinh vẫn xem lại được. Lớp đã lưu trữ có thể khôi phục, hẹn **xóa hẳn** sau N ngày, hoặc xóa ngay (phải gõ tên lớp để xác nhận).
- **Chế độ thi** (cài đặt cho từng phiên):
  - Thời gian làm bài riêng cho từng học sinh: bấm "Bắt đầu làm bài" thì đồng hồ mới chạy, và chỉ khi đó mới thấy đề. Hết giờ là khóa nộp; server kiểm tra theo giờ của server.
  - Đồng hồ đếm ngược có thông báo kèm âm thanh khi còn 15, 5, 1 phút và khi hết giờ.
  - Giới hạn ngôn ngữ, giới hạn số lần nộp mỗi bài (kể cả khi nộp song song; bài bị lỗi hệ thống không tính là một lần nộp — trừ lỗi xảy ra khi chương trình của học sinh đã bắt đầu chạy: mỗi học sinh được miễn 2 lỗi như vậy cho mỗi bài, từ lỗi thứ ba trở đi tính là một lần nộp (và vẫn tính về sau), để không ai cố tình gây lỗi hệ thống nhằm dò test ẩn mà không mất lượt; lỗi xảy ra trước khi chương trình chạy — mất kết nối hàng đợi, không khởi động được máy chấm, mất kết quả — không bao giờ bị tính; giáo viên luôn có thể chấm lại).
  - Hiển thị kết quả cho học sinh: đầy đủ, chỉ điểm, hoặc ẩn đến khi phiên đóng. Giáo viên luôn thấy đầy đủ.
  - **Chấm lại** cả phiên hoặc một bài, và "Cập nhật đề từ ngân hàng & chấm lại" khi đã sửa test. Điểm và học bạ được tính lại theo kết quả mới.
- **Lọc nội dung ngoài lề khi nhập đề**: đường dẫn ra nơi khác (ví dụ `Link problem : https://leetcode.com/...`), lời mời vào nhóm/kênh (Zalo, Facebook, Telegram, Discord), quảng cáo được bỏ hẳn; AI cũng được dặn bỏ nội dung tuyên truyền lệch lạc hay kêu gọi vi phạm pháp luật. Đường dẫn còn bị lọc thêm một lần bằng quy tắc sau khi đọc, kể cả khi đọc theo mẫu.
- **Dán nội dung đề**: ở trang Nhập đề, tab *Dán nội dung* nhận một đoạn văn (một hoặc nhiều bài); nút *Tái cấu trúc bằng AI* tách và sắp xếp thành từng bài giống như khi tải file lên.
- **Đọc đề bằng AI** (khi có `ANTHROPIC_API_KEY`): Claude đọc thẳng file PDF (kể cả bố cục lộn xộn hoặc bản scan) hoặc nội dung Word để tách bài. Không có key hoặc AI lỗi thì dùng bộ đọc theo mẫu.
  Hệ thống chấm chỉ dùng đầu vào/đầu ra chuẩn. Đề kiểu "đọc từ file BAI1.INP, ghi ra file BAI1.OUT" vẫn giữ nguyên câu chữ của giáo viên, nhưng không lưu được cho tới khi sửa: cạnh mỗi mục (Đề bài, Dữ liệu vào, Kết quả, Ràng buộc) có nút **Dùng gợi ý** để chuyển sang câu đọc từ đầu vào chuẩn/in ra màn hình, tắt đi là quay lại nội dung gốc. Lưu ý của AI về đọc/ghi file được bỏ.
- **Dùng gợi ý (AI viết lại từng mục)**: khi tạo/sửa bài và khi nhập đề, cạnh mỗi mục (Đề bài, Dữ liệu vào, Kết quả, Ràng buộc) có nút *Dùng gợi ý*; bật lên AI viết lại mục đó từ phần còn lại của đề, tắt đi quay về nội dung gốc. Nút *Dùng gợi ý cho cả bài* bật/tắt mọi mục cùng lúc. Gợi ý được nhớ theo nội dung: bật lại khi đề chưa đổi thì dùng lại gợi ý cũ, không gọi AI thêm; muốn phiên bản khác thì bấm *Viết lại*. Gợi ý không bao giờ còn đọc/ghi file.
- **Bộ test soạn cùng đề**: khi tạo bài và khi nhập đề, mục *Bộ test* nằm ngay dưới đề: tự nhập hoặc nhờ AI gợi ý, mỗi test có ô *Là ví dụ* (ví dụ hiện trong đề cho học sinh, các test còn lại giữ kín). Đề và bộ test được lưu cùng lúc. Khi sửa bài đã có, bộ test nằm cùng trang *Đề bài & bộ test*, mỗi thay đổi test được lưu ngay.
- **Giao bài một lần**: mỗi bài lẻ hoặc đề chỉ được giao một lần cho cùng một nơi nhận (một lớp, hoặc công khai), kể cả khi bấm "Giao bài" nhiều lần liên tiếp; giao lại thì hệ thống chỉ tới phiên đã có. Muốn giao lại sau khi xóa phiên cũ thì được.
- **Gợi ý test bằng AI**: trong mục Bộ test, bấm *Gợi ý bằng AI*. Claude đọc đề, các test hiện có và lời giải mẫu, đề xuất test biên/đặc biệt, rồi **chạy code** trong sandbox của Anthropic để tính output. Giáo viên xem, sửa và chọn test nào để thêm; test có output do AI tự tính (không chạy được code) được đánh dấu để kiểm tra lại. Đề bài, dữ liệu vào, kết quả và ràng buộc luôn được ưu tiên hơn lưu ý giáo viên gửi kèm: phần lưu ý trái với đề (ví dụ đòi số âm khi đề ghi số nguyên dương) bị bỏ qua và AI giải thích lý do trong một khung đỏ.
- **Kiểm tra liêm chính** (hai công tắc riêng cho mỗi phiên, chỉ giáo viên thấy, không bao giờ đổi điểm):
  - *Đạo văn*: so "vân tay" code giữa các học sinh cùng phiên, bỏ qua tên biến (kể cả tên hàm `main`), chú thích (cả chú thích cuối dòng), dòng `#include` và định dạng (cùng ý tưởng với MOSS). Không cần AI.
  - *Dùng AI*: Claude đánh giá thận trọng từng bài nộp, chỉ ra đoạn code đáng ngờ kèm lý do.
  - Giáo viên mở ra so sánh code hai bên hoặc xem các dòng được đánh dấu, rồi tùy ý bấm "Đã xem".
- **Bảng tin lớp**: giáo viên đăng thông báo (ghim được); học sinh hỏi đáp, có thể gắn câu hỏi với một bài trong phiên. Lớp đã lưu trữ thì bảng tin chỉ còn đọc.
- **Học bạ**: học sinh thấy mình đã giải bài nào và hoàn thành đề nào, trong lớp nào. Học bạ vẫn còn sau khi lớp bị xóa hẳn (khi đó chỉ không mở lại được đề), và học sinh vẫn giữ code mình đã nộp.
- **Đăng ký**: học sinh tự đăng ký và xác thực **email bằng mã OTP**; mã lớp không bắt buộc (nhập thì gửi luôn yêu cầu vào lớp đó). Giáo viên được admin **mời qua email** và tự đặt mật khẩu. Có chức năng quên mật khẩu.
- **Admin** (duy nhất một tài khoản): quản lý tài khoản, xem được mọi ngân hàng và mọi lớp.
- **Gói tổ chức** (trung tâm, trường học): admin tạo tổ chức với số chỗ giáo viên, ngày hết hạn và có kèm AI hay không, rồi chọn giáo viên làm **quản lý tổ chức**. Quản lý mời giáo viên bằng email (giáo viên đã có tài khoản chấp nhận lời mời ở trang chủ; email mới nhận đường link và mã để tạo tài khoản), mời ra, cho làm quản lý. Mỗi giáo viên và mỗi lời mời đang chờ dùng một chỗ; hết chỗ thì không mời thêm được. Một giáo viên có thể ở **nhiều tổ chức**.
  - Khi tạo lớp, giáo viên chọn lớp thuộc tổ chức nào hoặc là lớp cá nhân (lớp cá nhân chuyển vào tổ chức được, không chuyển ra được). Quản lý tổ chức **xem và quản lý mọi lớp của tổ chức** như giáo viên của lớp: học sinh, phiên, kết quả, bài nộp, chấm lại, gợi ý cần xem lại, bảng tin, giao lớp cho giáo viên khác của tổ chức. Quản lý tổ chức lưu trữ được lớp nhưng không xóa hẳn được (chỉ giáo viên phụ trách lớp và admin).
  - Bài tập có thể chia sẻ **trong tổ chức**: giáo viên của tổ chức xem toàn bộ bài (đề, test ẩn, lời giải) và lưu bản sao; người ngoài tổ chức không thấy.
  - Giáo viên của tổ chức còn hạn và có kèm AI được dùng các tính năng AI (như tài khoản VIP). Hết hạn thì tắt AI và không mời thêm; lớp, bài và dữ liệu vẫn giữ nguyên.
  - Khi giáo viên rời tổ chức: lớp của tổ chức do họ dạy **ở lại tổ chức** (chuyển cho quản lý); giáo viên giữ bài của mình, tổ chức giữ một bản sao các bài đã chia sẻ trong tổ chức.
- Chấm tự động C, C++, Python, Java, JavaScript; bảng điểm theo phiên; in đề và in đáp án từ ngân hàng.

## Kiến trúc

pnpm monorepo:

| Thư mục | Package | Vai trò |
|---|---|---|
| `src/shared` | `@oj/contracts` | Kiểu dữ liệu dùng chung: DTO của API, enum, message của hàng đợi chấm |
| `src/backend` | `@oj/backend` | NestJS REST API, tổ chức theo DDD |
| `src/engine` | `@oj/engine` | Worker chấm bài: lấy job từ Redis, chạy code trong sandbox Docker |
| `src/frontend` | `@oj/frontend` | Next.js, deploy lên Vercel |

```
 Next.js (Vercel) ──HTTP──▶ NestJS API ──▶ PostgreSQL
                               │  ▲
                   judge-jobs  ▼  │ judge-results       (BullMQ / Redis)
                            Engine worker × N ──▶ docker run oj-runner (no network, giới hạn CPU/RAM/PID)
```

### Backend: bounded contexts (DDD)

Mỗi context nằm trong `src/backend/src/modules/<context>` và chia lớp `domain / application / infrastructure / presentation`:

- **identity**: aggregate `User` và `Verification` (OTP email, lời mời giáo viên). Bất biến "đúng một admin" được đảm bảo ở hai nơi: domain không có cách nào tạo ADMIN ngoài `bootstrapAdmin` khi khởi động, và database có partial unique index. Phát event `student-registered`, `user-deleted`.
- **classroom**: aggregate `Classroom` (mã lớp, giáo viên, vòng đời ACTIVE → ARCHIVED → xóa hẳn, có hẹn giờ), `Enrollment` (lớp của học sinh, có thể nhiều lớp cùng lúc, lớp đã rời là lịch sử) và `MembershipRequest` (yêu cầu vào/rời lớp chờ giáo viên duyệt). Phát event `class-purged`.
- **catalog**: ngân hàng bài tập. Aggregate `Problem` (chủ sở hữu, mức chia sẻ `Sharing`, các `TestCase`, `Solution`, nguồn sao chép). Phát event `problem-deleted`.
- **importing**: domain service `ExamParser` (heuristic cho đề tiếng Việt/Anh), port `DocumentReader` (mammoth cho docx, unpdf cho pdf). Bài nhập vào ngân hàng của người nhập.
- **assessment**: aggregate `ProblemSet` (đề trong ngân hàng) và `Session` (phiên: bản chụp các bài + thời gian mở/đóng, thuộc một lớp hoặc công khai). Projection **học bạ** (`learning_sessions`, `learning_progress`) được cập nhật từ event `submission-judged` và tồn tại độc lập với phiên và lớp.
- **integrity**: aggregate `IntegrityFlag` (gợi ý cần xem lại), domain service vân tay code (`fingerprint.ts`), port `AiUsageReviewer` (Claude). Nghe event `submission-judged` và chạy kiểm tra ở nền, không làm chậm việc chấm.
- **community**: aggregate `Thread` (thông báo / hỏi đáp kèm các trả lời). Quyền đăng bài do lớp quyết định; nghe `class-purged`.
- **judging**: aggregate `Submission` (gắn với phiên + bài, PENDING → JUDGING → DONE), port `JudgeQueue` (BullMQ). Hỏi assessment xem ai được nộp; phát event `submission-judged`.

Chiều phụ thuộc giữa các context: `integrity → judging → assessment → catalog, classroom → identity`, `community → assessment, classroom`. Không có vòng lặp: các phản ứng ngược chiều đi qua event (published language trong các file `*.events.ts`). Mỗi context dùng facade đã công bố của context khác qua port/adapter riêng (anti-corruption layer). Repository là abstract class trong domain; phần cài đặt bằng TypeORM nằm ở infrastructure.

### Hàng đợi chấm

- Backend chỉ đẩy job vào Redis. Job tự chứa đủ dữ liệu (code, giới hạn, test case) nên engine không cần truy cập DB.
- Có thể chạy nhiều engine song song (`JUDGE_CONCURRENCY` cho mỗi engine). BullMQ lo việc phân phối, retry và giữ job khi engine khởi động lại.
- Mỗi học sinh có tối đa `MAX_PENDING_SUBMISSIONS` bài đang chờ chấm, để một người không làm nghẽn hàng đợi. Giới hạn này và giới hạn số lần nộp mỗi bài được kiểm tra và ghi trong **một giao dịch** (khóa theo học sinh), nên nộp song song hàng chục request cũng không vượt được.
- **Bài mất kết quả không khóa học sinh**: nếu job của một bài nộp biến mất khỏi hàng đợi (Redis mất dữ liệu, engine sập khi đang chấm) thì sau `JUDGE_STALE_AFTER_SECONDS` (mặc định 300) bài đó được kết thúc với lỗi hệ thống `IE` kèm lời giải thích, học sinh nộp lại được ngay (hoặc giáo viên chấm lại). Job còn trong hàng đợi hay đang chạy thì không bị đụng tới (hàng đợi dài không phải là mất job), cho tới `JUDGE_GIVE_UP_AFTER_SECONDS` (mặc định 1800) để xử lý cả trường hợp engine bị treo. `IE` không vào bảng điểm, học bạ và không tính là một lần nộp.
- Sandbox: mỗi bài nộp chạy trong một container `oj-runner` riêng, dùng một lần: `--network none`, 1 CPU, `--pids-limit`, bỏ hết capability (chỉ giữ SETUID/SETGID/KILL cho trình giám sát), `no-new-privileges`, hệ tệp gốc `--read-only`, và **không mount thư mục nào của máy chủ**: `/box` (nơi biên dịch/chạy) và `/tmp` là tmpfs có giới hạn dung lượng, nên chương trình không ghi tràn đĩa máy chủ được. Dữ liệu vào/ra đi qua `docker exec` (stdin/stdout), không qua tệp chung.
- Trình giám sát `oj-run` (mã C trong `src/engine/runner/oj-run.c`, build vào image): mọi mã không tin cậy, kể cả trình biên dịch, chạy qua nó. Nó chạy root trong container rồi hạ quyền chương trình xuống `nobody`, giới hạn CPU/dung lượng ghi, ép giới hạn thời gian thực (kill cả nhóm tiến trình, chính nó không bị kill) và đo CPU/RSS đỉnh bằng `wait4`. Chương trình không dùng chung đường dẫn nào với bộ chấm nên **không thể làm giả số đo** (trước đây ghi đè được `/box/.stat`). Tiến trình sót lại bị dọn sau mỗi test.
- Bộ nhớ: lúc biên dịch container có hạn mức rộng (`COMPILE_MEMORY_MB`, mặc định 768) để `g++` với `bits/stdc++.h` không bị giết; trước khi chạy test, hạn mức được hạ xuống (`docker update`) còn giới hạn của đề + mức nền của ngôn ngữ + bộ đệm vào/ra và tmpfs (các trang này tính vào cgroup). MLE vẫn được xác định theo RSS đỉnh so với giới hạn của đề. Mỗi chương trình ghi tối đa `max(4 MiB, 2×đáp án + 1 MiB)` (tối đa 64 MiB) cho stdout, stderr và mỗi tệp; in nhiều hơn thì bị cắt và tính là Sai kết quả ("Output limit exceeded"). Thời gian giới hạn của kernel tính theo giây nguyên, nên một bài TLE tốn khoảng 2 giây CPU ngay cả khi giới hạn của đề dưới 1 giây (thời gian báo cho học sinh vẫn là giới hạn của đề).
- Độ bền: container tự hủy khi quá hạn dù engine đã chết, và engine dọn container hết hạn (nhãn `oj.sandbox`/`oj.deadline`) khi khởi động rồi mỗi phút. Mỗi job có hạn chót cứng tính từ chính job đó; Docker treo thì job bị kết thúc bằng `IE` và worker được giải phóng. Khi khởi động engine kiểm tra Docker và phiên bản image (`oj.runner.version`), thiếu hoặc cũ thì dừng kèm hướng dẫn `pnpm runner:build`.

## Chạy trên máy (development)

Yêu cầu: Node 24, pnpm, Docker Desktop.

```bash
pnpm install
```

```bash
pnpm build:shared
```

```bash
pnpm infra:up
```

```bash
pnpm runner:build
```

```bash
cp src/backend/.env.example src/backend/.env
```

Sau đó chạy mỗi lệnh dưới đây trong một terminal riêng:

```bash
pnpm dev:backend
```

```bash
pnpm dev:engine
```

```bash
pnpm dev:frontend
```

- API: http://localhost:4000/api. Frontend: http://localhost:3000
- Admin mặc định lấy từ `.env`: `admin@oj.local` / `admin12345`. **Hãy đổi trước khi dùng thật**: với `NODE_ENV=production`, server không tạo tài khoản admin bằng mật khẩu yếu hoặc quen thuộc (dưới 12 ký tự, hay như `admin12345`).
- `JWT_SECRET` để trống khi phát triển: mỗi lần chạy server dùng một khóa ngẫu nhiên (khởi động lại thì bị đăng xuất). Muốn giữ phiên đăng nhập, đặt chuỗi ngẫu nhiên từ 32 ký tự (`openssl rand -hex 32`). Server **từ chối khởi động** nếu khóa quá ngắn hoặc là giá trị mẫu (ví dụ `change-me…` của `.env.example` cũ), vì ai biết khóa đều tự ký được token admin.
- Gửi email: khi để trống `SMTP_HOST`, email (mã OTP, link mời) **được in ra log của backend** thay vì gửi thật. Chỉ dùng cho môi trường phát triển: với `NODE_ENV=production`, backend không khởi động nếu thiếu `SMTP_HOST`. Để gửi bằng Gmail, bạn cần bật xác minh 2 bước cho tài khoản Gmail, tạo **App Password**, rồi đặt `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<gmail>` và `SMTP_PASS=<app password>`. Gmail giới hạn khoảng 500 email/ngày, đủ cho một lớp học.
- AI: đặt `ANTHROPIC_API_KEY` trong `src/backend/.env`. Model chọn riêng cho từng việc: `CLAUDE_MODEL` cho đọc đề (mặc định `claude-sonnet-5-5`), `CLAUDE_TESTGEN_MODEL` cho gợi ý test (mặc định bằng `CLAUDE_MODEL`) và `CLAUDE_REVIEW_MODEL` cho kiểm tra dùng AI (mặc định `claude-haiku-5-5`, rẻ vì chạy trên từng bài nộp). Khi để trống key, đọc đề dùng bộ đọc theo mẫu và bỏ qua kiểm tra dùng AI. Với Sonnet/Opus, lệnh gọi bật sẵn *refusal fallback* phía server (`fallbacks: "default"`); Haiku không hỗ trợ nên không gửi tham số này.
- Giáo viên tạo lớp và đặt mã lớp ở trang **Lớp**. Học sinh dùng mã đó để xin vào lớp (khi đăng ký hoặc ở trang **Lớp của tôi**), rồi giáo viên duyệt ở trang lớp.
- Sau khi cập nhật mã engine, build lại image runner: `pnpm runner:build` (engine không khởi động với image cũ).
- Dữ liệu mẫu để thử giao diện: khi Postgres, Redis và engine đang chạy, chạy `pnpm --filter @oj/backend seed`. Lệnh tạo 3 giáo viên (`gv.lan` là VIP, `gv.minh`, `gv.hoa`), 12 học sinh `hs01`…`hs12` (đuôi `@oj.local`), lớp, ngân hàng bài, đề, phiên đang mở, sắp mở và đã đóng, bảng tin, các bài nộp được chấm thật và một cảnh báo đạo văn. Mật khẩu chung nằm trong `SEED_PASSWORD` của `src/backend/src/seed.ts`. Lệnh chỉ chạy một lần. Trước khi kết nối tới bất cứ đâu, lệnh đọc `.env` như backend và từ chối khi `NODE_ENV=production` hoặc khi `DATABASE_URL`/`REDIS_URL` không trỏ tới máy này.
- Không có Docker? Có thể chạy engine với `SANDBOX=local`: code chạy thẳng trên máy, **không cách ly**, chỉ dùng để thử.

Kiểm thử:

```bash
pnpm test
```

`pnpm test` chạy cả các bài kiểm thử Docker của engine (cần Docker và image `oj-runner` đã build); thiếu một trong hai thì các bài này được bỏ qua kèm lý do. Các bài kiểm thử PostgreSQL của backend (kiểm tra các câu lệnh nguyên tử trên cơ sở dữ liệu thật, trong một schema tạm) chỉ chạy khi có `TEST_DATABASE_URL` (và Redis khi có `TEST_REDIS_URL`); `pnpm test:integration` đặt sẵn hai biến này trỏ tới cơ sở dữ liệu tạm.
Các loại kiểm thử:

| Loại | Lệnh | Cần gì |
|---|---|---|
| Unit (backend, engine, frontend) | `pnpm test` | Không cần gì; các bộ tích hợp tự bỏ qua khi thiếu biến môi trường |
| Tích hợp (PostgreSQL, Redis thật) | `pnpm infra:test:up` rồi `pnpm test:integration` | Docker |
| End-to-end qua HTTP (backend đã build, API thật) | `pnpm infra:test:up` rồi `pnpm test:e2e:api` | Docker |
| End-to-end trên trình duyệt (Playwright) | `pnpm exec playwright install chromium` (một lần), `pnpm infra:test:up`, rồi `pnpm test:e2e:browser` | Docker |

Kiểm thử tích hợp và end-to-end chỉ dùng **cơ sở dữ liệu tạm** của `docker-compose.test.yml` (cổng 55432 và 56379, dữ liệu chỉ nằm trong RAM), không bao giờ đụng tới dữ liệu phát triển ở cổng 5432/6379. Mỗi lần chạy end-to-end tạo một database mới rồi xóa khi xong; frontend được build riêng vào `.next-e2e` (cổng 3100) nên không ảnh hưởng `pnpm dev:frontend` đang chạy. Email (mã OTP, link mời) được đọc từ log của backend như khi phát triển. Engine không chạy trong end-to-end: bài nộp được nhận và đưa vào hàng đợi, không được chấm. Tắt cơ sở dữ liệu tạm: `pnpm infra:test:down`.

## Bảo mật và giới hạn

- **Giới hạn tần suất** (trả `429` kèm `Retry-After`, chi tiết ở [docs/API.md](docs/API.md)): đăng nhập sai quá 10 lần/10 phút cho một tài khoản từ một IP (và 300 lần/10 phút cho một IP, chống thử mật khẩu hàng loạt; 100 lần/giờ cho một tài khoản tính gộp mọi IP — nhiều hơn mức một IP được phép trong một giờ, nên một địa chỉ không thể tự làm đầy; địa chỉ đã đăng nhập thành công hoặc đặt lại mật khẩu cho tài khoản đó trong 30 ngày qua không bị chặn, đặt lại mật khẩu sẽ gỡ chặn, và chủ tài khoản nhận một email báo); đăng ký, quên mật khẩu, gửi lại mã giới hạn theo IP và theo hộp thư (2 lần/phút). Chỉ lần đăng nhập **sai** bị tính, nên cả lớp dùng chung một IP của trường vẫn đăng nhập bình thường. Máy dùng IPv6 được tính theo khối /64. Bộ đếm và danh sách địa chỉ đã đăng nhập nằm trong Redis (cùng Redis với hàng đợi chấm bài), nên không mất khi khởi động lại backend và đúng cả khi chạy nhiều bản backend; nếu Redis không kết nối được, các endpoint này báo lỗi thay vì bỏ qua giới hạn.
- **Đặt lại mật khẩu chỉ bằng liên kết** trong email (không có mã để đoán; nhập sai liên kết không làm hỏng liên kết thật của chủ tài khoản). Bí mật trong liên kết nằm sau dấu `#`, trình duyệt không gửi nó tới máy chủ nào. **Đăng ký chỉ bằng mã 6 chữ số** nhập trên màn hình đã yêu cầu mã — email đăng ký không có liên kết, để không ai lợi dụng chủ hộp thư xác nhận một tài khoản do người khác tạo. Mỗi email chỉ được nhập sai mã đăng ký 20 lần trong 24 giờ (tính cả khi gửi lại mã hay đăng ký lại), nên không thể đoán mã bằng cách xin mã mới liên tục. Mã trong liên kết mời giáo viên nằm sau dấu `#` và được xóa khỏi thanh địa chỉ ngay khi mở.
- **Mã xác thực (OTP)**: mỗi mã chỉ có 5 lần thử và chỉ dùng được một lần. Lượt thử được trừ **nguyên tử trước khi so mã**, nên gửi song song hàng trăm lần đoán cũng chỉ có 5 lần được so.
- **Phiên đăng nhập**: token gắn với mật khẩu hiện tại. Đổi hay đặt lại mật khẩu, hoặc xóa tài khoản, là mọi token cũ hết hiệu lực ngay. Vai trò và tên luôn lấy từ tài khoản, không tin nội dung token.
- **Cấu hình**: không có khóa bí mật nào biết trước. Thiếu `JWT_SECRET` thì production không khởi động, còn môi trường phát triển dùng khóa ngẫu nhiên; khóa ngắn hoặc giá trị mẫu bị từ chối ở mọi môi trường.
- **Sau reverse proxy** (nginx, Caddy, load balancer): đặt `TRUST_PROXY=<số proxy đứng trước API>` (thường là `1`), nếu không backend thấy mọi người cùng một IP (của proxy) và giới hạn tần suất sẽ chặn nhầm cả trường. Không đặt `TRUST_PROXY=true`: khi đó ai cũng giả được IP bằng header `X-Forwarded-For` (với `NODE_ENV=production` backend từ chối khởi động).
- **Nâng cấp từ bản cũ**: mọi token cũ hết hiệu lực (người dùng đăng nhập lại một lần); cột `submissions.queuedAt` được thêm tự động khi `DB_SYNC=true` (nếu tắt `DB_SYNC`, chạy `ALTER TABLE submissions ADD COLUMN "queuedAt" timestamptz;`); `.env` cũ còn `JWT_SECRET=change-me…` phải đổi.

## Triển khai

- **Frontend → Vercel**: Root Directory `src/frontend`, đặt biến môi trường `NEXT_PUBLIC_API_URL=https://<api-domain>/api`. Chi tiết xem `src/frontend/README.md`.
- **Backend + engine + Postgres + Redis**: chạy trên một máy chủ/VPS có Docker. Engine cần quyền gọi `docker` để tạo sandbox. Trong production đặt `NODE_ENV=production`, `JWT_SECRET` ngẫu nhiên (bắt buộc, `openssl rand -hex 32`), mật khẩu admin mạnh, `CORS_ORIGINS` và `FRONTEND_URL` là domain thật, và `TRUST_PROXY` nếu đứng sau reverse proxy (xem mục *Bảo mật và giới hạn*). Server in cảnh báo khi cấu hình production còn trỏ về localhost. Redis phải chạy với `maxmemory-policy noeviction` (mặc định của Redis, và BullMQ cũng cần): nếu Redis được phép xóa khóa khi đầy bộ nhớ, bộ đếm giới hạn tần suất có thể bị xóa mất. Production cần cột `linkHash` trong bảng `verifications` và cột `faultSource` trong bảng `submissions`; nếu không dùng `DB_SYNC`, chạy `ALTER TABLE verifications ADD COLUMN "linkHash" varchar(255);` và `ALTER TABLE submissions ADD COLUMN "faultSource" varchar(16);`. Dự án chưa có migration: lần đầu cần `DB_SYNC=true` để tạo bảng (server cảnh báo), hãy sao lưu trước khi nâng cấp.

## Tài liệu

- REST API: [docs/API.md](docs/API.md)
- Thiết kế giao diện: [src/frontend/DESIGN.md](src/frontend/DESIGN.md)
