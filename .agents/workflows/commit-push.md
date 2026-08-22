# SpendBuddy - Commit and Push Workflow

Use this workflow to safely run tests, stage changes, commit with a concise conventional commit prefix, and push to the remote git repository.

## Commit Message Prefix Standards

Commit messages must be small, concise, one-liners formatted as:
`<type>: <description>`

Common prefixes:
- `feat:` — New user-facing feature or enhancement (e.g., `feat: show txn tags on dashboard`)
- `fix:` — Bug fix or regression fix (e.g., `fix: align row amounts on mobile`)
- `refactor:` — Code refactoring without behavioral changes (e.g., `refactor: extract helper functions`)
- `style:` — CSS, formatting, or layout tweaks (e.g., `style: adjust tag badge margin`)
- `test:` — Adding or updating test suites (e.g., `test: add unit tests for dashboard tags`)
- `docs:` — Documentation or architecture guides (e.g., `docs: update txn table guide`)
- `perf:` — Performance improvements (e.g., `perf: optimize query loading`)
- `chore:` — Build scripts, dependencies, or maintenance (e.g., `chore: bump cache busting versions`)

---

## Instructions for Agent

1. **Check Status**:
   Run `git status -s` and review modified/untracked files.
2. **Run Tests**:
   Run `npm test` (or `powershell -ExecutionPolicy Bypass -File .\run_all_tests.ps1`) to ensure all tests pass.
3. **Stage Changes**:
   Run `git add <files>` (or `git add -A`).
4. **Determine Prefix & Message**:
   Pick the appropriate prefix and construct a concise, imperative, one-liner message under 72 characters without a trailing period.
5. **Commit**:
   Run `git commit -m "<prefix>: <message>"`.
6. **Push**:
   Run `git push`.
7. **Confirm**:
   Run `git log -1 --oneline` and report the result to the user.
