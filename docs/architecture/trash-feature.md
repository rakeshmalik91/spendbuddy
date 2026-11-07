# Trash (Soft Delete) Architecture

## Overview

The **Trash Feature** implements soft deletion for transactions. Instead of permanently removing data, deleted transactions are moved to a `trash` array, preserved in CSV files with a `deleted: true` flag, and can be restored via the Activity History view.

---

## Data Model

### Trash Item (in `state.trash`)

```javascript
{
  // All original transaction fields...
  date: "2024-01-15",
  category: "Food",
  note: "Lunch",
  amount: -350,
  paymentMode: "UPI",
  type: "expense",
  location: "",
  tag: "",
  source: "manual",
  txnId: "txn-1704067200000-abc123",
  
  // Trash-specific fields
  deleted: true,                    // Always true for trash items
  txnId: "trash-1704067200000-0"   // Regenerated if missing
}
```

### Key Fields

| Field | Purpose |
|-------|---------|
| `deleted` | `true` marks this as a soft-deleted item |
| `txnId` | Unique identifier; regenerated on delete if missing (format: `trash-{timestamp}-{index}`) |
| All original fields | Preserved for full restore fidelity |

---

## State Management

### `state.trash` (in `js/core/state.js`)

```javascript
trash: []  // Array of soft-deleted transaction objects
```

### Initialization

```javascript
// In loadAllCSVs() - storage.js
state.trash = [];
// ...load current year...
state.trash = (state.trash || []).concat(rows.filter(r => r.deleted));
// ...load previous year...
state.trash = (state.trash || []).concat(expensesPrev.filter(r => r.deleted));
```

- Loaded from CSV `deleted` rows during `loadAllCSVs()`
- Also loaded during historical year fetch (`fetchYearCSVIfNeeded`)
- Cleared on fresh load, rebuilt from CSV data

---

## Deletion Flow

### Single Delete (`openDeleteModal` in `js/ui/modal.js`)

```javascript
const deleted = state.expenses.splice(idx, 1)[0];
deleted.deleted = true;
deleted.txnId = deleted.txnId || `trash-${Date.now()}-${idx}`;
state.trash = state.trash || [];
state.trash.push(deleted);

await saveYearCSV(year);
await recordActivity({ action: "deleted", type: "txn", source: deleted.source || "manual", txn: deleted });
```

1. Remove from `state.expenses` (splice)
2. Mark `deleted: true`
3. Ensure `txnId` exists (generate if missing)
4. Push to `state.trash`
5. Save CSV for that year (includes `deleted: true` row)
6. Record activity with `snapshot` of deleted transaction

### Bulk Delete (`openDeleteMultipleModal` in `js/ui/modal.js`)

```javascript
const removed = validIndices.map(idx => ({ idx, item: state.expenses.splice(idx, 1)[0] }));
state.trash = state.trash || [];
removed.forEach(({item, idx}) => {
  item.deleted = true;
  item.txnId = item.txnId || `trash-${Date.now()}-${idx}`;
  state.trash.push(item);
});

for (const yr of years) await saveYearCSV(yr);
for (const {item} of removed) await recordActivity({ action: "deleted", type: "txn", source: item.source || "manual", txn: item });
```

- Sorts indices descending to avoid index shift
- Collects all removed items with original indices
- Processes each year's CSV save
- Records one activity per deleted transaction

### Error Rollback

If CSV save fails:

```javascript
// Single delete rollback
state.expenses.splice(idx, 0, deleted);
state.trash = (state.trash || []).filter(t => t !== deleted);
deleted.deleted = false;

// Bulk delete rollback
removed.reverse().forEach(({ idx, item }) => {
  state.expenses.splice(idx, 0, item);
  state.trash = (state.trash || []).filter(t => t !== item);
  item.deleted = false;
});
```

- Restores items to original positions in `state.expenses`
- Removes from `state.trash`
- Resets `deleted: false`

---

## CSV Persistence

### `deleted` Column

CSV includes a `Deleted` column (boolean as `true`/`false` string):

```csv
Date,Category,Note,Amount,Payment Mode,Type,Location,Tag,Source,TxnId,Deleted
2024-01-15,Food,Lunch,-350,UPI,expense,,,manual,txn-123,true
```

### Load Parsing (`normalizeRow` in `storage.js`)

```javascript
function normalizeRow(row) {
  // ...
  return {
    // ...
    deleted: row.Deleted === 'true' || row.Deleted === true,
    // ...
  };
}
```

### Load Separation (`loadAllCSVs` in `storage.js`)

```javascript
const rows = parsed.data.map(normalizeRow).filter(r => r !== null);
state.expenses = rows.filter(r => !r.deleted);
state.trash = (state.trash || []).concat(rows.filter(r => r.deleted));
```

- Active expenses: `deleted === false`
- Trash: `deleted === true`
- Both loaded from same CSV

### Save (`expensesToCSV` in `form.js`)

```javascript
// In saveYearCSV -> expensesToCSV
const trashed = (state.trash || []).filter(e => e.date && e.date.startsWith(year)).map(e => ({...e, deleted: true}));
const csvContent = expensesToCSV(yearExpenses.concat(trashed));
```

- Trash items for the year are appended with `deleted: true`
- Ensures trash persists across sessions

---

## Restore Flow

### Via Activity History (`restoreTrashedTransaction` in `js/services/activity.js`)

```javascript
export async function restoreTrashedTransaction(activityId) {
  const a = (state.activityHistory || []).find(x => x.id === activityId);
  if (!a || a.action !== "deleted" || a.restored) return false;

  if (a.type === "schedule") {
    // Scheduled transaction restore (uses snapshot)
    const snapshot = a.snapshot;
    if (!snapshot || !snapshot.id || (state.scheduledTransactions || []).some(t => String(t.id) === String(snapshot.id))) return false;
    state.scheduledTransactions.push({...snapshot});
    await saveScheduledCSV();
    a.restored = true;
    await saveActivityHistory();
    await recordActivity({ action: "restored", type: "schedule", source: "schedule", id: snapshot.id, txn: snapshot });
    toast("Scheduled transaction restored", "success");
    return true;
  }

  // Regular transaction restore (uses trash)
  const t = (state.trash || []).find(x => (x.txnId || "") === a.targetId && x.deleted);
  if (!t) return false;

  t.deleted = false;
  state.trash = state.trash.filter(x => x !== t);
  state.expenses.push(t);

  const { saveYearCSV } = await import("../ui/form.js");
  await saveYearCSV((t.date || "").slice(0, 4));
  await saveActivityHistory();
  await recordActivity({ action: "restored", type: "txn", source: t.source || "manual", txn: t });
  toast("Transaction restored", "success");
  return true;
}
```

### Restore Steps

1. Find activity by `activityId`
2. Verify `action === "deleted"` and not already `restored`
3. **If scheduled**: Restore from `snapshot` to `state.scheduledTransactions`
4. **If transaction**: Find in `state.trash` by `targetId` (matches `txnId`)
5. Set `deleted: false`
6. Move from `state.trash` → `state.expenses`
7. Save CSV for transaction's year
8. Mark activity `restored: true`
9. Save activity history
10. Record new `restored` activity
11. Show success toast

---

## Split Transaction Trash Handling

When a split transaction is deleted:

1. Payer row deleted → `deleted: true`, pushed to trash
2. All participant rows deleted → `deleted: true`, pushed to trash
3. Each gets unique `txnId` (regenerated if needed)
4. Activity recorded for **payer only** (with full `split_participants` snapshot)
5. Restore: Activity History shows one "Deleted" entry for the split
6. Restoring payer row restores all participant rows (via snapshot)

---

## UI Integration

### Activity History View (Primary Restore Interface)

- Deleted transactions appear with "Restore" button
- Button calls `restoreTrashedTransaction(activityId)`
- Button hidden if `restored: true` or not in trash
- See `activity-history.md` for full UI details

### No Dedicated Trash View

- Trash is **not** exposed as a separate view
- All recovery flows through Activity History
- `state.trash` is internal implementation detail

---

## Edge Cases Handled

| Scenario | Handling |
|----------|----------|
| Missing `txnId` on delete | Auto-generated: `trash-{timestamp}-{index}` |
| Duplicate `txnId` in trash | `find` matches first; `targetId` from activity used for restore |
| Restore after year change | `saveYearCSV` uses transaction's `date` year |
| Trash item modified externally | Not possible (single-user app) |
| Scheduled transaction delete | Uses `snapshot` (not in `state.trash`) |
| Bulk delete partial failure | Full rollback of all items in batch |
| Activity history cleared | Trash items still in CSV; restore impossible without activity record |

---

## Limits & Retention

| Aspect | Behavior |
|--------|----------|
| Trash size | Unbounded (limited by CSV storage quota) |
| Auto-purge | None (manual restore or permanent delete only) |
| Cross-device sync | Via Firebase Storage CSV sync |
| Activity history cap | 2000 entries (older deletions lose restore button) |

---

## File References

| File | Purpose |
|------|---------|
| `js/core/state.js` | `state.trash` definition |
| `js/ui/modal.js` | Delete modals (single & bulk), rollback logic |
| `js/services/storage.js` | CSV load/save with `deleted` flag separation |
| `js/services/activity.js` | `restoreTrashedTransaction`, activity recording |
| `js/ui/activity.js` | Restore button handlers |
| `js/ui/form.js` | `saveYearCSV` includes trash items |
| `js/ui/table.js` | Delete button handlers (calls modal) |
| `index.html` | Delete confirmation modals |

---

## Future Enhancements

1. **Dedicated Trash View**: Browse/restore without Activity History
2. **Permanent Delete**: "Empty Trash" with confirmation
3. **Auto-Purge**: Configurable retention (e.g., 30 days)
4. **Trash Search**: Filter trash by date, category, amount
5. **Bulk Restore**: Select multiple trash items
6. **Trash Indicator**: Show trash count in nav/status bar