---
name: expression-as-amount-knowledge
description: Core documentation, architecture, and implementation details for the Expression As Amount feature.
---

# Amount Expression Feature

## What is it?
The amount field now supports mathematical expressions! Instead of manually calculating totals, you can enter expressions like `127+100+30` and the app will calculate the total automatically.

## How to Use

### Adding a Transaction
When adding a new expense (or editing a balance in the Balance Tracker), you can now enter:

**Simple number (as before):**
```
500
```

**Expression with addition:**
```
127+100+30
```
The app calculates: **₹257.00**

**Expression with subtraction:**
```
1000-50
```
The app calculates: **₹950.00**

**Combined operations:**
```
500+200-30+50
```
The app calculates: **₹720.00**

### Viewing Transactions
When you view your transactions, you'll see:
- The **calculated total** in normal size
- The **original expression** below in smaller gray text

Example display:
```
₹257.00
127+100+30
```

### Editing Transactions
When you edit a transaction that has an expression:
- The amount field will show your original expression
- You can modify the expression or replace it with a new value
- The total will be recalculated automatically

## Use Cases

### Splitting Bills
When you split a restaurant bill:
```
850+150+200
```
Your share: ₹1,200.00

### Multiple Purchases
Shopping at different stores in one day:
```
450+780+120
```
Total spent: ₹1,350.00

### Partial Refunds
Original purchase minus partial refund:
```
2500-250
```
Net amount: ₹2,250.00

### Receipt Itemization
Keep track of multiple items:
```
120+85+50+30+15
```
Total: ₹300.00

## Features

✓ **Simple syntax** - Just use `+` and `-`  
✓ **Automatic calculation** - No calculator needed  
✓ **Expression saved** - See your breakdown anytime  
✓ **Decimal support** - Use amounts like `127.50+100.25`  
✓ **Spaces allowed** - `100 + 200 + 30` works fine  
✓ **Edit friendly** - Modify expressions when editing transactions  

## Tips

1. **Keep it simple** - Use only numbers, `+`, and `-`
2. **No need for equals** - Just enter the expression
3. **Check the total** - The calculated amount is stored and used for all reports
4. **Original preserved** - Your expression is saved for future reference

## Examples

| Input | Calculated | What it shows |
|-------|-----------|---------------|
| `500` | ₹500.00 | Just the amount |
| `127+100+30` | ₹257.00 | Amount + expression |
| `1000-50` | ₹950.00 | Amount + expression |
| `50.5+49.5` | ₹100.00 | Amount + expression |

## Notes

- Expressions work for all transaction types (expenses, refunds, income, etc.)
- Scheduled transactions also support expressions
- The expression is purely for your reference - all calculations and charts use the calculated total
- If you enter just a number (no `+` or `-`), no expression is stored

## FAQ

**Q: Can I use multiplication or division?**  
A: Not yet. Currently only `+` and `-` are supported.

**Q: What about parentheses?**  
A: Parentheses are not supported in the current version.

**Q: Can I edit old transactions to add expressions?**  
A: Yes! Edit any transaction and replace the amount with an expression.

**Q: Will my old data still work?**  
A: Absolutely! All existing transactions continue to work normally.

**Q: Do expressions work on mobile?**  
A: Yes! The feature works on both web and Android versions.
