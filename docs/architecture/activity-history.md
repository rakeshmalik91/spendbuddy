# Activity History Architecture

## Overview

Activity History is SpendBuddy's transaction and configuration audit trail. It is persisted as user-scoped JSON in Firebase Storage and mirrored in `state.activityHistory`. Transaction mutations should be recorded only after their corresponding year CSV has been successfully saved.

The history is also the recovery index for soft-deleted transactions and scheduled transactions. A deletion event carries a snapshot so the item can be restored.

## Data Model

An activity entry has this shape (optional fields depend on the event):

```javascript
{
  id: "1704067200000-abc123",
  timestamp: "2024-01-01T12:00:00.000Z",
  action: "added" | "updated" | "deleted" | "restored" | "imported",
  type: "txn" | "schedule" | "quickadd" | "balance" | "settings",
  source: "manual" | "Quick Add" | "SMS" | "Email" | "Schedule" | "Refund Action" | "...",
  targetId: "txn-123",
  title: "Groceries",
  date: "2024-01-01",
  amount: 500,
  changes: [
    { field: "amount", from: 400, to: 500 },
    { field: "category", from: "Food", to: "Groceries" }
  ],
  restored: false,
  snapshot: { ... }
}
```

`source` is intentionally not a closed enum. The caller's source label is preserved so combined inbox sources and future ingestion paths can be distinguished. `type` identifies the activity surface/entity class; Quick Add uses `type: "quickadd"` while ordinary transactions use `type: "txn"`.

### Field semantics

| Field | Description |
|---|---|
| `id` | Unique timestamp/random-suffix activity identifier |
| `timestamp` | ISO-8601 UTC timestamp |
| `action` | Mutation verb: `added`, `updated`, `deleted`, `restored`; other workflows may use `imported` |
| `type` | Entity/surface discriminator, commonly `txn`, `schedule`, or `quickadd` |
| `source` | Origin label supplied by the caller |
| `targetId` | Transaction/schedule identifier; falls back to a date/amount/note composite when needed |
| `title`, `date`, `amount` | Display/search fields derived from the entity |
| `changes` | Supported field-level before/after values for updates |
| `restored` | Prevents restoring the same deletion twice |
| `snapshot` | Deep copy captured for `deleted` entries |

## State, Loading, and Persistence

### State

`state.activityHistory` is the in-memory newest-first list; `state.activityLoaded` tracks initial loading.

### Storage

The canonical cloud object is:

```text
{userEmail}/activity_history.json
```

`loadActivityHistory()` accepts either a JSON array or an object containing an `activities` array. `saveActivityHistory()` writes the complete array. The in-memory history is capped at 2,000 entries.

### Conflict handling and failure isolation

`recordActivity()` prepends the activity to in-memory state and then attempts to persist it. `saveActivityHistory()` handles an ETag conflict by fetching the latest cloud history, merging entries by activity ID, and retrying once.

Activity history is secondary to the transaction commit: a history upload failure is logged and does not turn an already-saved transaction into a failed transaction. This means a temporary history-sync failure can leave the event in local in-memory state until a later successful save/reload; callers must not roll back a committed transaction solely because history synchronization failed.

## Recording Contract

**Required ordering:**

1. Apply the transaction mutation.
2. Persist every affected year CSV (including both years when a transaction's date changes across years).
3. Record the corresponding activity event.
4. Refresh the UI.

Never emit an `added`, `updated`, or `deleted` event for a transaction whose CSV commit failed. For multi-year or multi-item operations, record only after all required CSV saves for that operation succeed.

### Supported edit fields

`recordActivity()` currently retains before/after values for:

- `amount`
- `note`
- `date`
- `category`
- `txnType`
- `txnMode`
- `txnId`
- `location`
- `tag`
- `currency`

Unchanged values are filtered out. The activity event itself is still recorded even when no supported field diff is supplied.

## Transaction Source Coverage

The following table describes the current implementation paths in the web application.

| User action / source | Activity event | Implementation path |
|---|---|---|
| Manual transaction add | `added`, `type: txn` | Add form in `ui/form.js` |
| Manual transaction edit | `updated`, `type: txn` | Edit form in `ui/form.js`; records before/after values |
| Quick Add template | `added`, `type: quickadd` | Dashboard Quick Add in `ui/dashboard.js` |
| Quick Add through add form | `added`, `type: quickadd` when source identifies Quick Add | Add form in `ui/form.js` |
| Inline Quick Edit | `updated`, `type: txn` | Inline transaction edit in `ui/transactions.js` |
| Batch transaction edit | One `updated` event per changed transaction | `ui/batch_update.js` |
| SMS / Email approval | One `added` event per approved transaction | `ui/sms_approval.js`; source label is taken from each approved entry |
| Dashboard inbox quick approval | `added`, `type: txn` | `ui/dashboard.js`; source label preserved from the approved entry |
| Scheduled transaction execution | One `added`, `type: txn` per committed occurrence | `ui/scheduled_approval.js`; source defaults to `Schedule` |
| Refund Action generation | `added`, `type: txn` | `ui/form.js` |
| Refund link / unlink | `updated`, `type: txn` for each transaction whose `txnId` changes | `ui/refund_linking_modal.js` |
| Single transaction deletion | `deleted`, `type: txn` with snapshot | `ui/modal.js` |
| Bulk transaction deletion | One `deleted`, `type: txn` with snapshot per deleted transaction | `ui/modal.js` |
| Restore transaction | `restored`, `type: txn` | `services/activity.js` |
| Scheduled definition add/edit/delete/restore | `added` / `updated` / `deleted` / `restored`, `type: schedule` | Form, scheduled UI, and `services/activity.js` |

The event records a transaction created by a scheduler separately from the schedule-definition activity. Advancing a schedule's next-run date is part of schedule execution/persistence; the generated expense/income transaction is the `txn` activity event.

### SMS and Email nuances

- SMS and Email suggestions are not transactions until the user approves them.
- Approval records an event for each committed transaction, not merely for each raw inbox message.
- When SMS and Email detections are merged into one suggestion, the saved entry's `source` label is preserved.
- Dashboard one-tap approval and the batch approval modal are separate commit paths and both record activity.

### Scheduler nuances

- Schedule definition changes are `type: "schedule"` events.
- Actual generated transactions are `type: "txn"` events, one per committed occurrence.
- Unapproved/discarded candidates do not create transaction-add events because no transaction is committed.
- A schedule's next-run advancement is not itself a transaction event.

### Refund nuances

- Generating a refund creates a new transaction and records `added`.
- Linking or unlinking existing refund/expense rows changes `txnId`; each changed row receives an `updated` event.
- The refund relationship is represented by the transaction IDs, not by a separate activity action.

## Deletion and Restore

A deleted transaction is moved to the trash state and persisted with its year CSV. Its activity entry includes a snapshot and target ID. Restore locates the deleted row in `state.trash`, moves it back to active expenses, persists its year CSV, marks the deletion event restored, and records a separate `restored` event.

Scheduled definitions are restored from their activity snapshot rather than `state.trash`.

See [Trash Feature](trash-feature.md) for the soft-delete data model and rollback behavior.

## Activity History UI

The Activity view is rendered by `ui/activity.js`. It supports searching/filtering activity entries and exposes restore controls for eligible deletion events. Deleted items can be restored only while their corresponding trash/snapshot data remains available.

## Tests

The activity-capture regression suite is `webapp/tests/activity_capture.test.js`. It covers:

- Scheduler execution records each successfully committed generated transaction.
- Manual form and inline edit paths are wired to activity recording.
- Dashboard Quick Add and SMS/Email approval paths are wired to activity recording.
- Batch edits, refund generation, refund-link updates, and deletion paths are wired to activity recording.

The scheduler test exercises the execution function; several other coverage assertions are source-wiring checks rather than full end-to-end browser workflows. Run the web test suite from `webapp/`:

```bash
npm test
```

## File References

| File | Responsibility |
|---|---|
| `js/services/activity.js` | Activity creation, load/save, conflict merge/retry, restore |
| `js/ui/activity.js` | Activity view, filters, restore controls |
| `js/core/state.js` | In-memory activity state |
| `js/ui/form.js` | Manual add/edit, schedule definition changes, Refund Action |
| `js/ui/transactions.js` | Inline Quick Edit |
| `js/ui/dashboard.js` | Dashboard Quick Add and inbox one-tap approval |
| `js/ui/sms_approval.js` | SMS/Email batch approval |
| `js/ui/scheduled_approval.js` | Committed scheduled transaction activity |
| `js/ui/batch_update.js` | Batch transaction edit |
| `js/ui/refund_linking_modal.js` | Refund relationship changes |
| `js/ui/modal.js` | Single and bulk transaction deletion |
| `js/services/storage.js` | Firebase Storage read/write primitives |

## Maintenance Invariants

1. Record transaction activity only after successful transaction CSV persistence.
2. For cross-year edits, save both affected years before recording the update.
3. Record one event per transaction in bulk operations so each item has its own target and snapshot.
4. Preserve the caller-provided source label; do not collapse SMS, Email, Schedule, Quick Add, and Refund Action into a generic manual source.
5. Do not let an activity-history upload failure undo a successfully committed transaction.
6. Keep activity snapshots sufficient for restore, and keep restore idempotent.
7. Add a regression test whenever a new transaction mutation path is introduced.
