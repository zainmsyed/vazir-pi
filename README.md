# Vazir — Quickstart Guide

Vazir is a set of extensions, skills, and workspace conventions that add persistent context, story-driven workflows, and change tracking to your coding agent.

## Prerequisites

Vazir is a set of extensions for **pi-coding-agent**, which is distributed as an npm package. You need Node.js **22.19 or newer** (including npm) installed first.

### Install Node.js

**macOS**
```bash
# Homebrew
brew install node

# Or download the LTS installer from https://nodejs.org/
```

**Linux**
```bash
# Debian / Ubuntu
sudo apt update && sudo apt install -y nodejs npm

# Fedora
sudo dnf install -y nodejs npm

# Or download the LTS installer from https://nodejs.org/
```

**Windows**
```powershell
# Download the LTS installer from https://nodejs.org/
# Or use winget
winget install OpenJS.NodeJS
```

Verify installation:
```bash
node --version
npm --version
```

## Install Vazir

### macOS / Linux

**One-line installer:**
```bash
curl -fsSL https://github.com/zainmsyed/vazir-pi/raw/main/install.sh | bash
```

**Or manually:**
```bash
npm install -g @earendil-works/pi-coding-agent
pi install git:github.com/zainmsyed/vazir-pi
```

### Windows

```powershell
npm install -g @earendil-works/pi-coding-agent
pi install git:github.com/zainmsyed/vazir-pi
```

> **Tip:** If you have Git Bash or WSL on Windows, the macOS/Linux curl one-liner works there too.

Then, in any project where you want to use Vazir, start pi and initialize the local brain **inside pi**:

```bash
cd /path/to/your/project
pi
```

```text
/vazir-init
```

If the skill loads but `/vazir-init` is missing, close pi, rerun the installer, and start a new pi session. Check `pi list` includes `git:github.com/zainmsyed/vazir-pi`. If the installer warns that your shell resolves `pi` to a different executable, put the reported npm global `bin` directory first in `PATH`.

## Quickstart Workflow

### 1. Plan your work

```
/plan
```

Vazir reads any intake briefs in `.context/intake/`, asks clarifying questions one at a time, and generates story files in `.context/stories/` plus a `plan.md` roadmap.

> **Tip:** If you do not see the `.context` folder in your file explorer, turn on **Show hidden files**. Folders that start with a dot are often hidden by default.
>
> **Tip:** Starting with a well-thought-out product requirements document (PRD) in `.context/intake/` gives the best results, but Vazir will walk you through planning even without one.

### 2. Implement a story

```
/implement
```

Starts implementation of the active in-progress story. If no story is active, Vazir offers to start the next open story or let you pick one from the queue.

### 3. Test the feature in a disposable workspace

```text
/test-sandbox test the new checkpoint restore behavior
```

Describe the behavior you want tested. The agent inspects the project, active story, relevant changes, and existing tooling, then decides whether workspace isolation is appropriate and builds a purpose-specific plan. Vazir shows every structured executable/argument array and requires explicit approval before anything runs. Afterward, the agent reports observed phase evidence, log excerpts, and any preserved failure workspace.

This is recommended before `/complete-story`, but it is opt-in and never a completion gate. You can also ask naturally, such as “test this feature in the sandbox,” and the agent can use the same tool.

> **Security boundary:** this provides disposable workspace isolation, not host security isolation. Test processes still run as your user and can access host files, processes, environment values, credentials, the network, and syscalls.

### 4. Complete the story

```
/complete-story
```

Validates the story checklist and issues, checks completion readiness, and optionally runs a story-scoped review before closing. After review, you can fix recommended items or close with remaining items noted.

## Common Next Steps

- **`/help`** — Open the same interactive help experience as Pi's `Ctrl+?` shortcut.
- **`/test-sandbox [request]`** — Ask the agent to design, preview, and run a purpose-specific test in a disposable workspace.
- **`/fix <description>`** — Log an issue to the active story and attempt a fix.
- **`/idea [description]`** — Capture or browse ideas without interrupting the active story.
- **`/review [scope]`** — Run a structured code review scoped to the active story or the whole codebase.
- **`/remember [rule]`** — Promote a reusable lesson into persistent memory (`.context/memory/system.md`).
- **`/memory-review`** — Archive cold stories and reviews, flag stale rules, and review delete candidates.
- **`/story [file]`** — Open a story or plan file in a scrollable overlay.
- **`/checkpoint`** — Pick a checkpoint to restore (or `/reset` as an alias).

## Command Reference

| Command | Description |
|---|---|
| `/help` | Open the same interactive help experience as Pi's `Ctrl+?` shortcut |
| `/vazir-init` | Bootstrap `.context` and seed the project brain |
| `/plan [topic]` | Review intake, ask delta questions, and generate stories |
| `/story [file]` | Pick a plan or story file and open it in a scrollable view |
| `/implement` | Implement the active in-progress story |
| `/test-sandbox [request]` | Ask the agent to preview and run a natural-language test in a disposable workspace |
| `/fix <description>` | Log an issue to the active story, then attempt a fix |
| `/idea [description]` | Capture or browse ideas without interrupting the active story |
| `/complete-story` | Check readiness, optionally review, and close a story |
| `/review [scope]` | Write a review file and sync recurring rule candidates |
| `/remember [rule]` | Promote a reusable lesson into persistent memory |
| `/memory-review` | Archive cold context, flag stale rules, and review delete candidates |
| `/unlearn` | Remove a promoted rule from system memory |
| `/consolidate` | Cluster complaints and promote repeated rule candidates |
| `/design [instruction]` | Review and edit design system, brand, components |
| `/vcs-settings [mode]` | Pick or set the preferred VCS mode (auto, git, fossil) |
| `/diff [file]` | Show the diff for one changed file |
| `/edits` | Show the recent file edit stream |
| `/checkpoint` | Pick a checkpoint to restore |
| `/reset` | Alias for `/checkpoint` |

Press **Ctrl+?** or enter **`/help`** in pi for the same interactive, searchable command list with full usage details plus a built-in Vazir quickstart and `.context/` guide.

## Project Layout

```
.context/          — Persistent project brain
  stories/         — Story files (plan.md + story-NNN.md)
  reviews/         — Structured per-review files
  memory/          — Learned rules and context maps
  settings/        — Project settings
  intake/          — product requirements documents (PRDs), briefs, and planning inputs
  ideas/           — captured ideas for later planning
```

If you do not see `.context/`, enable **Show hidden files** in your editor or file explorer.

## Working Rules

- Write directly to real project files.
- Keep `.context/` as the persistent project brain.
- Avoid introducing routers or external APIs — pi handles agent connections.

## Contributing

- Follow the existing code style and conventions.
- Use built-in write/edit tools when applicable.
- If unsure about which files to modify, ask before making changes.
