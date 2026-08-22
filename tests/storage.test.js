import * as storage from '../js/services/storage.js';

describe('Storage Helpers', () => {

    describe('csvEscape', () => {
        it('should return empty string for null or undefined', () => {
            expect(storage.csvEscape(null)).toBe('');
            expect(storage.csvEscape(undefined)).toBe('');
            expect(storage.csvEscape('')).toBe('');
        });

        it('should not wrap simple strings in quotes', () => {
            expect(storage.csvEscape('Hello')).toBe('Hello');
            expect(storage.csvEscape('123.45')).toBe('123.45');
            expect(storage.csvEscape('Zomato Delivery')).toBe('Zomato Delivery');
        });

        it('should wrap strings containing commas in quotes', () => {
            expect(storage.csvEscape('Hello, World')).toBe('"Hello, World"');
            expect(storage.csvEscape(',Starting with comma')).toBe('",Starting with comma"');
        });

        it('should wrap strings containing newlines in quotes', () => {
            expect(storage.csvEscape('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
        });

        it('should wrap strings containing quotes in quotes and escape them with double quotes', () => {
            expect(storage.csvEscape('He said "Hello"')).toBe('"He said ""Hello"""');
            expect(storage.csvEscape('"Quoted"')).toBe('"""Quoted"""');
        });
        
        it('should handle strings with mixed special characters', () => {
            expect(storage.csvEscape('Item, with "quotes"\nand newlines')).toBe('"Item, with ""quotes""\nand newlines"');
        });
    });

    describe('normalizeRow', () => {
        it('should return null if Amount is missing or invalid', () => {
            expect(storage.normalizeRow({})).toBeNull();
            expect(storage.normalizeRow({ Amount: 'abc' })).toBeNull();
            expect(storage.normalizeRow({ Date: '2026-07-19' })).toBeNull();
        });

        it('should correctly parse and round a valid Amount', () => {
            const row = storage.normalizeRow({ Amount: '123.456' });
            expect(row).not.toBeNull();
            expect(row.amount).toBe(123.46); // Should round to 2 decimals
        });

        it('should provide default values for missing fields', () => {
            const row = storage.normalizeRow({ Amount: '100' });
            expect(row.date).toBe('');
            expect(row.amountExpression).toBe('');
            expect(row.currency).toBe('INR');
            expect(row.category).toBe('');
            expect(row.txnType).toBe('');
            expect(row.txnMode).toBe('');
            expect(row.note).toBe('');
            expect(row.source).toBe('');
            expect(row.txnId).toBe('');
            expect(row.location).toBe('');
        });

        it('should map standard fields correctly', () => {
            const inputRow = {
                Date: '2026-07-19',
                Amount: '-500',
                'Amount Expression': '100-600',
                Currency: 'USD',
                Category: 'Food',
                'Transaction Type': 'Expense',
                'Transaction Mode': 'Credit Card',
                Note: 'Lunch',
                Source: 'App',
                'Txn ID': 'tx_123',
                Location: 'Delhi',
                Tag: 'Vacation'
            };
            const row = storage.normalizeRow(inputRow);
            expect(row.date).toBe('2026-07-19');
            expect(row.amount).toBe(-500);
            expect(row.amountExpression).toBe('100-600');
            expect(row.currency).toBe('USD');
            expect(row.category).toBe('Food');
            expect(row.txnType).toBe('Expense');
            expect(row.txnMode).toBe('Credit Card');
            expect(row.note).toBe('Lunch');
            expect(row.source).toBe('App');
            expect(row.txnId).toBe('tx_123');
            expect(row.location).toBe('Delhi');
            expect(row.tag).toBe('Vacation');
        });

        it('should handle alternate location key and tag', () => {
            const row = storage.normalizeRow({ Amount: '100', location: 'Gurugram', Tag: 'Work' });
            expect(row.location).toBe('Gurugram');
            expect(row.tag).toBe('Work');
        });

        it('should handle lowercase tag key', () => {
            const row = storage.normalizeRow({ Amount: '100', tag: 'Personal' });
            expect(row.tag).toBe('Personal');
        });
    });

    describe('expensesToCSV', () => {
        it('should sort rows by date descending regardless of insertion order and include Tag header', () => {
            const unSortedData = [
                { date: '2026-07-20', amount: 100, category: 'Food', tag: 'Dinner' },
                { date: '2026-08-04', amount: 500, category: 'Shopping', tag: 'Clothes' },
                { date: '2026-07-25', amount: 300, category: 'Groceries' }
            ];
            const csvOutput = storage.expensesToCSV(unSortedData);
            const lines = csvOutput.trim().split('\n');

            expect(lines[0]).toBe('Date,Amount,Amount Expression,Currency,Category,Transaction Type,Transaction Mode,Note,Source,Txn ID,Location,Tag');
            expect(lines.length).toBe(4);
            expect(lines[1]).toContain('2026-08-04');
            expect(lines[1]).toContain('Clothes');
            expect(lines[2]).toContain('2026-07-25');
            expect(lines[3]).toContain('2026-07-20');
            expect(lines[3]).toContain('Dinner');
        });
    });
});
