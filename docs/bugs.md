# Known bugs

Open issues found during development. Fix each one test-first, then move it to "Fixed" with the commit.

## Open

### 1. `doctor` can give the wrong reason for a user-namespace failure

**Found:** 2026-11-26, while checking what `oh-really doctor` prints on Linux without bubblewrap.
**Where:** `linuxChecks` in `src/platform/evaluate.ts`.
**Severity:** low. The launch is still refused correctly in every case. Only the explanation is wrong, which can send the user after the wrong fix.

The output below was produced by running `evaluate` + `formatReport` on each scenario.

#### 1a. Hint does not match the cause when the bwrap probe fails

bubblewrap is installed, namespaces are enabled, but bwrap fails to start a namespace (e.g. blocked by a security module):

```
  ok    bubblewrap: 0.9.0
  FAIL  Unprivileged user namespaces: bwrap could not start
        user namespaces are disabled (user.max_user_namespaces = 0)
```

The detail line is right; the hint is wrong. `max_user_namespaces` is 63000 here, not 0.

**Why:** the hint is chosen only by `apparmorRestrictsUserns`. Every other failure falls through to the hard-coded "max_user_namespaces = 0" text, whatever actually caused it.

#### 1b. Without bubblewrap, the namespace check is judged too early on Ubuntu

On Ubuntu 23.10+ (AppArmor restricts unprivileged namespaces) with bubblewrap missing:

```
  FAIL  bubblewrap: not installed
        install bubblewrap 0.4.0 or later (e.g. "sudo apt install bubblewrap")
  FAIL  Unprivileged user namespaces: restricted by AppArmor
        Ubuntu's AppArmor blocks user namespaces for unknown programs; ...
```

Two failures are shown for what is often one fix: Ubuntu's bubblewrap package ships an AppArmor profile, so installing it usually clears both. With no bwrap there is nothing to probe, so the second line is a guess from a sysctl and should not be a FAIL.

(On WSL without bubblewrap this does not happen: only the bubblewrap check fails, which is correct.)

#### Expected

- When bubblewrap is missing, show the namespace check as **skipped (needs bubblewrap)**, never as a second failure.
- When the namespace check fails, the hint names the real cause:

| Cause | Hint |
|---|---|
| `bwrapProbe === false` | bwrap is installed but could not create a namespace; check AppArmor/SELinux or the kernel's namespace settings |
| `apparmorRestrictsUserns` (no probe) | Ubuntu AppArmor restriction (current text) |
| `maxUserNamespaces === 0` | user namespaces are disabled (current text) |

#### Fix plan

1. Failing tests first in `test/platform/evaluate.test.ts`:
   - bwrap missing + AppArmor restriction: exactly one failing check (`bwrap`); `userns` reported as skipped.
   - `bwrapProbe: false` with `maxUserNamespaces: 63000`: hint does not mention `max_user_namespaces`.
2. Add a `skipped` state to `Check` (printed as `skip` by `formatReport`; does not count against `supported`, since the bwrap failure already does).
3. Choose the hint from the same condition that decided the result.

### 4. A hidden file reads as "Permission denied" instead of empty

**Found:** 2026-11-26 on L1, `proven.md` 4.6.
**Where:** the hidden-path handling in `buildBwrapArgs`, `src/sandbox/linux/bwrap.ts`.
**Severity:** low. The content is protected either way. This is about predictable behaviour.

With `hidden = ["./.env"]`, `cat .env` inside the sandbox gives `Permission denied` rather than an empty file.

**Why:** hidden files are covered with `--ro-bind /dev/null <file>`. Inside a user namespace the kernel does not allow opening device nodes from such a mount, so the read is refused instead of returning nothing. (Hidden folders use an empty tmpfs and behave as intended.)

**Why it matters:** some tools treat "permission denied" on a config file such as `.env` as a fatal error, but handle an empty file fine. Empty is also what the docs promise.

**Fix plan:** test first in `test/sandbox/bwrap.test.ts`. A hidden file should be covered by an empty regular file inside the run's private temp folder (read-only), not by `/dev/null`. Then re-run 4.6 on L1.

## Fixed

### 5. A granted file in the home folder cannot be saved by write-temp-then-rename

**Found:** 2026-11-26 on L1, `proven.md` 6.6. This was suspected from the design and has now been confirmed.
**Fixed in code:** 2026-11-26 (`src/run/stage.ts`, tests in `test/run/stage.test.ts`, `test/sandbox/bwrap.test.ts`, `test/sandbox/seatbelt.test.ts`). **Awaiting re-test on L1.**
**Where:** how single-file grants are mounted (`buildBwrapArgs`); the same class of problem applies to the Seatbelt profile.
**Severity:** high for Claude Code. It almost certainly saves `~/.claude.json` this way, so logins and settings would not persist under oh-really.

```
$ oh-really <fake claude that writes ~/.claude.json.tmp, then mv's it over ~/.claude.json>
mv: cannot move '~/.claude.json.tmp' to '~/.claude.json': Device or resource busy
```

**Why:** `~/.claude.json` is bind-mounted into an otherwise empty, in-memory home. The temp file is created in that in-memory home, and the kernel refuses to rename anything *onto* a mount point (EBUSY). Even if it allowed it, the result would land in the throwaway home, not on disk.

On macOS the same save would fail differently: the profile grants `~/.claude.json` but not the right to create `~/.claude.json.tmp` next to it.

**Options**

1. **Copy in, copy back (Linux).** Put a copy of the granted file in the sandbox's home instead of bind-mounting it, and write it back on exit if it changed. Renames then work normally. If the tool is killed hard (`kill -9` on oh-really itself), the change is lost.
2. **Grant the file plus its temp siblings (macOS).** Allow writes to `~/.claude.json` and `~/.claude.json.*`, the pattern apps use for temp files. This is precise and needs no copying. It does not work on Linux, because files that do not exist yet cannot be bind-mounted.
3. **Tool-specific: move the tool's config into a folder.** For example, Claude Code reads `CLAUDE_CONFIG_DIR`. Granting a folder avoids the problem entirely, since renames inside a mounted folder work. But this splits the login from the user's normal, unsandboxed Claude, and it only helps tools that offer such a setting.

**Chosen:** 1 on Linux and 2 on macOS, both behind the same profile semantics ("this file is read-write").

**What was built:**
- **Linux:** the sandbox's home is no longer an empty in-memory folder. It is a private staging folder inside the run's temp folder, mounted as home. Granted *files* under home are copied into it before the run and written back after the run if they changed. The write-back itself is a temp-then-rename on the real disk. Grants that do not exist yet are watched, and whatever the tool creates there (file or folder) is copied back; this also fixes a tool's first run, which previously lost its new config. Existing folders are still mounted live. If the tool deletes its copy, the real file is left alone.
- **macOS:** read-write grants that are files, or that do not exist yet, are allowed by prefix (`<path>` and `<path>.*`), so the temp file next to them can be created and renamed over them.

**Known limitation (not critical, by decision):** if something outside the sandbox (the user, an editor, another agent) changes the same file while the tool runs, the tool's version is written back on exit and wins. Edits made outside during a run are not oh-really's concern; this is noted so it is not mistaken for a bug later.


### 3. `--net open` on Linux cannot resolve any host

**Found:** 2026-11-26 on L1 (WSL2 Ubuntu), `proven.md` 5.3.
**Fixed:** 2026-11-26, regression tests in `test/sandbox/bwrap.test.ts`. **Verified on L1** (`proven.md` 5.3).

```
$ oh-really --net open curl -sS -o /dev/null -w "%{http_code}
" https://example.com
curl: (6) Could not resolve host: example.com
```

**Cause (confirmed on L1):** `--share-net` gave the sandbox the real network, but DNS needs `/etc/resolv.conf`, which on WSL is a link to `/mnt/wsl/resolv.conf`. Only `/etc` was mounted into the sandbox, so the link pointed at nothing:

```
host:     /etc/resolv.conf -> /mnt/wsl/resolv.conf
sandbox:  /etc/resolv.conf -> /mnt/wsl/resolv.conf
          cat: /etc/resolv.conf: No such file or directory
          getent hosts example.com: exit 2
```

systemd-resolved distros have the same layout, with the link going into `/run/systemd/resolve/`.

**Fix:** at launch, resolve the real path of `/etc/resolv.conf`. In open mode, if it lies outside `/etc`, mount that one file read-only. Only the file is mounted, not the whole `/mnt/wsl` or `/run` folder. It is not mounted in off or allowlist mode, where the proxy resolves names outside the sandbox.


### 2. Linux sandbox could not find Node or tools installed in the home folder

**Found:** 2026-11-26 on L1 (WSL2 Ubuntu, Node via nvm), see `proven.md`.
**Fixed:** 2026-11-26, regression test in `test/sandbox/bwrap.test.ts`.

`oh-really node -e "..."` failed with:

```
bwrap: execvp ~/.nvm/versions/node/<version>/bin/node: No such file or directory
```

**Why:** `buildBwrapArgs` mounted the read-only system grants (which include the Node install and the tool's install folder) *before* mounting an empty tmpfs over the home folder. In bwrap a later mount covers earlier ones at the same place, so anything granted under `~` (nvm's Node, npm-global tools, oh-really's own relay) vanished.

**Fix:** mount the empty `/tmp` and home first, then the system grants.
