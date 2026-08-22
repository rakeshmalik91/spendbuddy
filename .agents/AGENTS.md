# Agent Guidelines

## Critical Rules
- **Do not execute any Git commands** (e.g., `git commit`, `git push`, `git stash`, etc.) unless explicitly instructed to do so by the user.
  - If asked to commit, keep the commit messages small, consise, one-liner.
- **Frontend Verification**: Any frontend changes must be verified for workability on:
  - Desktop browsers
  - Android app (located in the [expenseiq-android-app](file:///./expenseiq-android-app/) folder)
  - Mobile browsers
  - Collapsible/split-screen browsers for iPad
- **Cache Bursting**: Perform cache bursting after making any frontend changes to ensure clients load the updated assets.
- **SMS & Email Analysis**: Any changes to SMS and Email analysis code must add new test cases and verify existing ones to prevent regressions.
- **Code Comments**: Always add comments to explain any complex logic.
- **Test Account for Testing**: `freespirit.2016.app@gmail.com` / `Test123*`
- **Testing Fragile Code**: Always write and maintain unit tests for code that is prone to break (e.g. data parsing, category mapping, currency formatting, etc) to prevent regressions.
- **No Browser Automation**: Do not run any browser automation / browser subagents unless explicitly instructed to do so by the user.
- **CSS Modularity & Review**: Always place CSS rules in their respective component/layout stylesheets. Review for and clean up any misplaced or ad-hoc CSS definitions after completing large tasks to ensure modularity is maintained.

