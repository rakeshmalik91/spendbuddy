import { state } from '../js/core/state.js';
import { evaluateExpression } from '../js/ui/form.js';
import {
    roundAmount,
    calculateSplit,
    getKnownPeople,
    addOrUpdateSplitBill,
    deleteSplitBill,
    restoreSplitBill,
    permanentlyDeleteSplitBill,
    loadSplitBills
} from '../js/services/split_service.js';

describe('Split Tool & Expression Calculations', () => {
    beforeEach(() => {
        localStorage.clear();
        state.splitBills = [];
        state.splitRecentPeople = [];
        state.splitBillsLoaded = false;
        jest.clearAllMocks();
    });

    describe('Mathematical Expression Evaluator (+ - * / and ())', () => {
        it('evaluates basic operations correctly', () => {
            expect(evaluateExpression('100 + 50')).toBe(150);
            expect(evaluateExpression('100 - 40')).toBe(60);
            expect(evaluateExpression('25 * 4')).toBe(100);
            expect(evaluateExpression('100 / 4')).toBe(25);
        });

        it('handles operator precedence correctly (multiplication and division before addition and subtraction)', () => {
            expect(evaluateExpression('100 + 50 * 2')).toBe(200);
            expect(evaluateExpression('100 - 50 / 2')).toBe(75);
            expect(evaluateExpression('10 + 20 * 3 - 30 / 5')).toBe(64); // 10 + 60 - 6 = 64
        });

        it('supports parentheses/brackets () to override precedence', () => {
            expect(evaluateExpression('(100 + 50) * 2')).toBe(300);
            expect(evaluateExpression('(100 - 50) / 2')).toBe(25);
            expect(evaluateExpression('(200 - 50) * (3 + 1) / 2')).toBe(300); // 150 * 4 / 2 = 300
            expect(evaluateExpression('((10 + 5) * 2 + 10) / 4')).toBe(10); // (30 + 10) / 4 = 10
        });

        it('handles negative numbers and decimals', () => {
            expect(evaluateExpression('-50 + 20')).toBe(-30);
            expect(evaluateExpression('120.50 + 79.50')).toBe(200);
            expect(evaluateExpression('(100.5 - 0.5) / 2')).toBe(50);
        });

        it('gracefully handles empty, invalid, and division by zero expressions', () => {
            expect(evaluateExpression('')).toBe(0);
            expect(evaluateExpression(null)).toBe(0);
            expect(evaluateExpression('invalid text')).toBe(0);
            expect(evaluateExpression('100 / 0')).toBe(0);
        });
    });

    describe('Bill Splitting Calculation Engine', () => {
        it('splits a bill equally among multiple participants', () => {
            const bill = {
                title: 'Lunch',
                totalAmountExpr: '1500',
                taxExpr: '0',
                splitMethod: 'equal',
                taxSplitMethod: 'equal',
                participants: [
                    { id: '1', name: 'Alice' },
                    { id: '2', name: 'Bob' },
                    { id: '3', name: 'Charlie' }
                ]
            };

            const result = calculateSplit(bill);

            expect(result.totalAmount).toBe(1500);
            expect(result.taxAmount).toBe(0);
            expect(result.grandTotal).toBe(1500);

            expect(result.participants[0].baseAmount).toBe(450);
            expect(result.participants[0].taxAmount).toBe(0);
            expect(result.participants[0].endAmount).toBe(500);

            expect(result.participants[1].endAmount).toBe(500);
            expect(result.participants[2].endAmount).toBe(500);
        });

        it('splits bill using custom expressions per participant with + - * / and brackets ()', () => {
            const bill = {
                title: 'Groceries',
                totalAmountExpr: '1000 + 500', // 1500
                taxExpr: '0',
                splitMethod: 'expression',
                taxSplitMethod: 'equal',
                participants: [
                    { id: '1', name: 'Alice', expression: '250 + 150' }, // 400
                    { id: '2', name: 'Bob', expression: '(100 * 5) + 100' }, // 600
                    { id: '3', name: 'Charlie', expression: '1000 / 2' } // 500
                ]
            };

            const result = calculateSplit(bill);

            expect(result.totalAmount).toBe(1500);
            expect(result.allocatedBase).toBe(1500);
            expect(result.remainingBase).toBe(0);

            expect(result.participants[0].baseAmount).toBe(400);
            expect(result.participants[0].endAmount).toBe(400);

            expect(result.participants[1].baseAmount).toBe(600);
            expect(result.participants[1].endAmount).toBe(500);

            expect(result.participants[2].baseAmount).toBe(500);
            expect(result.participants[2].endAmount).toBe(500);
        });

        it('distributes tax percentage-wise (proportional to base share)', () => {
            const bill = {
                title: 'Dinner',
                totalAmountExpr: '1500',
                taxExpr: '180', // total tax
                splitMethod: 'expression',
                taxSplitMethod: 'percentage', // proportional
                participants: [
                    { id: '1', name: 'Alice', expression: '528' }, // 40% of the 1320 pre-tax amount
                    { id: '2', name: 'Bob', expression: '792' }    // 60% of the 1320 pre-tax amount
                ]
            };

            const result = calculateSplit(bill);

            expect(result.totalAmount).toBe(1500);
            expect(result.taxAmount).toBe(180);
            expect(result.grandTotal).toBe(1500);
            expect(result.remainingBase).toBe(0);
            expect(result.remainingTax).toBe(0);
            expect(result.remainingInclusive).toBe(0);

            // Alice gets 40% of 180 = 72
            expect(result.participants[0].baseAmount).toBe(528);
            expect(result.participants[0].taxAmount).toBe(72);
            expect(result.participants[0].endAmount).toBe(600);

            // Bob gets 60% of 180 = 108
            expect(result.participants[1].baseAmount).toBe(792);
            expect(result.participants[1].taxAmount).toBe(108);
            expect(result.participants[1].endAmount).toBe(900);

            // Sum of end amounts equals grand total
            expect(result.participants[0].endAmount + result.participants[1].endAmount).toBe(1500);
        });

        it('keeps a tax-inclusive entered total unchanged and extracts flat tax', () => {
            const result = calculateSplit({
                totalAmountExpr: '1000',
                taxExpr: '230',
                splitMethod: 'equal',
                taxSplitMethod: 'equal',
                participants: [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]
            });
            expect(result.totalAmount).toBe(1000);
            expect(result.baseAmountTotal).toBe(770);
            expect(result.taxAmount).toBe(230);
            expect(result.grandTotal).toBe(1000);
            expect(result.participants[0].endAmount + result.participants[1].endAmount).toBe(1000);
        });

        it('reports remaining amounts both tax-exclusive and tax-inclusive', () => {
            const result = calculateSplit({
                totalAmountExpr: '1000',
                taxExpr: '18%',
                splitMethod: 'expression',
                taxSplitMethod: 'percentage',
                participants: [{ id: '1', name: 'Alice', expression: '400' }]
            });

            expect(result.grandTotal).toBe(1000);
            expect(result.taxAmount).toBe(152.54);
            expect(result.remainingBase).toBe(447.46);
            expect(result.remainingTax).toBe(80.54);
            expect(result.remainingInclusive).toBe(528);
        });

        it('distributes tax equally among participants', () => {
            const bill = {
                title: 'Hotel',
                totalAmountExpr: '2000',
                taxExpr: '200',
                splitMethod: 'equal',
                taxSplitMethod: 'equal',
                participants: [
                    { id: '1', name: 'Alice' },
                    { id: '2', name: 'Bob' }
                ]
            };

            const result = calculateSplit(bill);

            expect(result.participants[0].baseAmount).toBe(900);
            expect(result.participants[0].taxAmount).toBe(100);
            expect(result.participants[0].endAmount).toBe(1000);

            expect(result.participants[1].baseAmount).toBe(900);
            expect(result.participants[1].taxAmount).toBe(100);
            expect(result.participants[1].endAmount).toBe(1000);
        });

        it('supports percentage tax expression string (e.g. 18%)', () => {
            const bill = {
                title: 'Cafe',
                totalAmountExpr: '1000',
                taxExpr: '18%', // 18% of 1000 = 180
                splitMethod: 'equal',
                taxSplitMethod: 'percentage',
                participants: [
                    { id: '1', name: 'Alice' },
                    { id: '2', name: 'Bob' }
                ]
            };

            const result = calculateSplit(bill);

            expect(result.totalAmount).toBe(1000);
            expect(result.taxAmount).toBe(152.54);
            expect(result.grandTotal).toBe(1000);
            expect(result.participants[0].taxAmount).toBe(76.27);
            expect(result.participants[0].endAmount).toBe(500);
            expect(result.participants[1].endAmount).toBe(500);
        });

        it('supports individual custom tax expressions per participant if provided', () => {
            const bill = {
                title: 'Custom Tax Dinner',
                totalAmountExpr: '1000',
                taxExpr: '150',
                splitMethod: 'expression',
                taxSplitMethod: 'percentage',
                participants: [
                    { id: '1', name: 'Alice', expression: '450', taxExpression: '50' },
                    { id: '2', name: 'Bob', expression: '400', taxExpression: '100' }
                ]
            };

            const result = calculateSplit(bill);

            expect(result.participants[0].baseAmount).toBe(450);
            expect(result.participants[0].taxAmount).toBe(50);
            expect(result.participants[0].endAmount).toBe(500);

            expect(result.participants[1].baseAmount).toBe(400);
            expect(result.participants[1].taxAmount).toBe(100);
            expect(result.participants[1].endAmount).toBe(500);
        });
    });

    describe('People Reuse and Persistence', () => {
        it('tracks and reuses people across bills', () => {
            state.splitBills = [
                {
                    id: 'b1',
                    title: 'Trip 1',
                    participants: [{ name: 'Alice' }, { name: 'Bob' }]
                },
                {
                    id: 'b2',
                    title: 'Trip 2',
                    participants: [{ name: 'Charlie' }, { name: 'Alice' }]
                }
            ];
            state.splitRecentPeople = ['David'];

            const known = getKnownPeople();
            expect(known).toEqual(['Alice', 'Bob', 'Charlie', 'David']);
        });

        it('adds a bill, updates state, and persists to localStorage', async () => {
            const billData = {
                title: 'Movie night',
                totalAmountExpr: '600',
                taxExpr: '60',
                splitMethod: 'equal',
                taxSplitMethod: 'equal',
                participants: [{ name: 'Alice' }, { name: 'Bob' }]
            };

            const saved = await addOrUpdateSplitBill(billData);

            expect(saved.id).toBeDefined();
            expect(saved.grandTotal).toBe(600);
            expect(state.splitBills.length).toBe(1);
            expect(state.splitBills[0].title).toBe('Movie night');

            const stored = JSON.parse(localStorage.getItem('expman_split_bills'));
            expect(stored.length).toBe(1);
            expect(stored[0].title).toBe('Movie night');
        });

        it('moves a bill to trash and supports restore and permanent deletion', async () => {
            state.splitBills = [
                { id: 'b1', title: 'Bill 1' },
                { id: 'b2', title: 'Bill 2' }
            ];

            const deleted = await deleteSplitBill('b1');
            expect(deleted).toBe(true);
            expect(state.splitBills.length).toBe(2);
            expect(state.splitBills.find(b => b.id === 'b1').deleted).toBe(true);
            expect(state.splitBills.find(b => b.id === 'b1').deletedAt).toBeDefined();

            let stored = JSON.parse(localStorage.getItem('expman_split_bills'));
            expect(stored).toHaveLength(2);
            expect(stored.find(b => b.id === 'b1').deleted).toBe(true);

            expect(await restoreSplitBill('b1')).toBe(true);
            expect(state.splitBills.find(b => b.id === 'b1').deleted).toBeUndefined();
            expect(await deleteSplitBill('b1')).toBe(true);
            expect(await permanentlyDeleteSplitBill('b1')).toBe(true);
            expect(state.splitBills.map(b => b.id)).toEqual(['b2']);
            stored = JSON.parse(localStorage.getItem('expman_split_bills'));
            expect(stored.map(b => b.id)).toEqual(['b2']);
        });
    });
});
