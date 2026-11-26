# Proven

Behaviour verified by **running oh-really on a real machine**, as opposed to unit tests. A behaviour goes here only after someone has run it and seen the result. Each entry records when, where, the command and what happened.

Status: **proven** (seen working), **failed** (seen broken, tracked in `bugs.md`), **pending** (next to verify).

## Machines

| Id | OS | Details |
|---|---|---|
| W1 | Windows 10 22H2 (build 19045) | x64, Node 22.14, project on NTFS `D:` |
| L1 | Ubuntu on WSL2 | x64, kernel 6.18.58.1-microsoft-standard-WSL2, bubblewrap 0.9.0, nvm Node |

Note on L1 results dated 2026-11-26 before the relink: those runs used the same source, but launched through the Windows npm shim that WSL finds via the appended Windows PATH. Linux Node ran the build in the Windows project folder. From the relink on, `oh-really` is linked from a Linux copy (`which -a oh-really` lists the `~/.nvm` one first).

---

## 1. Startup and `doctor`

| # | Behaviour | Machine | Date | Status |
|---|---|---|---|---|
| 1.1 | `doctor` reports a fully supported Linux as ready | L1 | 2026-11-26 | proven |
| 1.2 | `doctor` on Windows reports every check and marks the sandbox not ready (exit 1) | W1 | 2026-11-25 | proven |
| 1.3 | Sandboxed launch is refused on Windows, with the report, nothing started | W1 | 2026-11-25 | proven |
| 1.4 | `doctor` with bubblewrap missing fails only the bubblewrap check | L1 | 2026-11-26 | proven |
| 1.5 | Sandboxed launch is refused when bubblewrap is missing | L1 | 2026-11-26 | proven |

**1.1** `oh-really doctor`:
```
Sandbox backend: linux-bwrap

  ok    CPU architecture: x64
  ok    Not WSL1: kernel 6.18.58.1-microsoft-standard-WSL2
  ok    bubblewrap: 0.9.0
  ok    Unprivileged user namespaces: max 31626

This system is ready: every protection can be enforced.
```
This also proves `bwrap --version` parsing, the user-namespace probe actually starting bwrap, and the `/proc/sys/user/max_user_namespaces` read.

**1.4** After `sudo apt remove bubblewrap`, `oh-really doctor`:
```
  ok    CPU architecture: x64
  ok    Not WSL1: kernel 6.18.58.1-microsoft-standard-WSL2
  FAIL  bubblewrap: not installed
        install bubblewrap 0.4.0 or later (e.g. "sudo apt install bubblewrap")
  ok    Unprivileged user namespaces: max 31626
```
Hiding bwrap by dropping `/usr/bin` from PATH is *not* a valid way to test this: Ubuntu's `/bin` links to `/usr/bin`, so bwrap is still found.

**1.5** With bubblewrap removed, `oh-really node -e "console.log('should not run')"` printed "this system cannot enforce the oh-really sandbox" and the report above, exited 1, and the command never ran.

**1.2** `oh-really doctor`:
```
Sandbox backend: windows-appcontainer

  ok    CPU architecture: x64
  ok    Windows build: build 19045
  ok    Project drive file system: NTFS
  FAIL  Windows sandbox: not available yet
```
This also proves that reading the drive's file system through koffi (`GetVolumeInformationW`) works without admin rights.

**1.3** `oh-really node -e "1"` printed "this system cannot enforce the oh-really sandbox" with the report and exited 1.

## 2. Profiles and `explain`

| # | Behaviour | Machine | Date | Status |
|---|---|---|---|---|
| 2.1 | `explain claude` resolves the built-in profile to real paths and lists hosts | W1 | 2026-11-25 | proven |
| 2.2 | `explain` on Linux shows the built-in and user profile layers merged | L1 | 2026-11-26 | proven |
| 2.3 | `explain claude` on Linux | L1 | | pending |

**2.1** listed the project folder, the tool home under `%LOCALAPPDATA%\oh-really\homes\claude`, `~\.claude` and `~\.claude.json` as read-write, `~\.gitconfig` as read-only, and the five allowed hosts.

**2.2** With a user profile `~/.config/oh-really/profiles/default.toml` adding `allow = ["example.com"]`, `oh-really explain curl` showed the project folder and tool home as read-write, `Internet: only example.com`, and both files under "Settings from" (built-in first, then the user file).

## 3. Break glass (`--yolo`)

| # | Behaviour | Machine | Date | Status |
|---|---|---|---|---|
| 3.1 | `--yolo` runs the command and passes its exit code through | W1 | 2026-11-25 | proven |
| 3.2 | `--yolo claude --version` starts the real Claude Code through the npm `.cmd` shim | W1 | 2026-11-25 | proven |

**3.2** printed `2.1.332 (Claude Code)`. Getting there found and fixed a bug: npm's extensionless Git Bash script next to `claude.cmd` was picked first.

## 4. File isolation (Linux)

| # | Behaviour | Machine | Date | Status |
|---|---|---|---|---|
| 4.1 | Can create, edit and delete files in the project folder | L1 | 2026-11-26 | proven |
| 4.2 | Cannot read the home folder (`~/.bashrc`) | L1 | 2026-11-26 | proven |
| 4.3 | Cannot write outside the project (`../x`) | L1 | 2026-11-26 | proven |
| 4.4 | Child processes (`bash -c`) are confined too | L1 | 2026-11-26 | proven |

Run from a scratch folder `~/ohr-test` with the default (strict) profile:

- **4.1** `oh-really bash -c 'echo hello > inside.txt && cat inside.txt && rm inside.txt && echo OK-inside'` printed `hello` and `OK-inside`.
- **4.2** `oh-really bash -c 'cat ~/.bashrc'`: `No such file or directory`, exit 1. `ls -A ~` inside showed only `.local .nvm ohr-test`: the folders that hold granted paths (tool home, Node, the project). Nothing else from the real home is visible.
- **4.3** Writing `/etc/oh-really-test`: `Read-only file system`. Writing `../outside.txt` succeeded *inside* the sandbox, and afterwards `ls ~/outside.txt` on the real machine found nothing. (The sandbox's home was an empty in-memory folder at the time. Since the fix for bug 5 it is a private staging folder that is deleted after the run; re-checked with the same result.)
- **4.4** `oh-really bash -c 'bash -c "cat ~/.bashrc"'`: `No such file or directory`.
- Also: `oh-really node -e ...` runs Node from nvm inside the sandbox, with the working folder set to the project. This confirms the fix for bug 2.

| # | Behaviour | Machine | Date | Status |
|---|---|---|---|---|
| 4.5 | A link inside the project pointing outside it (`ln -s ~/.bashrc`) leads nowhere | L1 | 2026-11-26 | proven |
| 4.6 | A project `.oh-really.toml` can hide a file and a folder inside the project | L1 | 2026-11-26 | proven (see bug 4) |
| 4.7 | A project `.oh-really.toml` that tries to grant access is refused before anything runs | L1 | 2026-11-26 | proven |
| 4.8 | Another tool's login is invisible; the tool's own config is read-write (T3 scenario) | L1 | 2026-11-26 | proven |
| 4.9 | `--rw <folder>` grants exactly one extra folder | L1 | 2026-11-26 | proven |

- **4.5** `oh-really cat ./leak-link`, where the link points to `~/.bashrc`: `No such file or directory`, exit 1.
- **4.6** With `hidden = ["./.env", "./secrets"]`: `secrets/` showed as empty and its file was not visible. `cat .env` gave `Permission denied` (content protected; see bug 4 for why it is not simply empty). Names in the project listing stay visible: `.env .oh-really.toml secrets`.
- **4.8** A fake `codex` script (`~/ohr-bin/codex`, matched to the codex profile by name; `explain` confirmed `~/.codex` read-write), with fake login files for both tools. Under oh-really it printed its own `~/.codex/auth.json`. Reading `~/.claude.json` gave `No such file or directory`. Writing `~/.codex/note` succeeded, and the file was there on the real disk afterwards. This is the T3 Code case (one tool reading another tool's login), blocked.
- **4.9** Without `--rw`, writing `~/ohr-other/x` failed (`No such file or directory`: the folder does not exist in the sandbox's empty home) and nothing appeared on disk. With `--rw ~/ohr-other`, the write landed on the real disk.
- **4.7** With `read_write = ["~"]` in the project file: `"files.read_write" is not allowed in a project file. Project files can only restrict access; put it in your own profile instead.`, exit 1, and the command never ran.

## 5. Network (Linux)

| # | Behaviour | Machine | Date | Status |
|---|---|---|---|---|
| 5.1 | Default profile: no network at all | L1 | 2026-11-26 | proven |
| 5.2 | Allowlist: allowed host works, others blocked with an "oh really?" line | L1 | 2026-11-26 | proven |
| 5.3 | `--net open` gives full network | L1 | 2026-11-26 | proven (after fixing bug 3) |

- **5.1** `oh-really curl ... https://example.com`: `Could not resolve host`. The sandbox has no network and no DNS.
- **5.2** With `example.com` allowed: `https://example.com` returned `200` through the proxy and the in-sandbox relay. `https://google.com` printed `oh really? default tried to reach google.com:443, blocked` and curl got `CONNECT tunnel failed, response 403`.
- **5.3** First run failed with `Could not resolve host` (bug 3). After the fix, `oh-really --net open getent hosts example.com` resolved the host (exit 0) and `oh-really --net open curl ... https://example.com` returned `200`. Re-running 5.1 straight after still gave `Could not resolve host`, so the fix did not leak DNS into the default mode.

## 6. Processes and environment (Linux)

| # | Behaviour | Machine | Date | Status |
|---|---|---|---|---|
| 6.1 | The tool's exit code is passed through | L1 | 2026-11-26 | proven |
| 6.2 | Ctrl+C stops the tool and returns the prompt immediately | L1 | 2026-11-26 | proven |
| 6.3 | No temp folders are left behind after a run, including after Ctrl+C | L1 | 2026-11-26 | proven |
| 6.4 | API keys and secrets in the environment are not passed in | L1 | 2026-11-26 | proven |
| 6.5 | The tool cannot see the user's other processes | L1 | 2026-11-26 | proven |
| 6.6 | Saving a file by write-temp-then-rename works for a granted file in the home folder | L1 | 2026-11-26 | proven (after fixing bug 5) |
| 6.7 | A tool's first run can create its granted config file, and it is kept | L1 | 2026-11-26 | proven |

- **6.1** `oh-really bash -c 'exit 42'`: exit 42.
- **6.2, 6.3** `oh-really sleep 30`, Ctrl+C after a second: prompt back at once. Afterwards `ls -d /tmp/oh-really-*` found nothing.
- **6.4** Started with fake `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `AWS_SECRET_ACCESS_KEY`: none appeared inside. `OH_REALLY=1`, `NPM_CONFIG_PREFIX` (tool home) and `TMPDIR` (private run folder) were set.
- **6.6** First run: a fake `claude` script wrote `~/.claude.json.tmp` and renamed it over `~/.claude.json`: `mv: ... Device or resource busy`, and the real file was unchanged (bug 5). After the fix, the same save printed `SAVE-OK` and the new content was on the real disk afterwards.
- **6.7** With no `~/.claude.json` at all, the fake `claude` created it inside the sandbox, and it was on the real disk after the run.
- Re-checked after the fix, unchanged: `~/.bashrc` still invisible (4.2), `../outside.txt` still never reaches the disk (4.3), no temp folders left behind (6.3).
- **6.5** `oh-really ps aux` listed only two processes: bwrap itself (PID 1) and `ps`.

## 7. Claude Code

| # | Behaviour | Machine | Date | Status |
|---|---|---|---|---|
| 7.1 | `oh-really claude` starts, logs in and answers | L1 | | pending |
| 7.2 | Claude can edit files in the project | L1 | | pending |
| 7.3 | Claude cannot read files outside the project | L1 | | pending |
| 7.4 | Claude can save `~/.claude.json` (suspected to fail: it may save by writing a temp file in the home folder and renaming it) | L1 | | pending |
