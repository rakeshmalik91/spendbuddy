import { invertExpression } from '../js/ui/form_dropdowns.js';

describe('Add Page Expression Evaluation - Invert Expression', () => {
    it('should invert simple numbers without sign', () => {
        expect(invertExpression('100')).toBe('-100');
        expect(invertExpression('100.50')).toBe('-100.50');
    });

    it('should invert numbers with positive sign', () => {
        expect(invertExpression('+100')).toBe('-100');
        expect(invertExpression(' +100')).toBe(' -100');
    });

    it('should invert numbers with negative sign', () => {
        expect(invertExpression('-100')).toBe('100');
        expect(invertExpression(' -100')).toBe('100');
    });

    it('should invert complex expressions', () => {
        expect(invertExpression('100+50')).toBe('-100-50');
        expect(invertExpression('-100+50')).toBe('100-50');
        expect(invertExpression('100-50')).toBe('-100+50');
        expect(invertExpression('-100-50')).toBe('100+50');
        expect(invertExpression('100+50-20')).toBe('-100-50+20');
        expect(invertExpression('31350+30675-30000')).toBe('-31350-30675+30000');
    });

    it('should correctly handle whitespace padding in expressions', () => {
        expect(invertExpression(' 100 + 50 ')).toBe('- 100 - 50 ');
        expect(invertExpression(' - 100 + 50 ')).toBe(' 100 - 50 ');
    });

    it('should return empty string or same value if falsy input', () => {
        expect(invertExpression('')).toBe('');
        expect(invertExpression(null)).toBe(null);
    });
});
