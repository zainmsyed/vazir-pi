# Vazir — Quickstart Guide

Vazir is a set of extensions, skills, and workspace conventions that add persistent context, story-driven workflows, and change tracking to your coding agent.

## Prerequisites

Vazir is a set of extensions for **pi-coding-agent**, which is distributed as an npm package. You need Node.js **22.19 or newer** (including npm) installed first.

**Recommended:** install Node.js **v22.23.1**, which is the verified working version.

### Install Node.js

**macOS (Homebrew)**
```bash
brew install node@22
# Then link v22.23.1 if Homebrew installs a newer release.
# Check with:
node --version
```

**Linux (NodeSource)**
```bash
# Debian / Ubuntu
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Fedora / RHEL
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs

# Then verify:
node --version
```

**Windows (winget)**
```powershell
winget install OpenJS.NodeJS --version 22.23.1
node --version
```

**Any OS (nvm)**
```bash
# Install nvm first: https://github.com/nvm-sh/nvm#installing-and-updating
nvm install 22.23.1
nvm use 22.23.1
nvm alias default 22.23.1
node --version
```

Verify installation:
```bash
node --version   # should be v22.23.1 (or newer v22.x)
npm --version
```

## Install Vazir

### macOS / Linux / Windows

**Step 1 — Install pi:**
```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

`--ignore-scripts` disables dependency lifecycle scripts during install; pi does not require them for normal npm installs. See the official docs at https://pi.dev/docs/latest.

> **Windows:** pi uses Git Bash by default. Install [Git for Windows](https://git-scm.com/download/win) if you do not already have it.

**Step 2 — Install Vazir:**
```bash
pi install git:github.com/zainmsyed/vazir-pi
```

Verify Vazir is installed:
```bash
pi list
# Should include: git:github.com/zainmsyed/vazir-pi
```

> **Tip:** If the skill loads but `/vazir-init` is missing, close pi, rerun `pi install`, and start a new pi session. Check `pi list` includes `git:github.com/zainmsyed/vazir-pi`. If your shell resolves `pi` to a different executable, put the npm global `bin` directory first in `PATH`.

Then, in any project where you want to use Vazir, start pi and initialize the local brain **inside pi**:

```bash
cd /path/to/your/project
pi
```

```text
/vazir-init
```

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

### 3. Complete the story

```
/complete-story
```

Validates the story checklist and issues, checks completion readiness, and optionally runs a story-scoped review before closing. After review, you can fix recommended items or close with remaining items noted.

## Common Next Steps

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
| `/vazir-init` | Bootstrap `.context` and seed the project brain |
| `/plan [topic]` | Review intake, ask delta questions, and generate stories |
| `/story [file]` | Pick a plan or story file and open it in a scrollable view |
| `/implement` | Implement the active in-progress story |
| `/fix <description>` | Log an issue to the active story, then attempt a fix |
| `/idea [description]` | Capture or browse ideas without interrupting the active story |
| `/complete-story` | Check readiness, optionally review, and close a story |
| `/review [scope]` | Write a review file and sync recurring rule candidates |
| `/remember [rule]` | Promote a reusable lesson into persistent memory |
| `/memory-review` | Archive cold context, flag stale rules, and review delete candidates |
| `/unlearn` | Remove a promoted rule from system memory |
| `/consolidate` | Cluster complaints and promote repeated rule candidates |
| `/design [instruction]` | Review and edit design system, brand, components |
| `/vcs-settings [mode]` | Pick or set the preferred VCS mode (auto, git, jj, fossil) |
| `/diff [file]` | Show the diff for one changed file |
| `/edits` | Show the recent file edit stream |
| `/checkpoint` | Pick a checkpoint to restore |
| `/reset` | Alias for `/checkpoint` |

Press **Ctrl+?** in pi for an interactive, searchable command list with full usage details plus a built-in Vazir quickstart and `.context/` guide.

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
