import { expensesToCSV } from '../js/services/storage.js';
import { downloadBlob, exportFilteredTransactionsToCSV } from '../js/services/export.js';
import { state } from '../js/core/state.js';
import * as helpers from '../js/utils/helpers.js';
import * as filters from '../js/ui/filters.js';

describe('CSV Export Feature', () => {
    let originalAndroid;

    beforeEach(() => {
        jest.clearAllMocks();
        originalAndroid = window.Android;
        delete window.Android;
        state.sortCol = 'date';
        state.sortAsc = false;
        state.expenses = [];
    });

    afterEach(() => {
        if (originalAndroid !== undefined) {
            window.Android = originalAndroid;
        } else {
            delete window.Android;
        }
    });

    describe('expensesToCSV preserveOrder parameter', () => {
        const sampleData = [
            { date: '2026-05-10', amount: 100, category: 'Food', note: 'Breakfast' },
            { date: '2026-05-12', amount: 50, category: 'Travel', note: 'Bus' },
            { date: '2026-05-08', amount: 200, category: 'Shopping', note: 'Shoes' }
        ];

        test('defaults to preserveOrder = false and sorts by date descending', () => {
            const csv = expensesToCSV(sampleData);
            const lines = csv.trim().split('\n');
            expect(lines[0]).toBe('Date,Amount,Amount Expression,Currency,Category,Transaction Type,Transaction Mode,Note,Source,Txn ID,Location,Tag');
            expect(lines[1]).toContain('2026-05-12');
            expect(lines[2]).toContain('2026-05-10');
            expect(lines[3]).toContain('2026-05-08');
        });

        test('respects preserveOrder = true and keeps array order intact', () => {
            // Suppose data was sorted by amount ascending
            const sortedByAmount = [...sampleData].sort((a, b) => a.amount - b.amount);
            const csv = expensesToCSV(sortedByAmount, true);
            const lines = csv.trim().split('\n');
            expect(lines[1]).toContain('50'); // Bus
            expect(lines[2]).toContain('100'); // Breakfast
            expect(lines[3]).toContain('200'); // Shoes
        });
    });

    describe('downloadBlob', () => {
        beforeEach(() => {
            window.URL.createObjectURL = jest.fn().mockReturnValue('blob:dummy-url');
            window.URL.revokeObjectURL = jest.fn();
        });

        test('downloads via window.Android.saveBackup when available', (done) => {
            const saveBackupMock = jest.fn();
            window.Android = { saveBackup: saveBackupMock };

            const blob = new Blob(['sample,csv,data'], { type: 'text/csv' });
            downloadBlob(blob, 'test.csv');

            // FileReader onloadend runs asynchronously
            setTimeout(() => {
                expect(saveBackupMock).toHaveBeenCalledTimes(1);
                expect(saveBackupMock.mock.calls[0][1]).toBe('test.csv');
                expect(typeof saveBackupMock.mock.calls[0][0]).toBe('string');
                done();
            }, 50);
        });

        test('downloads via temporary anchor in browser environment', () => {
            let clicked = false;
            const originalCreateElement = document.createElement.bind(document);
            jest.spyOn(document, 'createElement').mockImplementation((tag) => {
                const el = originalCreateElement(tag);
                if (tag === 'a') {
                    el.click = () => { clicked = true; };
                }
                return el;
            });

            const blob = new Blob(['sample,csv,data'], { type: 'text/csv' });
            downloadBlob(blob, 'browser_test.csv');

            expect(clicked).toBe(true);
            expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);

            document.createElement.mockRestore();
        });
    });

    describe('exportFilteredTransactionsToCSV', () => {
        beforeEach(() => {
            window.URL.createObjectURL = jest.fn().mockReturnValue('blob:dummy-url');
            window.URL.revokeObjectURL = jest.fn();
        });

        test('shows warning toast and returns false when transactions list is empty', () => {
            const toastSpy = jest.spyOn(helpers, 'toast').mockImplementation(() => {});
            
            const result = exportFilteredTransactionsToCSV([]);
            expect(result).toBe(false);
            expect(toastSpy).toHaveBeenCalledWith('No transactions to export', 'warning');

            toastSpy.mockRestore();
        });

        test('exports transactions matching current sort order (amount asc)', () => {
            const toastSpy = jest.spyOn(helpers, 'toast').mockImplementation(() => {});

            let downloadedName = null;
            const originalCreateElement = document.createElement.bind(document);
            jest.spyOn(document, 'createElement').mockImplementation((tag) => {
                const el = originalCreateElement(tag);
                if (tag === 'a') {
                    el.click = () => {
                        downloadedName = el.download;
                    };
                }
                return el;
            });

            state.sortCol = 'amount';
            state.sortAsc = true;

            const transactions = [
                { date: '2026-05-10', amount: 500, category: 'Shopping', note: 'Jeans' },
                { date: '2026-05-11', amount: 150, category: 'Food', note: 'Dinner' }
            ];

            const result = exportFilteredTransactionsToCSV(transactions);
            expect(result).toBe(true);
            expect(downloadedName).toMatch(/^ExpenseIQ_Transactions_\d{8}\.csv$/);
            expect(toastSpy).toHaveBeenCalledWith('Exported 2 transactions to CSV', 'success');

            document.createElement.mockRestore();
            toastSpy.mockRestore();
        });
    });

    describe('Hamburger Menu Export Button Integration', () => {
        test('clicking #btn-export-filtered-csv closes dropdown and triggers export', async () => {
            document.body.innerHTML = `
                <div id="txn-header-actions">
                    <button type="button" class="txn-menu-btn active" id="txn-menu-btn">☰</button>
                    <div class="txn-menu-dropdown show" id="txn-menu-dropdown">
                        <button type="button" class="txn-menu-action-btn" id="btn-export-filtered-csv">
                            <span>Export to CSV</span>
                        </button>
                    </div>
                </div>
            `;

            filters.setupFilters();

            const btn = document.getElementById('txn-menu-btn');
            const dropdown = document.getElementById('txn-menu-dropdown');
            const exportBtn = document.getElementById('btn-export-filtered-csv');

            expect(dropdown.classList.contains('show')).toBe(true);
            expect(btn.classList.contains('active')).toBe(true);

            // Mock getFilteredExpenses or toast
            const toastSpy = jest.spyOn(helpers, 'toast').mockImplementation(() => {});

            exportBtn.click();

            // Dropdown should immediately close
            expect(dropdown.classList.contains('show')).toBe(false);
            expect(btn.classList.contains('active')).toBe(false);

            toastSpy.mockRestore();
        });
    });
});
