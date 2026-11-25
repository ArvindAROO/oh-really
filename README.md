<div align="center">

# oh-really

**Your CLI tools, on a leash.**

Run any command-line tool so it can only touch the folder you're working in.
No setup, no admin rights, no lock-in.

```bash
npx oh-really claude
```

*Status: early development. Everything below describes the planned behaviour.*

</div>

---

## The problem

Every CLI you install runs with **your** full permissions. It can read any file in your home folder, including the login files of your *other* tools, and send whatever it wants to the internet.

Most tools behave. Some don't. In November 2026, a popular AI coding app was caught reading users' Claude and Codex login files, without asking, just to count unique users.

You shouldn't have to take every tool's good intentions on faith.

## The fix

Put `oh-really` in front of the command. That's the whole workflow.

```bash
oh-really claude        # instead of: claude
oh-really codex         # instead of: codex
oh-really npx some-cli  # works with anything
```

The tool runs exactly as it normally would, except it can't see what it shouldn't.

---

## Install

> 🚧 **Coming soon.** oh-really isn't on npm yet. The commands below are what installing will look like.

```bash
npm install -g oh-really
```

Or try it without installing:

```bash
npx oh-really <tool>
```

Requires Node.js 20 or later. Works on **Windows 10/11**, **macOS 12+** and **most modern Linux** distributions.

---

## What you get

### 📁 Stays in its lane
The tool can read, write and run things **inside the current folder only**. Your documents, other projects and SSH keys simply don't exist as far as it's concerned.

### 🔐 Secrets stay separate
Claude sees Claude's settings. Codex sees Codex's. Neither can peek at the other, and an unrelated app can see neither.

### 🌐 Only talks to who it should
Each tool gets a short list of sites it's allowed to reach, usually just its own API. Analytics, trackers and telemetry are quietly blocked.

```
$ oh-really log t3code
  ✓ api.anthropic.com
  ✗ telemetry.example.com     blocked
```

### 👀 Calls out bad behaviour
When a tool reaches for something it shouldn't, you hear about it:

```
oh really? t3code tried to read ~/.claude.json, denied
```

### 🛠️ Everyday work just works
- **Git:** commit, branch and diff as usual. Pushing can be allowed *without* handing over your SSH key.
- **Packages:** `npm i -g`, `pip install` and friends work. They install into a private space for that tool, so your real setup is never touched.
- **Everything it starts** (shells, scripts, sub-agents) follows the same rules automatically.

### 🚨 Break glass when you need it
Sometimes you just want the tool to go wild. That's your call, and only yours. A tool can never lift its own restrictions.

```bash
oh-really --net open claude          # allow full internet
oh-really --rw ../other-repo claude  # allow one extra folder
oh-really --yolo claude              # all guards down
```

---

## Promises

oh-really is a **convenience, not a cage**. It never takes anything away from you.

| | |
|---|---|
| **Never locks your files** | Restrictions vanish the moment the tool exits. Uninstall any time and nothing needs undoing. |
| **Never limits you** | Your terminal, editor and a plain `claude` run exactly as before. Only what you launch through oh-really is restricted. |
| **Never needs admin** | Everyday use requires no root, sudo or administrator rights. |
| **Never phones home** | No telemetry, no accounts, no analytics. Ironically, that's the whole point. |
| **Never guesses** | Before each run it checks that your system really supports every protection it promises. If something's missing, it tells you instead of pretending. |

---

## Commands

| Command | What it does |
|---|---|
| `oh-really <tool>` | Run a tool, confined to the current folder |
| `oh-really explain <tool>` | Show in plain words what that tool may do |
| `oh-really log <tool>` | See what it accessed and what got blocked |
| `oh-really doctor` | Check that your system is fully supported |
| `oh-really shim install <tool>` | *Optional:* make plain `<tool>` always go through oh-really |
| `oh-really cleanup` | Remove every trace oh-really has left behind |

Popular tools (Claude, Codex, Gemini, Aider and more) come with ready-made settings. Unknown tools get the strictest settings by default: current folder only, no internet.

```
$ oh-really doctor
  ✓ Windows 10 22H2, supported
  ✓ project drive is NTFS
  ✓ folder isolation working
  ✓ network filtering working
```

---

## Configuration

You don't need to configure anything, but if you want to, settings live in simple TOML files.

- **Per tool:** `~/.config/oh-really/profiles/<tool>.toml` changes how that tool runs everywhere.
- **Per project:** `.oh-really.toml` in a project folder applies only there. It can only *tighten* the rules, never loosen them, so a downloaded repo can't grant itself extra access.

```toml
# ~/.config/oh-really/profiles/claude.toml

[files]
read_write = ["./"]                 # the current folder (always allowed)
read_only  = ["~/.gitconfig"]       # extra files it may read
hidden     = ["./.env"]             # keep these out of reach, even inside the folder

[network]
allow = ["api.anthropic.com", "github.com"]   # everything else is blocked

[git]
push = false                        # it can commit; you push
```

Run `oh-really explain claude` anytime to see the final rules in plain words.

---

## FAQ

**Will it break my project if I stop using it?**
No. Nothing about your folder changes. Stop using oh-really and everything is exactly as it was.

**Does it slow tools down?**
Startup takes a moment longer. After that, the tool runs at normal speed.

**Can a tool detect it and get around it?**
A tool can notice it's restricted, but it can't turn the restrictions off. They're enforced by your operating system, not by oh-really itself.

**Does it stop a tool from misusing its *own* login?**
Partly. A tool still has its own credentials (it needs them to work), but the network allowlist stops it from sending data anywhere you haven't approved.

**Do I need to configure anything?**
No. Sensible defaults ship for popular tools. You can tweak them per tool or per project if you want.

---

## Contributing

Ideas, bug reports and new tool profiles are welcome. Open an issue or a pull request.

## License

[Apache-2.0](LICENSE)
