# Amount Expression Feature Architecture

## Overview
The amount field supports live mathematical expressions (e.g. `127+100+30` or `1000-50`). Instead of manually computing numbers with a calculator before entering transactions, users can enter infix arithmetic expressions directly. The application calculates the numeric total dynamically while persisting the original expression for auditability and future edits.

```mermaid
flowchart TD
    A["User Enters Expression in #input-amount<br/>(e.g. '127+100+30')"] --> B["Regex Sanitization & Validation<br/>/^[0-9.+\-\s]+$/"]
    B -- Valid --> C["evaluateExpression(str)<br/>Custom Infix Evaluation Engine (Zero eval)"]
    B -- Invalid --> D["Display Inline Validation Warning<br/>#amount-error"]
    C --> E["Calculate Numeric Result: 257.00"]
    E --> F{Txn Type Toggle Changed?}
    F -- Switch to Expense/Investment --> G["Enforce Positive: Math.abs(257)"]
    F -- Switch to Income/Refund --> H["Invert Expression Signs:<br/>'-127-100-30' -> -257.00"]
    E --> I["Form Submit / Update"]
    I --> J["Create Transaction Object:<br/>amount: 257.00 (numeric)<br/>amountExpression: '127+100+30' (string)"]
    J --> K["CSV Serialization (storage.js):<br/>Persisted in 'Amount Expression' Column"]
    J --> L["UI Render (dashboard.js & transactions.js):<br/>Top line: ₹257.00 (Bold)<br/>Subtext: 127+100+30 (Muted)"]
```

---

## 1. How It Works

### 1.1 Input & Live Calculation
- When adding or editing an expense, scheduled transaction, or balance entry, users can enter:
  - **Single Number**: `500` → Evaluates to `500`, stored with empty expression `""`.
  - **Addition**: `127+100+30` → Evaluates to `257.00`.
  - **Subtraction**: `1000-50` → Evaluates to `950.00`.
  - **Mixed Operations**: `500+200-30+50` → Evaluates to `720.00`.
  - **Decimals & Whitespace**: `127.50 + 100.25 - 10.00` → Evaluates to `217.75`.
  - **Refund / Income Signage**: `-500-200` or `-700+50` → Evaluates to `-700.00` or `-650.00`.

### 1.2 Display Formatting
- In table rows, mobile cards, and recent transactions:
  - **Primary Line**: The calculated total formatted as currency (e.g. `₹257.00`).
  - **Secondary Subtitle**: The original expression rendered in small muted text (`127+100+30`).
- If no expression was used (a plain number was entered), only the primary currency amount is shown.

### 1.3 Editing Transactions
- When tapping Edit on an existing transaction:
  - If `amountExpression` exists, `#input-amount` is pre-populated with the **original expression string** (`127+100+30`) rather than the static number.
  - The user can adjust numbers, append items, or replace it entirely.
  - On submit, the total is re-evaluated and persisted.

---

## 2. Technical Implementation & Modules

```mermaid
flowchart TD
    subgraph Capture["1. Input Capture & Infix Evaluation"]
        In["User types into #input-amount<br/>(e.g. '127 + 100 - 10.5')"] --> Validate["Regex Sanity Check: /^[\d.+\-\s]+$/"]
        Validate -- Fail --> Err["Inline Warning: #amount-error"]
        Validate -- Pass --> Tokenize["Custom Infix Parser (Zero eval)<br/>Floating-point roundoff protection"]
        Tokenize --> NumResult["Numeric Result: 216.50"]
    end

    subgraph TypeSync["2. Type Switcher Inversion"]
        NumResult --> SwitchCheck{Txn Type Switcher Changed?}
        SwitchCheck -- Switch to Income/Refund --> Invert["form_dropdowns.js: Invert signs<br/>'-127 - 100 + 10.5' -> -216.50"]
        SwitchCheck -- Switch to Expense/Invest --> EnforcePos["form_dropdowns.js: Invert to positive signs<br/>'+127 + 100 - 10.5' -> +216.50"]
        SwitchCheck -- No Change --> CommitReady["Ready for State Commitment"]
        Invert --> CommitReady
        EnforcePos --> CommitReady
    end

    subgraph Storage["3. Persistence & Serialization"]
        CommitReady --> StateObj["Transaction Object in state.expenses:<br/>{ amount: 216.50, amountExpression: '127 + 100 - 10.5' }"]
        StateObj --> CSV["storage.js: expensesToCSV()<br/>Serialized in 'Amount Expression' Column"]
        StateObj --> Sched["scheduled_transaction.csv (Auto-scheduler carry forward)"]
    end

    subgraph Presentation["4. Dual Presentation & Edit Cycle"]
        StateObj --> UI["Table & Card Rendering:<br/>Primary: ₹216.50 (Bold tabular-nums)<br/>Subtext: 127 + 100 - 10.5 (Muted)"]
        UI --> EditClick["User Taps 'Edit Transaction'"]
        EditClick --> PrePopulate["Form Pre-fill:<br/>#input-amount receives original expression<br/>(Not the flat number!)"]
        PrePopulate --> In
    end
```

### 2.1 Evaluation Engine ([`amount_helpers.js`](../../webapp/js/utils/amount_helpers.js))
The core evaluator is implemented in `evaluateExpression(expr)`:
- **No `eval()` or `Function()`**: To guarantee security and prevent arbitrary code injection, the parser uses custom tokenization.
- **Regex Guard**: Enforces strict character whitelisting:
  ```javascript
  const sanitized = expr.replace(/\s+/g, '');
  if (!/^[\d.+\-]+$/.test(sanitized)) return null;
  ```
- **Tokenization & Accumulation**: Parses consecutive digits and decimal points into floating-point numbers, applying binary `+` and `-` operations sequentially with floating-point roundoff mitigation (`Math.round(val * 100) / 100`).

### 2.2 Transaction Type Dynamic Sign Inversion ([`form_dropdowns.js`](../../webapp/js/ui/form_dropdowns.js))
- When switching between transaction types (`Expense` vs `Income`/`Refund`):
  - In Expense/Investment mode, amounts must be positive.
  - In Income/Refund mode, amounts must be negative.
- If the amount field contains an active expression, the type switcher dynamically inverts all mathematical signs across the expression (e.g. `100+200` converts to `-100-200`, and `-50+10` converts to `50-10`) so the evaluated total respects the selected transaction type.

### 2.3 Storage & CSV Serialization ([`storage.js`](../../webapp/js/services/storage.js))
- **CSV Column Schema**: Stored under the dedicated column `Amount Expression`:
  ```csv
  Date,Amount,Amount Expression,Currency,Category,Note,TxnType,TxnMode,Location,Tag
  2026-09-12,257.00,127+100+30,INR,Food,Dinner,Expense,Card,Gurugram,Personal
  ```
- **Backward Compatibility**:
  - `normalizeRow()` handles legacy CSVs lacking the `Amount Expression` column by defaulting `amountExpression` to `""`.
  - Exporting to CSV (`expensesToCSV`) includes the column whenever present.

### 2.4 Scheduled Transactions Integration
- Scheduled transaction definitions store `amountExpression` in `scheduled_transaction.csv`.
- When the automated scheduler posts a due recurring transaction (`processScheduledTransactions()`), the original expression is carried forward into the newly created transaction record.

---

## 3. Verification & Testing

- **Automated Tests**:
  - [`evaluate_expression.test.js`](../../webapp/tests/evaluate_expression.test.js): Verifies arithmetic edge cases, whitespace handling, leading negative signs, and invalid character rejections.
  - [`add_page_expression.test.js`](../../webapp/tests/add_page_expression.test.js): Verifies form submission, editing pre-fill, and type-switching sign inversion.
