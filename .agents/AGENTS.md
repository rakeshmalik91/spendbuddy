# Agent Guidelines

## Critical Rules
- **Do not execute any Git commands** (e.g., `git commit`, `git push`, `git stash`, etc.) unless explicitly instructed to do so by the user.
  - If asked to commit, follow the [commit-push](file:///./.agents/skills/commit-push/SKILL.md) skill: keep commit messages small, concise, one-liner with standard prefix (e.g. `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `style:`, `chore:`).
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

## Architecture & Knowledge Index
Before modifying existing subsystems or troubleshooting regressions, consult the canonical guides in `docs/architecture/`:
| Subsystem / Topic | Canonical Guide | Key Invariants to Maintain |
| :--- | :--- | :--- |
| **Touch Viewports & Forms** | [virtual-keyboard-viewport.md](file:///d:/Projects/expense-manager/docs/architecture/virtual-keyboard-viewport.md) | Maintain `.form-bottom-spacer`, `scroll-margin-top: 130px`, `positionFocusedInput()` safe-top placement, and `visualViewport` resize blur guardian. |
| **Transaction Table & Cards** | [txn-table-ui.md](file:///d:/Projects/expense-manager/docs/architecture/txn-table-ui.md) | Maintain dual-layout (table `> 860px`, grid card `<= 860px`), structured tabular amounts, and subrow unique keying. |
| **Refund Merging & Linking** | [refund-linking.md](file:///d:/Projects/expense-manager/docs/architecture/refund-linking.md) | Preserve pipe-separated `txnId`, 7-day candidate heuristic, individual vs bulk deletion semantics, and multi-year CSV saving. |
| **Balance & Net Worth** | [balance-tracker.md](file:///d:/Projects/expense-manager/docs/architecture/balance-tracker.md) | Preserve frozen column widths/offsets, carry-forward logic, and dual-stack (`stack: pos/neg`) area chart. |
| **Amount Math Expressions** | [expression-as-amount.md](file:///d:/Projects/expense-manager/docs/architecture/expression-as-amount.md) | Preserve `evaluateExpression()` syntax, regex validation, and CSV `expression` column persistence. |
| **Google Drive Periodic Backup** | [google-drive-backup.md](file:///d:/Projects/expense-manager/docs/architecture/google-drive-backup.md) | Preserve launch-time non-blocking trigger, GIS Web OAuth, retention cleanup preserving 3 latest backups. |
| **Custom Keyword Mappings** | [keyword-mappings.md](file:///d:/Projects/expense-manager/docs/architecture/keyword-mappings.md) | Preserve Priority-0 override engine, emoji stripping on save, entity CRUD synchronization, and batch rule execution. |
| **Login, Auth & Offline Caching** | [login-and-caching.md](file:///d:/Projects/expense-manager/docs/architecture/login-and-caching.md) | Preserve zero-wait optimistic login, client-side AES-GCM encryption, IndexedDB caching, and Android WebView ETag revalidation. |
| **SMS & Email Inbox Analysis** | [sms-email-analysis.md](file:///d:/Projects/expense-manager/docs/architecture/sms-email-analysis.md) | Preserve ML Kit NLP parsing, promotional discount exclusions, fuzzy deduplication, and cross-source enrichment. |

