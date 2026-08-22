# Expression Support Implementation

## Overview
Implemented support for mathematical expressions in the amount field, allowing users to enter calculations like `127+100+30` instead of manually calculating totals.

## Changes Made

### 1. Frontend - Form Input (`index.html`)
- **Changed amount input type** from `number` to `text` to accept expressions
- **Updated placeholder** to show example: `e.g. 500 or 127+100+30`
- **Updated hint** to mention expression support

### 2. Expression Evaluation (`js/ui/form.js`)
- **Added `evaluateExpression()` function** that:
  - Accepts expressions with `+` and `-` operators
  - Validates input to prevent code injection (only allows digits, +, -, ., and whitespace)
  - Returns calculated numeric value
  - Falls back to plain number parsing if expression is invalid

- **Updated form submission** to:
  - Capture the original input value (expression or number)
  - Evaluate the expression to get the calculated amount
  - Store both the calculated amount and the original expression

- **Modified entry creation** to include:
  - `amount`: calculated value (stored as number)
  - `amountExpression`: original expression string (empty if just a number)

### 3. Data Storage (`js/services/storage.js`)
- **Updated CSV format** to include new column `Amount Expression`:
  - Regular transactions: `Date,Amount,Amount Expression,Currency,Category,...`
  - Scheduled transactions: `id,amount,amountExpression,currency,category,...`

- **Updated `expensesToCSV()`** to export the expression field
- **Updated `normalizeRow()`** to import the expression field from CSV
- **Updated `saveScheduledCSV()`** to include expression in scheduled transactions
- **Updated `loadScheduledCSV()`** to read expression from scheduled transactions
- **Updated `processScheduledTransactions()`** to preserve expressions when creating transactions from schedules
- **Updated background sync** to handle the new field

### 4. Display Logic
#### Dashboard (`js/ui/dashboard.js`)
- Updated transaction amount display to show:
  - **Main value**: Calculated amount in normal size
  - **Expression**: Original expression below in small gray text (only if expression exists)

#### Transactions Page (`js/ui/transactions.js`)
- Applied same display logic as dashboard

### 5. Editing Functionality
#### Form Editing (`js/ui/form.js`)
- **`editEntry()`**: Updated to populate the input field with the original expression (if exists) instead of the calculated amount
- This allows users to see and edit the original expression

#### Scheduled Transactions (`js/utils/helpers.js`)
- **`editScheduledTransaction()`**: Updated to show expression when editing scheduled transactions

#### Update Logic (`js/ui/form.js`)
- Modified scheduled transaction update to preserve `amountExpression` field

#### Transaction Type Switching (`js/ui/form_dropdowns.js`)
- Modified transaction type chip listeners to dynamically invert full expressions (e.g., `100+200` becomes `-100-200`) when switching between Expense and Income. The script evaluates the expression and selectively flips all mathematical signs to enforce the required positive or negative total.

## Behavior

### Input Examples
- `500` → Stored as: amount=500, expression=""
- `127+100+30` → Stored as: amount=257, expression="127+100+30"
- `1000-50` → Stored as: amount=950, expression="1000-50"
- `100 + 200 + 300` → Stored as: amount=600, expression="100 + 200 + 300"

### Display
**Without Expression:**
```
₹500.00
```

**With Expression:**
```
₹257.00
127+100+30
```

### Editing
When editing a transaction:
- If the transaction has an expression, the input field shows: `127+100+30`
- If no expression, the input field shows: `257.00`
- Users can modify the expression or replace it with a new value/expression

## Security
The `evaluateExpression()` function:
- Validates input using regex: `/^[\d.+\-]+$/`
- Only allows: digits, decimal points, plus signs, minus signs
- Does NOT use `eval()` or `Function()` to prevent code injection
- Implements custom parsing logic for safe evaluation

## Backward Compatibility
- **CSV Import**: Old CSVs without the `Amount Expression` column will work fine (field defaults to empty string)
- **Existing Data**: All existing transactions will have empty `amountExpression` and display normally
- **New Data**: Transactions with expressions will display the expression below the calculated amount

## Future Enhancements
Potential improvements that could be added:
- Support for multiplication (`*`) and division (`/`) operators
- Support for parentheses `()` for complex expressions
- Real-time calculation preview while typing
- Expression validation error messages
- Support for percentage calculations
