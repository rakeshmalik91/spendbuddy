---
name: txn-table-ui-knowledge
description: Core documentation, layout rules, CSS grid/flex architecture, and multi-device verification guidelines for the Transaction Table UI across desktop, mobile, Android, and split-screen views.
---

# Transaction Table UI Architecture & Layout Guidelines

## Overview
The Transaction Table UI renders all transaction lists (Recent Transactions on Dashboard, All Transactions, Selected Day Transactions, and Scheduled Transactions). To deliver a seamless user experience, the component uses a **dual-layout responsive strategy**:
1. **Desktop View (`> 860px`)**: Traditional HTML data table (`display: table-row`) with auto layout and cell truncation constraints.
2. **Mobile View (`<= 860px`)**: Compact card view using CSS Grid (`display: grid`) with 3-line grid template areas.

---

## 1. Desktop Layout Specifications (`> 860px`)

### 1.1 Column Alignment & Boundary Constraints
| Column | `data-label` | CSS Target | Target Width / Constraint | Text Alignment | Truncation / Overflow |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Date & Location** | `Date & Location` | `td[data-label="Date"]` | `width: 190px` (Dashboard: `115px`) | Left | `ellipsis` |
| **Category** | `Category` | `td[data-label="Category"]` | `width: 135px` | Left | `ellipsis` |
| **Note & Badges** | `Note` | `td[data-label="Note"]` | `width: auto` | Left | `white-space: normal`, `word-break: break-word` |
| **Mode (Badge on Desktop)** | `Mode` / `Txn Mode` | `.badge-mode` inside `.badges-wrapper` | `.badge-mode` (Desktop: in Note cell; `td[data-label="Mode"]` hidden on desktop) | Left | `white-space: nowrap` |
| **Amount** | `Amount` | `td[data-label="Amount"]` | `width: auto` (dynamic) | Right | `white-space: nowrap` |
| **Actions** | `Actions` | `td[data-label="Actions"]` | `width: 60px` (`padding-right: 16px`) | Right | `white-space: nowrap` |

*Note: The `Actions` heading text has been removed from table `<th>` headers (`<th class="col-actions" data-col="actions"></th>`) for a clean appearance above the `⋮` action dropdown buttons.*

### 1.2 Note Content & Badges Flexbox Alignment
- **Container**: `.note-content` (`display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; width: 100%;`).
- **Desktop Mode Badge**: On desktop (`> 860px`), `txnMode` is rendered as a badge (`.badge-mode`) inside `.badges-wrapper` in the `Note` column, and the separate `Mode` column (`th.col-mode`, `td[data-label="Mode"]`) is hidden (`display: none !important`).
- **Desktop Badge Alignment**: On desktop (`min-width: 768px`), `.note-content` uses `justify-content: flex-start;` and `.badges-wrapper` uses `margin-left: 0; justify-content: flex-start;` so badges stay left-aligned immediately beside the note text.
- **Empty Note Handling**: When a transaction has no note text, the template renders `<span class="empty-dash"></span>`. To prevent flexbox `gap` from introducing an unwanted leading gap before badges, `.note-content > span:empty` and `.note-content > span.empty-dash` MUST have `display: none !important;`.

### 1.3 Amount & Expression Vertical Alignment Guidelines
- **Structured Amount Layout**: Amounts use structured HTML elements (`<span class="amount-main"><span class="amount-sign"></span><span class="amount-symbol">₹</span><span class="amount-val"></span></span>`) with `font-variant-numeric: tabular-nums`.
- **Fixed-Width Sign Slot**: `.amount-sign` has `width: 0.85em` and `text-align: right`, displaying `+`, `-`, or `&nbsp;` placeholder. This ensures `₹` symbols and digits line up 100% vertically across positive amounts, negative amounts, refunds, expenses, month totals, and day totals.
- **Dashboard Table Padding Alignment**: On Dashboard (`#recent-table`), `padding-right: 28px !important` is applied identically across `th.col-amount`, `td[data-label="Amount"]`, `.month-header-total`, and `.day-separator-total` so month header net totals and row amounts align to the exact same right boundary.

### 1.4 Actions Dropdown Menu & Smart Drop-Up Architecture
- **Single Action Button**: Table row actions render a single `⋮` button (`.action-dropdown-wrap`, `.action-dropdown-btn`) that opens a floating popup menu (`.action-dropdown-menu`).
- **Subrow Unique Keying**: In collapsible refund subrows, dropdown IDs MUST be uniquely keyed with `sub-${prefix}-${realIdx}-${itemIdx}` (`action-dropdown-sub-${prefix}-${realIdx}-${itemIdx}`) to avoid DOM ID collisions when multiple parent rows link to the same original expense/refund.
- **Smart Drop-Up Overflow Handling**: `window.toggleActionDropdown` measures available space below the button relative to viewport height and scroll container bounds (`.table-wrap`, `.card`, `.refund-collapsible-container`). If space below is insufficient (< menu height + 12px), it dynamically adds `.drop-up` (`bottom: calc(100% + 4px); top: auto;`), opening the menu upwards without container clipping.

---

## 2. Mobile Layout Specifications (`<= 860px`)

### 2.1 CSS Grid Card Template
In `@media (max-width: 860px)`, table rows (`tr:not(.month-header):not(.day-separator)`) transform into CSS Grid cards:

- **Tables with Actions (`#all-table`, `#selected-day-tbody`, `#scheduled-table`)**:
```css
display: grid;
grid-template-areas:
    "category amount actions"
    "meta-left meta-right actions"
    "note note actions";
grid-template-columns: 1fr auto 28px;
gap: 2px 10px;
```

- **Dashboard Recent Transactions (`#recent-table`)**:
Since action buttons are hidden on mobile on the dashboard, `#recent-table` eliminates the 28px action column and right-side gap:
```css
display: grid;
grid-template-areas:
    "category amount"
    "meta-left meta-right"
    "note note";
grid-template-columns: 1fr auto;
gap: 2px 10px;
```
Month headers and day separators on `#recent-table` similarly use `grid-template-columns: 1fr auto !important;` with their dummy trailing empty cells hidden (`display: none !important;`).

### 2.2 Grid Area Assignment
- **Line 1 (`category amount [actions]`)**:
  - `Category`: `grid-area: category`, `font-weight: 600`, `ellipsis`.
  - `Amount`: `grid-area: amount`, `font-size: 1.05rem`, `font-weight: 700`, `justify-end`.
  - `Actions`: `grid-area: actions`, `align-self: start`, `justify-end` (hidden on `#recent-table`).
- **Line 2 (`meta-left meta-right [actions]`)**:
  - `Date` / `Next Run` (Left): `grid-area: meta-left`, `justify-self: start`, `font-size: 0.8rem`, `color: var(--text-muted)` (consistent date placement across all transaction tables).
  - `Mode` / `Freq` (Right): `grid-area: meta-right`, `justify-self: end`, `text-align: right` (`color: var(--accent)` for Freq).
  - **Mode Truncation Reset**: On mobile cards, `.mode-cell` overrides desktop trimming with `max-width: none !important; overflow: visible !important; margin-left: auto !important;` to display full mode names.
- **Line 3 (`note note [actions]`)**:
  - `Note`: `grid-area: note`, `align-self: start`.
  - **Mobile Badge Alignment**: On mobile (`< 768px`), `.note-content` uses `justify-content: space-between;` and `.badges-wrapper` uses `margin-left: auto; justify-content: flex-end;` to align badges to the right edge of the card.
  - **Empty Note Hiding**: If both note text and badges are absent, `td.empty-note` has `display: none !important;` so Line 3 collapses cleanly.

---

## 3. Multi-Device Verification Matrix

Any changes to table styles (`webapp/css/components/tables.css`, `webapp/css/layout/responsive.css`) or row rendering JS (`webapp/js/ui/transactions.js`, `webapp/js/ui/dashboard.js`, `webapp/js/ui/chart_builders.js`, `webapp/js/utils/refund_helpers.js`) **MUST** be verified on:

1. **Desktop Browsers**:
   - Verify table column alignment, no horizontal scrollbars on standard displays, left-aligned badges, and proper `Mode` cell ellipsis.
2. **Android App (`expenseiq-android-app`)**:
   - Verify mobile card grid layout in WebView, tap responsiveness for action buttons, right-aligned badges, and mode display.
3. **Mobile Browsers (iOS Safari / Android Chrome)**:
   - Verify touch scrolling, card gaps, and zero overflow on narrow screens (320px–420px).
4. **Collapsible / Split-Screen iPad View (600px – 860px)**:
   - Verify smooth breakpoint transition between desktop table and mobile grid cards without double wrapping or text collision.

---

## 4. Maintenance & Refactoring Rules

1. **Synchronized Markup Across Views**:
   - Always keep HTML structure identical across `transactions.js`, `dashboard.js`, and `chart_builders.js`:
     ```html
     <td data-label="Category">${escHtml(cat)}</td>
     <td data-label="Note" class="${!note && !badges ? 'empty-note' : ''}">
         <div class="note-content">
             <span class="${!note ? 'empty-dash' : ''}">${note ? escHtml(note) : ''}</span>
             ${badges ? `<div class="badges-wrapper">${badges}</div>` : ''}
         </div>
     </td>
     <td data-label="Mode"><span class="mode-cell">${escHtml(mode)}</span></td>
     ```
2. **Cache Bursting Mandatory**:
   - Whenever table CSS or JS is edited, increment the version parameters in `webapp/index.html` (`tables.css?v=N`, `responsive.css?v=N`, `app.js?v=N`).
