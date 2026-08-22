// Mock DOM helpers for Jest
const mockFn = () => {};
global.$ = () => ({ addEventListener: mockFn, style: {}, classList: { add: mockFn, remove: mockFn } });
global.$$ = () => [];
global.Chart = {
    defaults: {
        color: '',
        borderColor: '',
        font: { family: '' }
    }
};
