# Architecture

oh-really turns a tool's profile into OS-enforced rules, then launches the tool inside them.

```
oh-really claude
     |
     v
cli/        parse arguments, print results
     |
     v
run/        find the executable, load + resolve the profile, start the proxy,
            build the environment, hand off to a backend, clean up afterwards
     |
     +--> policy/    TOML profiles -> layered -> resolved SandboxPolicy (absolute paths)
     +--> platform/  gather facts about the machine -> evaluate against compat table
     +--> net/       allowlisting forward proxy (+ relay used inside the Linux sandbox)
     +--> sandbox/   pure translators: SandboxPolicy -> bwrap args / Seatbelt profile
```

## Folders

| Folder | Responsibility | Side effects |
|---|---|---|
| `src/cli` | Argument parsing (commander) and text output | stdout/stderr only |
| `src/run` | Orchestrates one run end to end | spawns processes, temp dirs |
| `src/policy` | Profile schema, layering, path canonicalisation | reads profile files |
| `src/platform` | `facts.ts` inspects the machine; `evaluate.ts` decides, purely | `facts.ts` only |
| `src/net` | Proxy, allowlist matching, Linux relay | sockets |
| `src/sandbox` | Per-OS translation of a policy; environment allowlist | none (pure) |
| `profiles/` | Built-in TOML profiles shipped with the package | n/a |

## Design rules

- **Pure core, thin edges.** Anything that decides (`evaluate`, `buildBwrapArgs`, `buildSeatbeltProfile`, `buildEnv`, `narrowProfile`) is a pure function with unit tests that run on every OS. I/O lives in `facts.ts`, `launch.ts`, `proxy.ts`.
- **Fail closed.** Unknown profile keys, unknown path variables and unsupported systems are errors. Nothing silently degrades.
- **Project files only narrow.** `.oh-really.toml` comes with code that may be untrusted, so it can hide paths and drop hosts, never grant.
- **Nothing outlives the run.** Temp folders and the proxy are torn down in `finally`; the sandbox itself is per-process kernel state.

## Profile layering

```
profiles/<tool>.toml          built-in          (may grant)
~/.config/oh-really/...toml   the user's own    (may grant: lists union, values override)
withDefaults()                unset -> strictest
./.oh-really.toml             project           (may only narrow)
--rw / --net                  command line      (the human at the keyboard)
```

## Backends

| OS | Mechanism | Status |
|---|---|---|
| Linux | bubblewrap (namespaces, bind mounts); network via proxy socket + in-sandbox relay | implemented and unit-tested; not yet run end to end on a real machine |
| macOS | Seatbelt profile via `sandbox-exec`; network only to the local proxy port | implemented and unit-tested; not yet run end to end on a real machine |
| Windows | AppContainer via koffi | planned; `doctor` reports it as not ready |
