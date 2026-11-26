# Known bugs

Open issues found during development. Fix each one test-first, then move it to "Fixed" with the commit.

## Open

### 9. The home folder itself is never canonicalised (suspected, not reproduced)

**Found:** 2026-11-26, by reasoning from bugs 6 and 7. Not yet seen on a real machine.
**Where:** `prepare` in `src/run/prepare.ts` (home from `os.homedir()`), used by `stageIn` and as the bwrap home mount point.
**Severity:** medium on the affected systems. Granted files under home would not be staged, so saving settings breaks again (bug 5), and grants could be mounted at a path the tool never uses.

Grants are canonicalised (`expandPath`), but the home folder they are compared against is not. Where home sits behind a link, the two disagree:

- Fedora Silverblue/Kinoite and other "atomic" distros: `/home` -> `/var/home`
- Windows, when the profile path is in short form (as in bug 6); not reachable until the Windows backend exists, like bug 7

Then `stageIn` sees `/var/home/me/.claude.json` as outside `/home/me` and skips it. bwrap empties `/home/me` while the grants land under `/var/home/me`, and the tool, following `$HOME`, looks in `/home/me`.

**Fix plan:** test first (fake home behind a link, using a junction on Windows), then canonicalise home once in `prepare` and use that everywhere: staging, bwrap's home mount, and `$HOME` inside the sandbox. Verify on a Silverblue VM or toolbox before marking it fixed.

## Fixed

### 4. A hidden file reads as "Permission denied" instead of empty

**Found:** 2026-11-26 on L1, `proven.md` 4.6.
**Where:** the hidden-path handling in `buildBwrapArgs`, `src/sandbox/linux/bwrap.ts`.
**Fixed:** 2026-11-26 (Linux), test in `test/sandbox/bwrap.test.ts`. Hidden files are covered by an empty, read-only regular file in the run's temp folder instead of `/dev/null`. Also covered by `scripts/smoke.sh`. **Awaiting re-test on L1** (repeat 4.6). macOS hides files with a Seatbelt deny rule, so there a hidden file still gives "Operation not permitted" rather than reading as empty. The content is protected on both.
**Severity:** low. The content is protected either way. This is about predictable behaviour.

With `hidden = ["./.env"]`, `cat .env` inside the sandbox gives `Permission denied` rather than an empty file.

**Why:** hidden files are covered with `--ro-bind /dev/null <file>`. Inside a user namespace the kernel does not allow opening device nodes from such a mount, so the read is refused instead of returning nothing. (Hidden folders use an empty tmpfs and behave as intended.)

**Why it matters:** some tools treat "permission denied" on a config file such as `.env` as a fatal error, but handle an empty file fine. Empty is also what the docs promise.

**Fix plan:** test first in `test/sandbox/bwrap.test.ts`. A hidden file should be covered by an empty regular file inside the run's private temp folder (read-only), not by `/dev/null`. Then re-run 4.6 on L1.

### 1. `doctor` can give the wrong reason for a user-namespace failure

**Found:** 2026-11-26, while checking what `oh-really doctor` prints on Linux without bubblewrap.
**Where:** `linuxChecks` in `src/platform/evaluate.ts`.
**Fixed:** 2026-11-26, tests in `test/platform/evaluate.test.ts` and `test/cli/format.test.ts`. Without bubblewrap the namespace check now shows `skip  ... skipped (needs bubblewrap)`, so one cause gives one failure. When it fails, the hint names the cause that decided it: probe failed (with or without AppArmor), AppArmor restriction, or `max_user_namespaces = 0`. **Awaiting re-test on L1** (repeat 1.4 with bubblewrap removed).
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

| Cause                                | Hint                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `bwrapProbe === false`               | bwrap is installed but could not create a namespace; check AppArmor/SELinux or the kernel's namespace settings |
| `apparmorRestrictsUserns` (no probe) | Ubuntu AppArmor restriction (current text)                                                                     |
| `maxUserNamespaces === 0`            | user namespaces are disabled (current text)                                                                    |

#### Fix plan

1. Failing tests first in `test/platform/evaluate.test.ts`:
   - bwrap missing + AppArmor restriction: exactly one failing check (`bwrap`); `userns` reported as skipped.
   - `bwrapProbe: false` with `maxUserNamespaces: 63000`: hint does not mention `max_user_namespaces`.
2. Add a `skipped` state to `Check` (printed as `skip` by `formatReport`; does not count against `supported`, since the bwrap failure already does).
3. Choose the hint from the same condition that decided the result.

### 10. `package.json` claims Node 20 works, but dependencies need 22.12

**Found:** 2026-11-26, CI `windows-latest / node 20`: vitest crashed while reporting the bug 6 failures.
**Where:** `"engines": { "node": ">=20" }` in `package.json`.
**Fixed:** 2026-11-26. `engines` is `>=22.13` and the README says 22.13. That is one minor above commander's 22.12, because eslint 10 (needed for `npm run check`) requires `^22.13`. A single floor lets CI test the minimum with the full check. The optional `doctor` Node-version check was not done; it stays as an idea.
**Severity:** medium. Users on Node 20 to 22.11 are told oh-really is supported when its own runtime dependency is not.

```
TypeError: Map.groupBy is not a function or its return value is not iterable
 ❯ formatErrorAttempts node_modules/vitest/dist/chunks/cli-api....js
```

What the installed dependencies declare:

| Package | Kind | Needs Node |
|---|---|---|
| commander 15.1 | **runtime** | `>=22.12.0` |
| vitest 5.1 | dev | `^22.12.0 || ^24.0.0 || >=26.0.0` |
| eslint 10.15 | dev | `^20.19.0 || ^22.13.0 || >=24` |
| smol-toml 1.9 | runtime | `>= 18` |
| zod 4.6, koffi 3.3 | runtime | not declared |

**Why it hid in CI:** on Node 20 the tests still *run* (Linux and macOS Node 20 jobs were green). vitest's reporter only reaches `Map.groupBy` (Node 21+) when it has failures to print, so the crash appeared only on Windows, where bug 6 caused failures. As a side effect it hid the real failure details on that job.

**Fix plan:**
1. Set `"engines": { "node": ">=22.12" }`, and change the README's "Requires Node.js 20 or later" to 22.12.
2. CI matrix `node: [22, 24]` (bug 8), pinning 22 to the oldest supported minor (`22.12`) in one job so the minimum is actually tested.
3. Optional: `doctor` gains a Node version check against `engines`, matching the "check everything at startup" promise. Note that with commander 15 an old Node may fail before `doctor` runs, so the check must not depend on commander.

### 8. CI uses deprecated action and Node versions

**Found:** 2026-11-26, warnings in the first CI run.
**Where:** `.github/workflows/ci.yml`.
**Fixed:** 2026-11-26. `actions/checkout@v5` and `actions/setup-node@v5`; matrix is now Node `22.13` (the minimum) and `24`. **Awaiting a CI run without the warning.**
**Severity:** none yet. These are warnings, not failures.

- `actions/checkout@v4` and `actions/setup-node@v4` target Node 20, which GitHub is phasing out on its runners ("Node.js 20 is deprecated ... being forced to run on Node.js 24").
- The test matrix still includes Node 20, which reached end of life in April 2026.

**Fix plan:** move both actions to `@v5` and change the matrix to `node: [22, 24]`. Raising `engines` is bug 10: it is required, not optional, and the minimum is 22.12, not 22.

### 7. The run's temp folder is resolved differently from every other path

**Found:** 2026-11-26, while tracing bug 6.
**Where:** `src/run/launch.ts`, `const tmpDir = realpathSync(mkdtempSync(...))`.
**Fixed:** 2026-11-26, `realpathSync.native` in `src/run/launch.ts`. Not testable until a Windows backend exists, since this code is unreachable on Windows today.
**Severity:** very low, latent. Not reachable today.

Every other path in the policy goes through `realpathSync.native`, but the run's private temp folder uses plain `realpathSync`. On Windows they can disagree about short names (see bug 6).

**Why it is not reachable now:** this line runs only after the platform check, so only on Linux and macOS, and neither has short names. Both versions resolve macOS's `/var` to `/private/var` link the same way. It would become a real mismatch once a Windows backend exists.

**Fix plan:** switch to `realpathSync.native` for consistency.

### 6. Path tests fail on Windows when the temp folder has a short (8.3) name

**Found:** 2026-11-26, first CI run on GitHub Actions (`windows-latest`, Node 20 and 22). Linux passed; macOS had not run yet.
**Where:** the temp-folder setup at the top of `test/policy/paths.test.ts` and `test/policy/resolve.test.ts`. The same pattern is in `test/run/executable.test.ts` and `test/run/stage.test.ts`.
**Fixed:** 2026-11-26. Test roots use `realpathSync.native`, and a new Windows test pins short-name expansion on purpose. Reproduced locally first by pointing `TEMP`/`TMP` at a short-name folder: the same 9 failures as CI. After the fix the full suite passes with both normal and short-name `TEMP`. **Awaiting a green Windows CI run.**
**Severity:** low. Only the tests are wrong. The code under test behaves correctly.

9 tests fail with the same folder written two ways:

```
Expected: C:\Users\RUNNER~1\AppData\Local\Temp\ohr-paths-u9ErZc\project
Received: C:\Users\runneradmin\AppData\Local\Temp\ohr-paths-u9ErZc\project
```

**Why:** on GitHub's Windows runners, `os.tmpdir()` returns a path with the old short name `RUNNER~1` for `runneradmin`. The tests build their expected paths with `realpathSync`, which keeps short names. `expandPath` (`src/policy/paths.ts`) uses `realpathSync.native`, which expands them to the full name. On a machine whose temp path has no short names, the two match and the tests pass. That is why they pass locally.

**Not only CI:** any Windows machine whose `TEMP` contains a short name fails the same way, for example some long or spaced user names.

**Fix plan:** use `realpathSync.native` for the test temp roots in all four files, so expected and actual paths are canonicalized the same way. Check by setting `TEMP`/`TMP` to a short-name path locally (`cmd /c for %I in ("%TEMP%") do @echo %~sI` prints one) and running `npm test`. Also add one Windows-only test that passes a short-name path to `expandPath` and expects the long form, so expanding short names is pinned down on purpose (it stops a short-name alias slipping past a grant check) rather than only by accident of the runner.

### 5. A granted file in the home folder cannot be saved by write-temp-then-rename

**Found:** 2026-11-26 on L1, `proven.md` 6.6. This was suspected from the design and has now been confirmed.
**Fixed in code:** 2026-11-26 (`src/run/stage.ts`, tests in `test/run/stage.test.ts`, `test/sandbox/bwrap.test.ts`, `test/sandbox/seatbelt.test.ts`). **Verified on L1** (`proven.md` 6.6, 6.7).
**Where:** how single-file grants are mounted (`buildBwrapArgs`); the same class of problem applies to the Seatbelt profile.
**Severity:** high for Claude Code. It almost certainly saves `~/.claude.json` this way, so logins and settings would not persist under oh-really.

```
$ oh-really <fake claude that writes ~/.claude.json.tmp, then mv's it over ~/.claude.json>
mv: cannot move '~/.claude.json.tmp' to '~/.claude.json': Device or resource busy
```

**Why:** `~/.claude.json` is bind-mounted into an otherwise empty, in-memory home. The temp file is created in that in-memory home, and the kernel refuses to rename anything _onto_ a mount point (EBUSY). Even if it allowed it, the result would land in the throwaway home, not on disk.

On macOS the same save would fail differently: the profile grants `~/.claude.json` but not the right to create `~/.claude.json.tmp` next to it.

**Options**

1. **Copy in, copy back (Linux).** Put a copy of the granted file in the sandbox's home instead of bind-mounting it, and write it back on exit if it changed. Renames then work normally. If the tool is killed hard (`kill -9` on oh-really itself), the change is lost.
2. **Grant the file plus its temp siblings (macOS).** Allow writes to `~/.claude.json` and `~/.claude.json.*`, the pattern apps use for temp files. This is precise and needs no copying. It does not work on Linux, because files that do not exist yet cannot be bind-mounted.
3. **Tool-specific: move the tool's config into a folder.** For example, Claude Code reads `CLAUDE_CONFIG_DIR`. Granting a folder avoids the problem entirely, since renames inside a mounted folder work. But this splits the login from the user's normal, unsandboxed Claude, and it only helps tools that offer such a setting.

**Chosen:** 1 on Linux and 2 on macOS, both behind the same profile semantics ("this file is read-write").

**What was built:**

- **Linux:** the sandbox's home is no longer an empty in-memory folder. It is a private staging folder inside the run's temp folder, mounted as home. Granted _files_ under home are copied into it before the run and written back after the run if they changed. The write-back itself is a temp-then-rename on the real disk. Grants that do not exist yet are watched, and whatever the tool creates there (file or folder) is copied back; this also fixes a tool's first run, which previously lost its new config. Existing folders are still mounted live. If the tool deletes its copy, the real file is left alone.
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

**Why:** `buildBwrapArgs` mounted the read-only system grants (which include the Node install and the tool's install folder) _before_ mounting an empty tmpfs over the home folder. In bwrap a later mount covers earlier ones at the same place, so anything granted under `~` (nvm's Node, npm-global tools, oh-really's own relay) vanished.

**Fix:** mount the empty `/tmp` and home first, then the system grants.
