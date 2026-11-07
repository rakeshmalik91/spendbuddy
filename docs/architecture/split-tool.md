# Split Tool Architecture

## Overview

The **Split Tool** enables users to divide a single transaction among multiple participants, tracking who paid, who owes what, and settlement status. It is designed for shared expenses like group dinners, trips, or household bills.

---

## Data Model

### Split Transaction (in `state.expenses`)

A split transaction is stored as a regular expense row with additional metadata:

| Field | Type | Description |
|-------|------|-------------|
| `split` | `boolean` | `true` marks this row as a split transaction |
| `split_id` | `string` | Unique identifier linking all participants of this split (format: `split-{timestamp}-{random}`) |
| `split_role` | `string` | `"payer"` or `"participant"` |
| `split_paid` | `boolean` | For participants: whether this person has settled their share |
| `split_share` | `number` | The participant's share amount (for payer, this is the total) |
| `split_participants` | `string` | JSON array of participant objects (stored only on payer row) |

### Participant Object (in `split_participants`)

```json
{
  "name": "Alice",
  "share": 500,
  "paid": false,
  "isCurrentUser": true
}
```

- `name`: Participant display name
- `share`: Amount this participant owes
- `paid`: Settlement status
- `isCurrentUser`: Whether this participant is the logged-in user (used for "My Share" highlighting)

---

## State Management

### `state.splitTool` (in `js/core/state.js`)

```javascript
splitTool: {
  isOpen: false,           // Modal visibility
  mode: 'create',          // 'create' | 'edit'
  editingIndex: null,      // Index in state.expenses of payer row being edited
  participants: [],        // Array of participant objects (UI state)
  formData: {              // Base transaction fields
    date: '',
    category: '',
    note: '',
    amount: '',
    paymentMode: 'UPI',
    type: 'expense',
    location: '',
    tag: ''
  }
}
```

### In-Memory Participants Array

While the modal is open, participants are managed in `state.splitTool.participants`. Each entry:

```javascript
{
  name: string,
  share: number,
  paid: boolean,
  isCurrentUser: boolean
}
```

On save, this array is serialized to JSON and stored on the payer row's `split_participants` field.

---

## UI Flow

### 1. Opening the Split Tool

- **Create**: User clicks "Split Expense" button (nav item `data-view="split"`) → `SplitTool.openCreate()`
- **Edit**: User clicks edit icon on a split transaction row → `SplitTool.openEdit(index)`

### 2. Participant Management

- **Add Participant**: Click "+" button → adds empty row with `isCurrentUser: false`
- **Remove Participant**: Click trash icon → removes row (minimum 1 participant enforced)
- **Current User**: Exactly one participant can have `isCurrentUser: true` (radio button)
- **Share Editing**: Numeric input per participant; total must equal transaction amount
- **Paid Toggle**: Checkbox per participant; payer row is always `paid: true`

### 3. Validation Rules

| Rule | Enforcement |
|------|-------------|
| At least 1 participant | Disable save if `participants.length === 0` |
| Exactly 1 current user | Radio group ensures single selection |
| Shares sum to total | Real-time sum display; save blocked if mismatch |
| Shares ≥ 0 | Input `min="0"` |
| Payer always paid | Payer row `paid` forced `true`, checkbox disabled |

### 4. Save / Update

**Create** (`SplitTool.save()`):
1. Validate form + participants
2. Generate `split_id = `split-${Date.now()}-${random}`
3. Create **payer row** with:
   - `split: true`, `split_role: 'payer'`, `split_paid: true`
   - `split_share: totalAmount`
   - `split_participants: JSON.stringify(participants)`
4. Create **participant rows** (one per non-payer participant):
   - `split: true`, `split_role: 'participant'`, `split_id: <same>`
   - `split_share: participant.share`
   - `split_paid: participant.paid`
   - Other fields copied from payer (date, category, note, etc.)
5. Insert all rows at top of `state.expenses`
6. Save current year CSV
7. Record activity (`action: "added", type: "txn"`)
8. Close modal, `renderAll()`

**Edit** (`SplitTool.save()` with `mode === 'edit'`):
1. Validate
2. Find all rows with matching `split_id` (payer + participants)
3. Update payer row fields + `split_participants`
4. For each existing participant row: update `split_share`, `split_paid`
5. Add new participant rows for any new participants
6. Remove participant rows for deleted participants
7. Save CSV, record activity (`action: "edited"`), close modal, `renderAll()`

---

## Rendering

### Transaction Table (`js/ui/table.js`)

- **Payer row**: Rendered normally with a "👥 Split" badge
- **Participant rows**: Hidden by default; shown when payer row is expanded (click chevron)
- **Expansion**: Clicking the payer row toggles `data-split-expanded` attribute
- **Participant display**: Shows name, share (₹), paid status (✓/✗), and "Me" badge for current user

### Mobile Cards (`js/ui/table.js` → `renderMobileCards`)

- Payer card shows split badge and participant count
- Tapping card expands to show participant list inline
- Paid status shown with green/red indicator

### Pivot Grid (`js/ui/pivot.js`)

- Split transactions included in totals
- Participant rows filtered out (only payer row counted) to avoid double-counting
- `split_role === 'payer'` used as filter

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` in participant name | Add new participant |
| `Escape` | Close modal (if no unsaved changes) |
| `Tab` / `Shift+Tab` | Navigate between inputs |

---

## Activity History Integration

Every split create/edit/delete records an activity:

```javascript
await recordActivity({
  action: "added" | "edited" | "deleted",
  type: "txn",
  source: "split",
  txn: payerRow  // includes split_id, split_participants
});
```

Restoring a deleted split transaction from trash restores all participant rows.

---

## CSV Persistence

Split fields are serialized to CSV columns:

| CSV Column | Source |
|------------|--------|
| `Split` | `split` (true/false) |
| `Split ID` | `split_id` |
| `Split Role` | `split_role` |
| `Split Paid` | `split_paid` |
| `Split Share` | `split_share` |
| `Split Participants` | `split_participants` (JSON string) |

On load (`normalizeRow` in `storage.js`), these are parsed back into the row object.

---

## Edge Cases Handled

1. **Editing participant count**: Adding/removing participants on edit correctly creates/deletes rows
2. **Current user change**: Moving "Me" badge updates `isCurrentUser` on all rows
3. **Partial payment**: Participants can be marked paid independently
4. **Split deletion**: Deleting payer row soft-deletes all participant rows (trash)
5. **Year boundary**: Split rows saved to current year CSV; historical loads include them
6. **Concurrent edits**: Last-write-wins (no locking; single-user app)

---

## File References

| File | Purpose |
|------|---------|
| `js/ui/split_tool.js` | Main modal logic (open, save, validation, participant management) |
| `js/ui/table.js` | Table rendering (expansion, participant sub-rows) |
| `js/ui/pivot.js` | Pivot grid filtering (payer-only) |
| `js/core/state.js` | `state.splitTool` + `state.expenses` split rows |
| `js/services/storage.js` | CSV load/save with split fields |
| `js/services/activity.js` | Activity recording for split actions |
| `js/ui/navigation.js` | Nav button for split view |
| `index.html` | Split tool modal HTML structure |
| `styles/responsive.css` | Split tool modal & participant table styles |