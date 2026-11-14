# Image used as the sandbox for running untrusted submissions.
# Build: pnpm runner:build   (tag: oj-runner:latest)
#
# Every untrusted program is started through /usr/local/bin/oj-run (see oj-run.c): it drops privileges,
# sets resource limits and does the measuring. The engine refuses to start when the image's
# oj.runner.version label does not match the version it was written for, so rebuild after pulling.
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      g++ gcc python3 openjdk-17-jdk-headless nodejs coreutils \
 && rm -rf /var/lib/apt/lists/*

COPY oj-run.c /tmp/oj-run.c
RUN gcc -O2 -Wall -Wextra -Werror -fstack-protector-strong -D_FORTIFY_SOURCE=2 -o /usr/local/bin/oj-run /tmp/oj-run.c \
 && chmod 0700 /usr/local/bin/oj-run \
 && rm /tmp/oj-run.c \
 && /usr/local/bin/oj-run --version

LABEL oj.runner.version="5"

# /box is mounted as a tmpfs at run time; runc keeps the mode of the directory it covers, so it must be 1777
# for the unprivileged user to be able to create files there.
RUN mkdir -p /box && chmod 1777 /box
WORKDIR /box
CMD ["sleep", "infinity"]
