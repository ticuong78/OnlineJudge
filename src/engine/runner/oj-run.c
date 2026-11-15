/*
 * oj-run: supervisor that runs ONE untrusted program inside the judge container.
 *
 *   oj-run [options] -- program [args...]
 *
 * It runs as root (the harness executes it with `docker exec`) and does what a shell wrapper cannot do
 * safely:
 *
 *   - the program runs as an unprivileged user, in its own session/process group, with RLIMIT_CPU,
 *     RLIMIT_FSIZE and RLIMIT_CORE set, no_new_privs on and a clean environment;
 *   - its stdin is a read-only memfd filled from OUR stdin, its stdout/stderr are anonymous memfds that only
 *     we hold. The program shares no file system path with the harness, so it cannot forge or tamper with
 *     what is measured or reported (the old design let it overwrite /box/.stat);
 *   - CPU time is the larger of the program's wait4(2) rusage and what the container's cgroup used during the run,
 *     so a child the program never waits for still counts; peak RSS comes from rusage. The wall deadline is enforced
 *     by this process with kill(-pgid, SIGKILL); we are not in that group, so (unlike `timeout -s KILL`) we
 *     survive the kill, still reap the program and still know how much CPU it burnt;
 *   - afterwards every process left over by the program (daemonised children, fork bombs) is killed; if that
 *     cannot be done (no pid left to start the killer), the reply says so with flag 16 and the harness drops the
 *     container.
 *
 * Reply, written ONCE on stdout (binary safe, no ambiguity):
 *
 *   OJRUN1 <exit> <signal> <cpu_ms> <wall_ms> <rss_kb> <flags> <stdout_len> <stderr_len>\n
 *   <stdout_len bytes of the program's stdout><stderr_len bytes of the program's stderr>
 *
 *   exit    exit status 0..255, or -1 when the program was killed by a signal
 *   signal  terminating signal number, 0 when it exited by itself
 *   flags   1 wall deadline hit (we killed it)     2 killed by the CPU limit (SIGXCPU or the hard-limit SIGKILL)
 *           4 output reached the size cap          8 the program could not be started (reason is in stderr)
 *           16 could not be reaped after SIGKILL (stuck in the kernel), its leftovers could not be killed, or (with
 *              --clean-scratch) what it left in /box and /tmp could not be removed
 *
 * Diagnostics about oj-run itself go to OUR stderr with a non-zero exit status and NO reply on stdout.
 */
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <limits.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/time.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#ifndef MFD_CLOEXEC
#define MFD_CLOEXEC 0x0001U
#endif

#define PROTOCOL "OJRUN1"
#define VERSION_TEXT PROTOCOL "\n"

#define FLAG_WALL_TIMEOUT 1
#define FLAG_CPU_KILL 2
#define FLAG_OUTPUT_LIMIT 4
#define FLAG_START_FAILED 8
#define FLAG_UNREAPED 16

#define DEFAULT_PATH "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
#define STDIN_IDLE_TIMEOUT_MS 60000
/* Well under the engine's DOCKER_CALL_OVERHEAD_MS, so a reply about a stuck program still arrives (tested). */
#define REAP_GRACE_MS 2000

struct options {
	long long cpu_ms;
	long long wall_ms;
	long long fsize_bytes;
	long long max_input_bytes;
	unsigned long uid;
	unsigned long gid;
	const char *cwd;
	int clean_scratch;
	char **argv;
};

enum stage { ST_SETSID = 1, ST_RLIMIT, ST_FDS, ST_PRIVS, ST_CHDIR, ST_EXEC };

static const char *const stage_names[] = {
	"?", "setsid", "setrlimit", "redirect stdio", "drop privileges", "chdir", "exec",
};

struct child_error {
	int stage;
	int err;
};

static void die(const char *what)
{
	int e = errno;
	fprintf(stderr, "oj-run: %s: %s\n", what, strerror(e));
	_exit(2);
}

static void die_usage(const char *msg)
{
	fprintf(stderr, "oj-run: %s\nusage: oj-run [--cpu-ms N] [--wall-ms N] [--fsize-bytes N] [--max-input-bytes N] "
			"[--uid N] [--gid N] [--cwd DIR] -- program [args...]\n", msg);
	_exit(2);
}

static int write_all(int fd, const void *buf, size_t len)
{
	const char *p = buf;
	while (len > 0) {
		ssize_t n = write(fd, p, len);
		if (n < 0) {
			if (errno == EINTR)
				continue;
			return -1;
		}
		p += n;
		len -= (size_t)n;
	}
	return 0;
}

static long long parse_number(const char *name, const char *text, long long min, long long max)
{
	char *end = NULL;
	errno = 0;
	long long v = strtoll(text, &end, 10);
	if (errno != 0 || end == text || *end != '\0' || v < min || v > max) {
		fprintf(stderr, "oj-run: invalid value for %s: '%s'\n", name, text);
		_exit(2);
	}
	return v;
}

static void parse_options(int argc, char **argv, struct options *o)
{
	o->cpu_ms = 1000;
	o->wall_ms = 4000;
	o->fsize_bytes = 64LL * 1024 * 1024;
	o->max_input_bytes = 256LL * 1024 * 1024;
	o->uid = 65534;
	o->gid = 65534;
	o->cwd = "/box";
	o->clean_scratch = 0;
	o->argv = NULL;

	for (int i = 1; i < argc; i++) {
		const char *a = argv[i];
		if (strcmp(a, "--") == 0) {
			if (i + 1 >= argc)
				die_usage("missing program");
			o->argv = &argv[i + 1];
			return;
		}
		if (strcmp(a, "--version") == 0) {
			fputs(VERSION_TEXT, stdout);
			_exit(0);
		}
		if (i + 1 >= argc)
			die_usage("option needs a value");
		const char *v = argv[++i];
		if (strcmp(a, "--cpu-ms") == 0)
			o->cpu_ms = parse_number(a, v, 1, 24LL * 3600 * 1000);
		else if (strcmp(a, "--wall-ms") == 0)
			o->wall_ms = parse_number(a, v, 1, 24LL * 3600 * 1000);
		else if (strcmp(a, "--fsize-bytes") == 0)
			o->fsize_bytes = parse_number(a, v, 1, 1LL << 40);
		else if (strcmp(a, "--max-input-bytes") == 0)
			o->max_input_bytes = parse_number(a, v, 0, 1LL << 40);
		else if (strcmp(a, "--uid") == 0)
			o->uid = (unsigned long)parse_number(a, v, 1, 4294967294LL);
		else if (strcmp(a, "--gid") == 0)
			o->gid = (unsigned long)parse_number(a, v, 1, 4294967294LL);
		else if (strcmp(a, "--cwd") == 0)
			o->cwd = v;
		else if (strcmp(a, "--clean-scratch") == 0)
			o->clean_scratch = (int)parse_number(a, v, 0, 1);
		else
			die_usage("unknown option");
	}
	die_usage("missing '--' before the program");
}

static int make_memfd(const char *name)
{
	return (int)syscall(SYS_memfd_create, name, MFD_CLOEXEC);
}

/* Copies our stdin to fd until EOF. A harness that forgets to close stdin must not hang us for ever. */
static int slurp_stdin(int fd, long long max_bytes)
{
	char buf[65536];
	long long total = 0;
	for (;;) {
		struct pollfd p = { .fd = 0, .events = POLLIN, .revents = 0 };
		int pr = poll(&p, 1, STDIN_IDLE_TIMEOUT_MS);
		if (pr < 0) {
			if (errno == EINTR)
				continue;
			return -1;
		}
		if (pr == 0) {
			errno = ETIMEDOUT;
			return -1;
		}
		ssize_t n = read(0, buf, sizeof buf);
		if (n < 0) {
			if (errno == EINTR)
				continue;
			return -1;
		}
		if (n == 0)
			return 0;
		total += n;
		if (total > max_bytes) {
			errno = EFBIG;
			return -1;
		}
		if (write_all(fd, buf, (size_t)n) != 0)
			return -1;
	}
}

static long long mono_ms(void)
{
	struct timespec ts;
	clock_gettime(CLOCK_MONOTONIC, &ts);
	return (long long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static long long tv_us(const struct timeval *tv)
{
	return (long long)tv->tv_sec * 1000000 + tv->tv_usec;
}

/* Closes every inherited descriptor above stderr except `keep`. */
static void close_inherited_fds(int keep)
{
	DIR *d = opendir("/proc/self/fd");
	if (!d) {
		for (int fd = 3; fd < 1024; fd++)
			if (fd != keep)
				close(fd);
		return;
	}
	int dfd = dirfd(d);
	struct dirent *e;
	while ((e = readdir(d)) != NULL) {
		char *end = NULL;
		long fd = strtol(e->d_name, &end, 10);
		if (*end != '\0' || fd < 3 || fd == dfd || fd == keep)
			continue;
		close((int)fd);
	}
	closedir(d);
}

static int limit(int resource, rlim_t soft, rlim_t hard)
{
	struct rlimit rl = { .rlim_cur = soft, .rlim_max = hard };
	return setrlimit(resource, &rl);
}

static void child_fail(int errfd, int stage)
{
	struct child_error ce = { .stage = stage, .err = errno };
	ssize_t ignored = write(errfd, &ce, sizeof ce);
	(void)ignored;
	_exit(127);
}

/* Runs in the forked child: becomes the unprivileged program. Never returns. */
static void run_child(const struct options *o, int in_fd, int out_fd, int err_fd, int errpipe, const sigset_t *oldmask)
{
	sigprocmask(SIG_SETMASK, oldmask, NULL);
	signal(SIGPIPE, SIG_DFL);
	signal(SIGTERM, SIG_DFL);
	signal(SIGINT, SIG_DFL);
	signal(SIGHUP, SIG_DFL);

	if (setsid() < 0)
		child_fail(errpipe, ST_SETSID);

	rlim_t cpu_soft = (rlim_t)((o->cpu_ms + 999) / 1000 + 1);
	if (limit(RLIMIT_CPU, cpu_soft, cpu_soft + 1) != 0 ||
	    limit(RLIMIT_FSIZE, (rlim_t)o->fsize_bytes, (rlim_t)o->fsize_bytes) != 0 ||
	    limit(RLIMIT_CORE, 0, 0) != 0)
		child_fail(errpipe, ST_RLIMIT);

	if (dup2(in_fd, 0) < 0 || dup2(out_fd, 1) < 0 || dup2(err_fd, 2) < 0)
		child_fail(errpipe, ST_FDS);
	close_inherited_fds(errpipe);

	/* Under memory pressure the cgroup OOM killer must pick the program, not us (raising is always allowed). */
	int oom = open("/proc/self/oom_score_adj", O_WRONLY | O_CLOEXEC);
	if (oom >= 0) {
		ssize_t ignored = write(oom, "1000", 4);
		(void)ignored;
		close(oom);
	}

	if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 ||
	    setgroups(0, NULL) != 0 ||
	    setresgid((gid_t)o->gid, (gid_t)o->gid, (gid_t)o->gid) != 0 ||
	    setresuid((uid_t)o->uid, (uid_t)o->uid, (uid_t)o->uid) != 0)
		child_fail(errpipe, ST_PRIVS);
	/* Paranoia: root must be unrecoverable, and the ids must be exactly what was asked. */
	if (setuid(0) == 0 || getuid() != (uid_t)o->uid || geteuid() != (uid_t)o->uid ||
	    getgid() != (gid_t)o->gid || getegid() != (gid_t)o->gid) {
		errno = EPERM;
		child_fail(errpipe, ST_PRIVS);
	}

	umask(022);
	if (chdir(o->cwd) != 0)
		child_fail(errpipe, ST_CHDIR);

	clearenv();
	setenv("PATH", DEFAULT_PATH, 1);
	setenv("HOME", "/box", 1);
	setenv("TMPDIR", "/tmp", 1);
	execvp(o->argv[0], o->argv);
	child_fail(errpipe, ST_EXEC);
}

static int clean_scratch(const struct options *o);

/*
 * Kills every process the unprivileged user still owns (daemonised children, fork bombs). The kill is sent from a
 * helper running as that user, so kill(-1) reaches exactly its processes and nothing else, in one atomic sweep. With
 * `clean`, the same helper then removes what the user left in /box and /tmp: as their owner it may open and delete all
 * of it, which root here (no CAP_DAC_OVERRIDE or CAP_FOWNER) could not.
 * Returns 0 when that happened, -1 when it could not (no helper could be started, it could not become the user, or
 * the clean-up failed): the caller must then report the run as not cleanly stopped rather than pretend it was.
 */
static int kill_leftovers(const struct options *o, int clean)
{
	for (int attempt = 0; attempt < 50; attempt++) {
		pid_t helper = fork();
		if (helper < 0) {
			/* The cgroup may be out of pids until the killed group has been reaped. */
			usleep(10000);
			continue;
		}
		if (helper == 0) {
			/* Become the user holding nothing of ours: not the reply pipe (stdout), not the input and output memfds. */
			close(STDOUT_FILENO);
			close_inherited_fds(-1);
			if (setgroups(0, NULL) != 0 || setresgid((gid_t)o->gid, (gid_t)o->gid, (gid_t)o->gid) != 0 ||
			    setresuid((uid_t)o->uid, (uid_t)o->uid, (uid_t)o->uid) != 0)
				_exit(1);
			/* ESRCH: nothing was left to kill. */
			int ok = kill(-1, SIGKILL) == 0 || errno == ESRCH;
			if (ok && clean && clean_scratch(o) != 0)
				ok = 0;
			_exit(ok ? 0 : 1);
		}
		int status = 0;
		while (waitpid(helper, &status, 0) < 0) {
			if (errno != EINTR)
				return -1;
		}
		return WIFEXITED(status) && WEXITSTATUS(status) == 0 ? 0 : -1;
	}
	return -1;
}

/*
 * Removes, under the directory `dirfd` (which it takes over and closes), everything owned by `uid`: the files and
 * directories the program left. Runs as `uid` itself (in the kill helper), right after every other process of `uid`
 * was killed, so nothing can change under us. Symlinks are removed, never followed; entries of other owners
 * (root-owned sources and the sealed build output) are kept and not descended into. Directories are made accessible
 * to their owner first (the program may have made them unreadable). Returns 0, or -1 when something could not be
 * removed (or nesting is deeper than we go).
 */
static int remove_owned(int dirfd, uid_t uid, int depth)
{
	DIR *d = fdopendir(dirfd);
	if (!d) {
		close(dirfd);
		return -1;
	}
	int rc = 0;
	struct dirent *e;
	while ((e = readdir(d)) != NULL) {
		if (strcmp(e->d_name, ".") == 0 || strcmp(e->d_name, "..") == 0)
			continue;
		struct stat st;
		if (fstatat(dirfd, e->d_name, &st, AT_SYMLINK_NOFOLLOW) != 0) {
			rc = -1;
			continue;
		}
		if (st.st_uid != uid)
			continue;
		if (S_ISDIR(st.st_mode)) {
			int sub = -1;
			if (depth < 32 && fchmodat(dirfd, e->d_name, 0700, 0) == 0)
				sub = openat(dirfd, e->d_name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
			if (sub < 0 || remove_owned(sub, uid, depth + 1) != 0)
				rc = -1;
			if (unlinkat(dirfd, e->d_name, AT_REMOVEDIR) != 0)
				rc = -1;
		} else if (unlinkat(dirfd, e->d_name, 0) != 0) {
			rc = -1;
		}
	}
	closedir(d);
	return rc;
}

/*
 * Empties the scratch space of what the program wrote, so nothing it left (files, inodes, the memory they hold)
 * carries into the next test: memory that outlives a test could get this supervisor killed then (audit F-1), and
 * files could carry state from one hidden test to the next.
 */
static int clean_scratch(const struct options *o)
{
	static const char *const dirs[] = { "/box", "/tmp" };
	int rc = 0;
	for (size_t i = 0; i < sizeof dirs / sizeof dirs[0]; i++) {
		int fd = open(dirs[i], O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
		if (fd < 0)
			continue; /* not in this sandbox */
		if (remove_owned(fd, (uid_t)o->uid, 0) != 0)
			rc = -1;
	}
	return rc;
}

/*
 * CPU time used so far by everything in this container's cgroup (cgroup v2 cpu.stat), in microseconds, or -1 when it
 * cannot be read (cgroup v1, or no cgroup namespace). Only the program runs here during a test, so the difference
 * across a run is the CPU of the program and every process it started, waited for or not.
 */
static long long cgroup_cpu_us(void)
{
	/* Only inside our own cgroup namespace (cgroup v2, "0::/"): otherwise /sys/fs/cgroup could be the host's. */
	char line[16] = { 0 };
	FILE *self = fopen("/proc/self/cgroup", "re");
	if (!self)
		return -1;
	int own = fgets(line, sizeof line, self) != NULL && strcmp(line, "0::/\n") == 0 && fgetc(self) == EOF;
	fclose(self);
	if (!own)
		return -1;
	FILE *f = fopen("/sys/fs/cgroup/cpu.stat", "re");
	if (!f)
		return -1;
	long long usage = -1;
	char key[64];
	long long value;
	while (fscanf(f, "%63s %lld", key, &value) == 2) {
		if (strcmp(key, "usage_usec") == 0) {
			usage = value;
			break;
		}
	}
	fclose(f);
	return usage;
}

static long long file_size(int fd)
{
	struct stat st;
	if (fstat(fd, &st) != 0)
		return 0;
	return (long long)st.st_size;
}

static int send_fd_contents(int fd, long long size)
{
	char buf[65536];
	off_t off = 0;
	while (size > 0) {
		size_t want = size > (long long)sizeof buf ? sizeof buf : (size_t)size;
		ssize_t n = pread(fd, buf, want, off);
		if (n < 0) {
			if (errno == EINTR)
				continue;
			return -1;
		}
		if (n == 0) {
			/* Shrunk since it was measured (only possible if something still holds it): pad, so the reply stays
			 * the length the header announced instead of being cut short. */
			memset(buf, 0, want);
			n = (ssize_t)want;
		}
		if (write_all(1, buf, (size_t)n) != 0)
			return -1;
		off += n;
		size -= n;
	}
	return 0;
}

int main(int argc, char **argv)
{
	struct options o;
	parse_options(argc, argv, &o);

	signal(SIGPIPE, SIG_IGN);
	signal(SIGCHLD, SIG_DFL);
	prctl(PR_SET_DUMPABLE, 0, 0, 0, 0);

	int in_rw = make_memfd("oj-in");
	int out_fd = make_memfd("oj-out");
	int err_fd = make_memfd("oj-err");
	if (in_rw < 0 || out_fd < 0 || err_fd < 0)
		die("memfd_create");
	if (slurp_stdin(in_rw, o.max_input_bytes) != 0)
		die("reading the program input");

	/* The program gets its own read-only description of the input (seekable, like a redirected file). */
	char path[64];
	snprintf(path, sizeof path, "/proc/self/fd/%d", in_rw);
	int in_fd = open(path, O_RDONLY | O_CLOEXEC);
	if (in_fd < 0)
		in_fd = in_rw;
	if (lseek(in_fd, 0, SEEK_SET) < 0)
		die("lseek input");

	/* SIGCHLD and the termination signals are consumed with sigtimedwait(), so no wake-up can be lost. */
	sigset_t wait_set, old_set;
	sigemptyset(&wait_set);
	sigaddset(&wait_set, SIGCHLD);
	sigaddset(&wait_set, SIGTERM);
	sigaddset(&wait_set, SIGINT);
	sigaddset(&wait_set, SIGHUP);
	if (sigprocmask(SIG_BLOCK, &wait_set, &old_set) != 0)
		die("sigprocmask");

	int errpipe[2];
	if (pipe2(errpipe, O_CLOEXEC) != 0)
		die("pipe2");

	long long cgroup_cpu_before = cgroup_cpu_us();
	long long started = mono_ms();
	pid_t pid = fork();
	if (pid < 0)
		die("fork");
	if (pid == 0)
		run_child(&o, in_fd, out_fd, err_fd, errpipe[1], &old_set);
	close(errpipe[1]);
	close(in_fd);
	if (in_fd != in_rw)
		close(in_rw);

	/*
	 * EOF here means exec succeeded (the pipe is close-on-exec); a record means the program never started. The wait
	 * is bounded by the wall deadline too: a child stuck before exec must not escape the time limit.
	 */
	struct child_error ce = { 0, 0 };
	ssize_t got = 0;
	struct pollfd ep = { .fd = errpipe[0], .events = POLLIN, .revents = 0 };
	int ready;
	while ((ready = poll(&ep, 1, o.wall_ms > INT_MAX ? INT_MAX : (int)o.wall_ms)) < 0 && errno == EINTR)
		;
	if (ready > 0) {
		while ((got = read(errpipe[0], &ce, sizeof ce)) < 0 && errno == EINTR)
			;
	}
	close(errpipe[0]);
	int start_failed = got == (ssize_t)sizeof ce;

	int flags = 0;
	int status = 0;
	int reaped = 0;
	int interrupted = 0;
	struct rusage ru;
	memset(&ru, 0, sizeof ru);

	for (;;) {
		pid_t r = wait4(pid, &status, WNOHANG, &ru);
		if (r == pid) {
			reaped = 1;
			break;
		}
		if (r < 0 && errno != EINTR)
			die("wait4");

		long long elapsed = mono_ms() - started;
		if (elapsed >= o.wall_ms) {
			flags |= FLAG_WALL_TIMEOUT;
			break;
		}
		long long remaining = o.wall_ms - elapsed;
		if (remaining > 200)
			remaining = 200;
		struct timespec ts = { .tv_sec = remaining / 1000, .tv_nsec = (remaining % 1000) * 1000000L };
		siginfo_t si;
		int sig = sigtimedwait(&wait_set, &si, &ts);
		if (sig == SIGTERM || sig == SIGINT || sig == SIGHUP) {
			interrupted = 1;
			break;
		}
	}

	if (!reaped) {
		/* Deadline or interruption: the group dies, we do not. Then collect what the kernel measured. */
		kill(-pid, SIGKILL);
		kill(pid, SIGKILL);
		long long grace_end = mono_ms() + REAP_GRACE_MS;
		for (;;) {
			pid_t r = wait4(pid, &status, WNOHANG, &ru);
			if (r == pid) {
				reaped = 1;
				break;
			}
			if (r < 0 && errno != EINTR)
				die("wait4 after kill");
			if (mono_ms() >= grace_end)
				break;
			usleep(1000);
		}
		if (!reaped)
			flags |= FLAG_UNREAPED;
	}
	long long wall_ms = mono_ms() - started;

	kill(-pid, SIGKILL);
	/* Read before the clean-up below, which is our work, not the program's. */
	long long cgroup_cpu_after = cgroup_cpu_us();
	/* Leftovers that cannot be killed, or a scratch space that cannot be emptied: the container is not used again. */
	if (kill_leftovers(&o, o.clean_scratch) != 0)
		flags |= FLAG_UNREAPED;

	if (interrupted)
		_exit(143);

	int exit_status = -1;
	int term_signal = 0;
	if (reaped && WIFEXITED(status))
		exit_status = WEXITSTATUS(status);
	else if (reaped && WIFSIGNALED(status))
		term_signal = WTERMSIG(status);
	else if (!reaped)
		term_signal = SIGKILL;

	long long own_cpu_ms = (tv_us(&ru.ru_utime) + tv_us(&ru.ru_stime) + 500) / 1000;
	long long soft_cpu_ms = ((o.cpu_ms + 999) / 1000 + 1) * 1000;
	/* RLIMIT_CPU is per process, so whether the kernel's CPU limit killed it is judged on its own time. */
	if (term_signal == SIGXCPU || (term_signal == SIGKILL && !(flags & FLAG_WALL_TIMEOUT) && own_cpu_ms + 20 >= soft_cpu_ms))
		flags |= FLAG_CPU_KILL;
	/* The reported time also counts children it never waited for (they are not in its rusage). */
	long long cpu_ms = own_cpu_ms;
	if (cgroup_cpu_before >= 0 && cgroup_cpu_after >= cgroup_cpu_before) {
		long long group_ms = (cgroup_cpu_after - cgroup_cpu_before + 500) / 1000;
		if (group_ms > cpu_ms)
			cpu_ms = group_ms;
	}

	long long out_len = file_size(out_fd);
	long long err_len = file_size(err_fd);
	if (term_signal == SIGXFSZ || out_len >= o.fsize_bytes || err_len >= o.fsize_bytes)
		flags |= FLAG_OUTPUT_LIMIT;

	if (start_failed) {
		char msg[256];
		int stage = ce.stage > 0 && ce.stage <= ST_EXEC ? ce.stage : 0;
		int n = snprintf(msg, sizeof msg, "oj-run: cannot start '%s': %s failed: %s\n", o.argv[0],
				 stage_names[stage], strerror(ce.err));
		if (n > 0 && write_all(err_fd, msg, (size_t)(n < (int)sizeof msg ? n : (int)sizeof msg - 1)) == 0)
			err_len = file_size(err_fd);
		flags |= FLAG_START_FAILED;
		exit_status = 127;
		term_signal = 0;
	}

	/* Leftovers that could not be killed may still write to or truncate the captured output: send none of it. */
	if (flags & FLAG_UNREAPED)
		out_len = err_len = 0;

	char header[256];
	int hn = snprintf(header, sizeof header, "%s %d %d %lld %lld %ld %d %lld %lld\n", PROTOCOL, exit_status, term_signal,
			  cpu_ms, wall_ms, ru.ru_maxrss, flags, out_len, err_len);
	if (hn <= 0 || write_all(1, header, (size_t)hn) != 0 || send_fd_contents(out_fd, out_len) != 0 ||
	    send_fd_contents(err_fd, err_len) != 0)
		_exit(3);
	_exit(0);
}
