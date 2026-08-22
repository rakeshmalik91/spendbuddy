# Expression Support - Testing Guide

## Test Cases

### 1. Basic Addition
**Input:** `127+100+30`  
**Expected:**
- Amount stored: `257.00`
- Expression stored: `127+100+30`
- Display: Shows `₹257.00` with `127+100+30` below in small text

### 2. Subtraction
**Input:** `1000-50-25`  
**Expected:**
- Amount stored: `925.00`
- Expression stored: `1000-50-25`
- Display: Shows `₹925.00` with `1000-50-25` below in small text

### 3. Mixed Operations
**Input:** `500+200-50+30`  
**Expected:**
- Amount stored: `680.00`
- Expression stored: `500+200-50+30`
- Display: Shows `₹680.00` with `500+200-50+30` below in small text

### 4. Plain Number (No Expression)
**Input:** `500`  
**Expected:**
- Amount stored: `500.00`
- Expression stored: `` (empty)
- Display: Shows `₹500.00` only (no expression below)

### 5. Decimal Numbers
**Input:** `127.50+100.25`  
**Expected:**
- Amount stored: `227.75`
- Expression stored: `127.50+100.25`
- Display: Shows `₹227.75` with `127.50+100.25` below in small text

### 6. Spaces in Expression
**Input:** `100 + 200 + 50`  
**Expected:**
- Amount stored: `350.00`
- Expression stored: `100 + 200 + 50`
- Display: Shows `₹350.00` with `100 + 200 + 50` below in small text

## Testing Steps

### Adding a New Transaction with Expression
1. Navigate to "Add Entry" page
2. Select a date
3. Enter amount: `127+100+30`
4. Fill in other fields (category, mode, etc.)
5. Click "Add Entry"
6. **Verify:** Transaction appears in dashboard with calculated amount and expression

### Viewing Transactions
1. Go to "Dashboard" page
2. **Verify:** Recent transactions show calculated amounts
3. **Verify:** Transactions with expressions show the expression in small gray text below
4. Go to "Transactions" page
5. **Verify:** Same display behavior

### Editing a Transaction with Expression
1. Click edit on a transaction that has an expression
2. **Verify:** Amount field shows the original expression (e.g., `127+100+30`)
3. Modify the expression (e.g., change to `127+100+40`)
4. Save the transaction
5. **Verify:** Updated amount is calculated correctly (267.00)
6. **Verify:** New expression is stored and displayed

### Editing a Transaction without Expression
1. Click edit on a transaction without expression
2. **Verify:** Amount field shows the numeric value (e.g., `500.00`)
3. Change to an expression (e.g., `500+50`)
4. Save the transaction
5. **Verify:** Amount updates to 550.00
6. **Verify:** Expression is now displayed

### Scheduled Transactions with Expression
1. Create a new scheduled transaction
2. Enter amount as expression: `200+50+30`
3. Set frequency (e.g., monthly)
4. Save schedule
5. **Verify:** Schedule is created with expression
6. Edit the schedule
7. **Verify:** Expression is shown in amount field
8. Wait for/trigger schedule to run
9. **Verify:** Generated transaction has both calculated amount and expression

### CSV Export/Import
1. Add transactions with various expressions
2. Export data to CSV
3. **Verify:** CSV has both `Amount` and `Amount Expression` columns
4. **Verify:** Expressions are properly quoted if they contain special characters
5. Modify CSV (add/edit expressions)
6. Import back
7. **Verify:** Transactions display correctly with new expressions

### Invalid Input Handling
1. Try entering invalid characters: `abc+123`
   - **Expected:** Should treat as plain number or 0
2. Try entering only operators: `+++`
   - **Expected:** Should evaluate to 0
3. Try entering empty value
   - **Expected:** Form validation should require a value

## Edge Cases

### Negative Transaction with Expression
- **Input:** `-500-100` (refund with breakdown)
- **Expected:** Should work normally, showing as refund

### Income with Expression
- **Input:** `5000+1000` with Transaction Type = Income
- **Expected:** Amount is negated on save, expression is preserved
- **Action:** Switch Transaction Type between Expense and Income
- **Expected:** The expression `5000+1000` inverts its signs to `-5000-1000` when Income is selected, and reverts to `5000+1000` when Expense is selected.

### Very Long Expression
- **Input:** `10+20+30+40+50+60+70+80+90+100`
- **Expected:** Calculates correctly, displays with appropriate text wrapping

## Browser Compatibility
Test on:
- ✓ Chrome/Edge (Chromium)
- ✓ Firefox
- ✓ Safari
- ✓ Mobile browsers (Android WebView, iOS Safari)

## Performance
- Verify expressions evaluate quickly (no lag when typing)
- Test with hundreds of transactions containing expressions
- Verify dashboard/transaction list loads smoothly

## Data Integrity
1. Add several transactions with expressions
2. Close browser
3. Reopen application
4. **Verify:** All expressions are preserved
5. **Verify:** Calculations remain accurate
6. Sync across devices (if multi-device setup)
7. **Verify:** Expressions sync correctly

## Known Limitations
- Only supports `+` and `-` operators (multiplication and division not supported)
- No support for parentheses `()`
- No support for advanced mathematical functions
- Maximum precision: 2 decimal places
