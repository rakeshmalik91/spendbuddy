# Activity History Architecture

## Overview

The **Activity History** system provides a complete audit trail of user actions within SpendBuddy. It tracks transaction additions, edits, deletions, restores, imports, and split operations—enabling users to review changes and recover from mistakes.

---

## Data Model

### Activity Item (in `state.activityHistory`)

Stored as an array in memory, persisted to `activity_history.json` in Firebase Storage.

```javascript
{
  id: "1704067200000-abc123",           // Unique: timestamp + random suffix
  timestamp: "2024-01-01T12:00:00.000Z", // ISO 8601 UTC
  action: "added" | "edited" | "deleted" | "restored" | "imported" | "split_created" | "split_edited",
  type: "txn" | "schedule" | "balance" | "settings",
  source: "manual" | "csv" | "sms" | "email" | "split" | "schedule",
  targetId: "txn-123" | "schedule-456",  // Original entity identifier
  title: "Groceries",                     // Human-readable summary
  date: "2024-01-01",                     // Transaction date (if applicable)
  amount: 500.00,                         // Transaction amount (if applicable)
  changes: [                              // For "edited" actions only
    { field: "amount", from: 400, to: 500 },
    { field: "note", from: "Old note", to: "New note" }
  ],
  restored: false,                        // Whether this deleted item has been restored
  snapshot: { ... }                       // Full entity copy (only for "deleted" actions)
}
```

### Field Details

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Globally unique; used for restore targeting |
| `timestamp` | Yes | Sort key (newest first in UI) |
| `action` | Yes | Verb describing what happened |
| `type` | Yes | Entity category |
| `source` | Yes | Input origin (helps filter) |
| `targetId` | No | Links to original entity; format varies by type |
| `title` | No | Display name (category, note, or "Transaction") |
| `date` | No | Transaction date for sorting/filtering |
| `amount` | No | Numeric amount for display |
| `changes` | Only for `edited` | Array of `{field, from, to}` for changed fields |
| `restored` | Yes | Prevents double-restore |
| `snapshot` | Only for `deleted` | Deep copy of entity at deletion time |

---

## State Management

### `state.activityHistory` (in `js/core/state.js`)

```javascript
activityHistory: [],      // Array of activity items (newest first)
activityLoaded: false     // Whether initial load completed
```

### Loading (`loadActivityHistory` in `js/services/activity.js`)

```javascript
async function loadActivityHistory(force = false) {
  if (state.activityLoaded && !force) return state.activityHistory || [];
  
  const content = await getCsvContent('activity_history.json', force);
  if (!content) return [];
  
  const data = JSON.parse(content);
  // Support both array and { activities: [...] } formats
  const history = Array.isArray(data) ? data : (Array.isArray(data.activities) ? data.activities : []);
  
  state.activityHistory = history;
  state.activityLoaded = true;
  return history;
}
```

- **Lazy load**: Only fetches on first access or explicit `force: true`
- **Timeout**: 12-second request timeout with `Promise.race`
- **Cache**: Results cached in `state.activityHistory`
- **Limit**: In-memory array capped at 2000 entries (oldest dropped on new insert)

### Saving (`saveActivityHistory` in `js/services/activity.js`)

```javascript
async function saveActivityHistory() {
  await uploadFile(
    ref(state.storage, `${getRequiredEmail()}/activity_history.json`),
    JSON.stringify(state.activityHistory || [], null, 2)
  );
}
```

- Writes entire array as pretty-printed JSON
- Called after every mutation (add, restore, etc.)
- Uses Firebase Storage with user-scoped path

---

## Recording Activities

### `recordActivity` (in `js/services/activity.js`)

```javascript
export async function recordActivity({
  action,           // required
  type = "txn",     // default
  source = "manual",// default
  id,               // targetId
  txn,              // source transaction object
  changes = {}      // for edits
}) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    timestamp: new Date().toISOString(),
    action,
    type,
    source,
    targetId: id || txn?.txnId || txn?.id || (txn ? `${txn.date||txn.start_date||""}|${txn.amount??""}|${txn.note||""}` : ""),
    title: txn?.note || txn?.category || "Transaction",
    date: txn?.date || txn?.start_date || "",
    amount: txn?.amount ?? null,
    changes: Object.entries(changes)
      .filter(([f]) => ["amount", "note", "date"].includes(f))
      .map(([field, v]) => ({ field, from: v.from, to: v.to })),
    restored: false,
    snapshot: (action === "deleted" ? JSON.parse(JSON.stringify(txn || {})) : undefined)
  };
  
  state.activityHistory = state.activityHistory || [];
  state.activityHistory.unshift(item);  // Newest first
  state.activityHistory = state.activityHistory.slice(0, 2000);  // Cap
  await saveActivityHistory();
  return item;
}
```

### Action Types by Source

| Action | Type | Source | When |
|--------|------|--------|------|
| `added` | `txn` | `manual` | User adds transaction via form |
| `added` | `txn` | `csv` | CSV import |
| `added` | `txn` | `sms` | SMS extraction |
| `added` | `txn` | `email` | Email extraction |
| `added` | `txn` | `split` | Split tool create |
| `edited` | `txn` | `manual` | User edits transaction |
| `edited` | `txn` | `split` | Split tool edit |
| `deleted` | `txn` | `manual` | User deletes transaction |
| `deleted` | `schedule` | `schedule` | User deletes scheduled transaction |
| `restored` | `txn` | `manual` | User restores from trash |
| `restored` | `schedule` | `schedule` | User restores scheduled transaction |
| `imported` | `txn` | `csv` | Bulk CSV import |
| `split_created` | `txn` | `split` | Split transaction created |
| `split_edited` | `txn` | `split` | Split transaction edited |

### Change Tracking (Edits Only)

Only three fields are tracked for changes:
- `amount`
- `note`
- `date` (or `start_date` for scheduled)

Other field changes (category, payment mode, etc.) are not recorded in `changes` array but the `edited` action is still logged.

---

## UI: Activity History View

### Navigation

- Nav button: `data-view="activity"` (icon: 📋)
- View ID: `#view-activity`
- Rendered by `renderActivityHistory()` in `js/ui/activity.js`

### Layout

```
┌─────────────────────────────────────────────────────┐
│ Activity History                    [Clear All]     │
├─────────────────────────────────────────────────────┤
│ 🔍 Search: [________________________]  [Filter ▼]  │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ 2024-01-15 14:32  Added    Groceries      ₹500  │ │
│ │         ↳ Restore (if deleted)                  │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ 2024-01-15 14:30  Edited   amount: 400→500      │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ 2024-01-14 09:15  Deleted  Dinner         ₹800  │ │
│ │         ↳ [Restore] button                      │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Features

1. **Search**: Filters by title, category, note, amount (client-side)
2. **Filter**: By action type (Added, Edited, Deleted, Restored, Imported, Split)
3. **Expandable Rows**: Click row to show `changes` array for edits
4. **Restore Button**: Shows for `deleted` actions where `restored: false`
5. **Pagination**: Loads all (max 2000); virtual scrolling not needed

### Restore Flow

1. User clicks "Restore" on a deleted activity row
2. `restoreTrashedTransaction(activityId)` called
3. Looks up activity by `id`
4. If `type === "schedule"`: Restores to `state.scheduledTransactions`
5. If `type === "txn"`: Finds matching item in `state.trash` by `targetId`
6. Moves item from trash → expenses, marks `deleted: false`
7. Marks activity `restored: true`
8. Records new `restored` activity
9. Re-renders activity history

---

## Trash Integration

Activity History is the **primary interface for trash recovery**:

- Deleted transactions → `action: "deleted"` + `snapshot` + `restored: false`
- Trash storage (`state.trash`) is internal; Activity History is user-facing
- Restore uses `targetId` to locate item in `state.trash`
- Scheduled transactions use `snapshot.id` for restore (not in trash)

---

## CSV Import Activity

Bulk imports record a single `imported` activity with:
- `title`: "CSV Import"
- `amount`: Total imported amount
- `changes`: Empty
- `snapshot`: Undefined

Individual imported transactions are **not** logged separately (performance).

---

## Persistence Format

### Firebase Storage Path

```
{userEmail}/activity_history.json
```

### JSON Structure

```json
[
  {
    "id": "1704067200000-abc123",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "action": "added",
    "type": "txn",
    "source": "manual",
    "targetId": "txn-123",
    "title": "Groceries",
    "date": "2024-01-01",
    "amount": 500,
    "changes": [],
    "restored": false
  }
]
```

- Pretty-printed (2-space indent) for readability
- No encryption (activity history is not sensitive)
- Overwritten entirely on each save

---

## Limits & Performance

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max entries | 2000 | Prevents unbounded memory/storage growth |
| Request timeout | 12 sec | Firebase Storage latency buffer |
| Load frequency | Once per session + manual refresh | Lazy load pattern |

---

## File References

| File | Purpose |
|------|---------|
| `js/services/activity.js` | Core service: load, save, record, restore |
| `js/ui/activity.js` | View rendering, search, filter, restore handlers |
| `js/core/state.js` | `state.activityHistory`, `state.activityLoaded` |
| `js/services/storage.js` | `getCsvContent`, `uploadFile` for persistence |
| `index.html` | Activity view HTML (`#view-activity`) |
| `styles/responsive.css` | Activity table styles, expandable rows |
| `js/ui/navigation.js` | Nav button registration |

---

## Future Enhancements

1. **Export**: Download activity history as CSV/JSON
2. **Bulk Restore**: Select multiple deleted items
3. **Retention Policy**: Auto-archive older than N days
4. **Detailed Diff**: Show full field diff for edits
5. **Sync Indicator**: Show pending cloud sync status