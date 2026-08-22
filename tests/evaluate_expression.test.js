import { evaluateExpression } from '../js/ui/form.js';

describe('Amount Expression Validation & Evaluation', () => {
    // Shared regex matching what's used in balance.js and form.js
    const amtRegex = /^(-?)(\d+\.?\d*)([+\-*](\d+\.?\d*))*$/;

    describe('amtRegex pattern validation', () => {
        it('should pass single integer and decimal numbers', () => {
            expect(amtRegex.test("500")).toBe(true);
            expect(amtRegex.test("500.50")).toBe(true);
            expect(amtRegex.test("-500.50")).toBe(true);
            expect(amtRegex.test("0.5")).toBe(true);
        });

        it('should pass valid addition and subtraction expressions', () => {
            expect(amtRegex.test("100+50")).toBe(true);
            expect(amtRegex.test("100-50")).toBe(true);
            expect(amtRegex.test("-100+50-20")).toBe(true);
        });

        it('should pass expressions with multiplication (*)', () => {
            expect(amtRegex.test("100*2")).toBe(true);
            expect(amtRegex.test("100+50*2")).toBe(true);
            expect(amtRegex.test("31350+30675*6+30000")).toBe(true);
        });

        it('should fail on invalid expressions or characters', () => {
            expect(amtRegex.test("100/2")).toBe(false); // / not allowed
            expect(amtRegex.test("100++50")).toBe(false);
            expect(amtRegex.test("100*+50")).toBe(false);
            expect(amtRegex.test("abc")).toBe(false);
            expect(amtRegex.test("100+")).toBe(false); // dangling operator
        });
    });

    describe('evaluateExpression calculation', () => {
        it('should evaluate plain numbers', () => {
            expect(evaluateExpression("500")).toBe(500);
            expect(evaluateExpression("-500")).toBe(-500);
            expect(evaluateExpression("500.50")).toBe(500.5);
        });

        it('should evaluate addition and subtraction', () => {
            expect(evaluateExpression("100+50")).toBe(150);
            expect(evaluateExpression("100-50")).toBe(50);
            expect(evaluateExpression("-100+50")).toBe(-50);
            expect(evaluateExpression("10+20-5+3")).toBe(28);
        });

        it('should evaluate multiplication with correct precedence', () => {
            expect(evaluateExpression("100*2")).toBe(200);
            expect(evaluateExpression("100+50*2")).toBe(200); // 100 + 100
            expect(evaluateExpression("10*5-20*2")).toBe(10); // 50 - 40
            expect(evaluateExpression("31350+30675*6+30000")).toBe(245400);
        });

        it('should handle whitespace gracefully', () => {
            expect(evaluateExpression(" 100 + 50 * 2 ")).toBe(200);
        });

        it('should fallback securely on completely invalid inputs', () => {
            expect(evaluateExpression("")).toBe(0);
            expect(evaluateExpression(null)).toBe(0);
            expect(evaluateExpression("abc")).toBe(0);
        });
    });
});
