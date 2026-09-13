import { getRawSmsSuggestionsForDate, recomputePendingSmsTransactions, loadRawSmsCache, receiveSmsTransactions, showSmsApprovalModal, setupSmsApproval } from '../js/ui/sms_approval.js';
import { saveYearCSV } from '../js/ui/form.js';
import { state } from '../js/core/state.js';
import * as helpers from '../js/utils/helpers.js';
import { SMS_DEDUPLICATION_THRESHOLD } from '../config.js';

// Mock getLocalDateString to return a predictable date
jest.mock('../js/utils/helpers.js', () => {
    return {
        ...jest.requireActual('../js/utils/helpers.js'),
        getLocalDateString: jest.fn(() => '2026-07-19')
    };
});

jest.mock('../js/ui/render_all.js', () => ({
    renderAll: jest.fn()
}));

jest.mock('../js/ui/form.js', () => ({
    saveYearCSV: jest.fn()
}));

// Mock config constants
jest.mock('../config.js', () => ({
    SMS_DEDUPLICATION_THRESHOLD: 1,
    IGNORE_LAST_SMS_DATE: false
}));

describe('SMS Approval Logic', () => {
    beforeEach(() => {
        // Clear mocks and localStorage
        jest.clearAllMocks();
        localStorage.clear();
        
        // Reset state
        state.expenses = [];
        state.rawSmsTransactions = [];
        state.pendingSmsTransactions = [];
        
        // Mock modal check to return false
        document.body.innerHTML = '<div id="sms-modal-overlay" style="display: none;"></div>';
    });

    describe('getRawSmsSuggestionsForDate', () => {
        it('should return suggestions for the specific date directly from localStorage cache', () => {
            const rawSms = [
                { date: '2026-07-18', amount: 500, source: 'SMS 1' },
                { date: '2026-07-19', amount: 300, source: 'SMS 2' },
                { date: '2026-07-19', amount: 200, source: 'SMS 3' }
            ];
            localStorage.setItem('expman_sms_txn_cache', JSON.stringify(rawSms));
            
            const suggestions = getRawSmsSuggestionsForDate('2026-07-19');
            
            expect(suggestions.length).toBe(2);
            expect(suggestions[0].amount).toBe(300);
            expect(suggestions[1].amount).toBe(200);
        });

        it('should filter out suggestions that are already in state.expenses', () => {
            const rawSms = [
                { date: '2026-07-19', amount: 500, source: 'SMS 1' },
                { date: '2026-07-19', amount: 300, source: 'SMS 2' }
            ];
            localStorage.setItem('expman_sms_txn_cache', JSON.stringify(rawSms));
            
            state.expenses = [
                { date: '2026-07-19', amount: 500 } // Exact match
            ];
            
            const suggestions = getRawSmsSuggestionsForDate('2026-07-19');
            
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].amount).toBe(300);
        });

        it('should deduplicate suggestions with same amount and date', () => {
            const rawSms = [
                { date: '2026-07-19', amount: 300, source: 'SMS 1' },
                { date: '2026-07-19', amount: 300, source: 'Email 1' } // Duplicate
            ];
            localStorage.setItem('expman_sms_txn_cache', JSON.stringify(rawSms));
            
            const suggestions = getRawSmsSuggestionsForDate('2026-07-19');
            
            expect(suggestions.length).toBe(1);
            // Source should be merged
            expect(suggestions[0].source).toContain('SMS 1');
            expect(suggestions[0].source).toContain('Email 1');
        });

        it('should NOT deduplicate 2 transactions from the same source if they have different transaction IDs', () => {
            const rawSms = [
                { date: '2026-07-19', amount: 300, source: 'SMS: Jio', transactionId: 'TXN1001' },
                { date: '2026-07-19', amount: 300, source: 'SMS: Jio', transactionId: 'TXN1002' }
            ];
            localStorage.setItem('expman_sms_txn_cache', JSON.stringify(rawSms));
            
            const suggestions = getRawSmsSuggestionsForDate('2026-07-19');
            
            expect(suggestions.length).toBe(2);
            expect(suggestions[0].transactionId).toBe('TXN1001');
            expect(suggestions[1].transactionId).toBe('TXN1002');
        });

        it('should deduplicate transactions when one has a txnId and one does not', () => {
            const rawSms = [
                { date: '2026-07-19', amount: 529.82, source: 'SMS 1', transactionId: 'TXN123' },
                { date: '2026-07-19', amount: 529.82, source: 'SMS 2' }
            ];
            localStorage.setItem('expman_sms_txn_cache', JSON.stringify(rawSms));
            
            const suggestions = getRawSmsSuggestionsForDate('2026-07-19');
            
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].transactionId).toBe('TXN123');
            expect(suggestions[0].source).toContain('SMS 1');
            expect(suggestions[0].source).toContain('SMS 2');
        });
        
        it('should not filter out discarded signatures (they should still show as suggestions)', () => {
            const rawSms = [
                { date: '2026-07-19', amount: 300, source: 'SMS 1' }
            ];
            localStorage.setItem('expman_sms_txn_cache', JSON.stringify(rawSms));
            localStorage.setItem('expman_discarded_signatures', JSON.stringify(['2026-07-19_300']));
            
            const suggestions = getRawSmsSuggestionsForDate('2026-07-19');
            
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].amount).toBe(300);
        });
    });

    describe('recomputePendingSmsTransactions', () => {
        it('should populate pendingSmsTransactions, filtering out discarded signatures', () => {
            state.rawSmsTransactions = [
                { date: '2026-07-19', amount: 500, source: 'SMS 1' },
                { date: '2026-07-19', amount: 300, source: 'SMS 2' }
            ];
            localStorage.setItem('expman_discarded_signatures', JSON.stringify(['2026-07-19_500']));
            
            recomputePendingSmsTransactions();
            
            expect(state.pendingSmsTransactions.length).toBe(1);
            expect(state.pendingSmsTransactions[0].amount).toBe(300);
        });

        it('should filter out transactions older than last processed timestamp unless they are from today', () => {
            // Mock getLocalDateString is '2026-07-19'
            const oldTimestamp = 1000;
            const newTimestamp = 2000;
            localStorage.setItem('expman_last_sms_date', '1500');
            
            state.rawSmsTransactions = [
                { date: '2026-07-18', amount: 100, timestamp: oldTimestamp }, // Old, not today -> should be filtered
                { date: '2026-07-18', amount: 200, timestamp: newTimestamp }, // New, not today -> should be kept
                { date: '2026-07-19', amount: 300, timestamp: oldTimestamp }, // Old, but today -> should be kept
            ];
            
            recomputePendingSmsTransactions();
            
            expect(state.pendingSmsTransactions.length).toBe(2);
            expect(state.pendingSmsTransactions[0].amount).toBe(200);
            expect(state.pendingSmsTransactions[1].amount).toBe(300);
        });
        
        it('should filter out transactions that are already in state.expenses and enrich approved expense with real Txn ID', () => {
            state.rawSmsTransactions = [
                { date: '2026-07-19', amount: 500, source: 'Email 1', transactionId: '126917882958' },
                { date: '2026-07-19', amount: 300, source: 'SMS 2' }
            ];
            
            state.expenses = [
                { date: '2026-07-19', amount: 500, source: 'SMS: HDFC', txnId: '__TXN_ms8x6880vxej' }
            ];
            
            recomputePendingSmsTransactions();
            
            expect(state.pendingSmsTransactions.length).toBe(1);
            expect(state.pendingSmsTransactions[0].amount).toBe(300);
            
            // Check that approved expense in state.expenses was enriched with real Txn ID and Email source
            expect(state.expenses[0].txnId).toContain('126917882958');
            expect(state.expenses[0].source).toContain('SMS: HDFC');
            expect(state.expenses[0].source).toContain('Email 1');
        });

        it('should treat __TXN_, __SCHEDULER_, __QUICKADD_ prefixes as system generated IDs and deduplicate when amount and date match', () => {
            state.rawSmsTransactions = [
                { date: '2026-07-19', amount: 529.82, source: 'Email: Airtel', transactionId: '126917882958' }
            ];
            state.expenses = [
                { date: '2026-07-19', amount: 529.82, source: 'SMS: Airtel', txnId: '__SCHEDULER_1780842179402_2026-07-19' }
            ];

            recomputePendingSmsTransactions();

            expect(state.pendingSmsTransactions.length).toBe(0);
            expect(state.expenses[0].txnId).toContain('126917882958');
        });

        it('should call saveYearCSV with valid year string when an approved expense is enriched', () => {
            state.rawSmsTransactions = [
                { date: '2026-07-19', amount: 500, source: 'Email: HDFC', transactionId: '126917882958' }
            ];
            state.expenses = [
                { date: '2026-07-19', amount: 500, source: 'SMS: HDFC', txnId: '__TXN_123' }
            ];

            recomputePendingSmsTransactions();

            expect(saveYearCSV).toHaveBeenCalledWith('2026');
            expect(saveYearCSV).not.toHaveBeenCalledWith(undefined);
        });
    });
    describe('receiveSmsTransactions', () => {
        it('should correctly parse and store incoming transactions natively from Android', () => {
            const incoming = [
                {
                    // Pluxee to Swiggy
                    amount: 831.00,
                    merchant: 'Swiggy',
                    transactionMode: 'Meal Card',
                    originalMessage: 'Rs. 831.00 spent from Pluxee  Meal wallet, card no.xx5339 on 6-06-2026 11:24:0 at SWIGGY . Avl bal Rs.723.00. Not you call 18002106919'
                },
                {
                    // Amazon Pay Email for Swiggy
                    amount: 379.0,
                    merchant: 'Swiggy',
                    transactionMode: 'UPI',
                    source: 'Email: alerts@amazon.in',
                    originalMessage: 'Your payment of ₹ 379.0 to SWIGGY was successful. Contact Information: To report any unauthorized transaction, please click here.'
                },
                {
                    // IRCTC Refund SMS
                    amount: 4640.00,
                    merchant: 'Irctc',
                    transactionMode: 'UPI',
                    txnType: 'Refund',
                    source: 'SMS: VM-IRCTCi-S',
                    originalMessage: 'PNR 2158980722 ticket cancelled. Amt 4,640 will be refunded within 3-4 days. Please check your account/instrument from which this tkt was booked.-IRCTC'
                },
                {
                    // Pluxee Credit
                    amount: 1500.00,
                    merchant: 'Meal Wallet',
                    transactionMode: 'Meal Card',
                    txnType: 'Income',
                    source: 'SMS: JD-Pluxee-S',
                    originalMessage: 'Your Pluxee Card has been successfully credited with Rs.1500 towards  Meal Wallet on Tue Jul 07 2026 02:09:44. Your current Meal Wallet balance is Rs.1582.67.'
                },
                {
                    // Airtel Postpaid Payment SMS
                    amount: 529.82,
                    merchant: 'Airtel',
                    masterCategory: 'Mobile & Internet',
                    transactionMode: 'UPI',
                    txnType: 'Expense',
                    source: 'SMS: AD-AIRTEL-S',
                    originalMessage: 'Hi, a payment of Rs. 529.82 is updated against your Airtel Postpaid 8098789274 . To download your payment receipt or know more about your connection, visit Airtel Thanks App https://www.airtel.in/5/trnxs'
                },
                {
                    // Airtel Bill Received SMS
                    amount: 529.82,
                    merchant: 'Airtel',
                    masterCategory: 'Mobile & Internet',
                    transactionMode: 'UPI',
                    txnType: 'Expense',
                    source: 'SMS: AD-AIRBIL-S',
                    originalMessage: 'Hi Rakesh Malik, we have received payment of Rs. 529.82 for your Airtel mobile 918098789274. To download the payment receipt, click https://digi-api.airtel.in/raas/fetch?key=20b98620133f8938fb2d226232d86ab955d19079df84f97526f6c11b1394456f .\nThis receipt will be available to download for 7 days.'
                },
                {
                    // HDFC Bank Airtel Payment SMS
                    amount: 529.82,
                    merchant: 'Airtel',
                    masterCategory: 'Mobile & Internet',
                    transactionMode: 'Bank Transfer',
                    txnType: 'Expense',
                    source: 'SMS: JX-HDFCBK-S',
                    transactionId: '126917882958',
                    originalMessage: 'Sent Rs.529.82\nFrom HDFC Bank A/C *1505\nTo Airtel\nOn 27/07/26\nRef 126917882958\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808'
                }
            ];

            receiveSmsTransactions(JSON.stringify(incoming));
            
            // Check that it was saved to state
            expect(state.rawSmsTransactions.length).toBe(7);
            
            expect(state.rawSmsTransactions[0].merchant).toBe('Swiggy');
            expect(state.rawSmsTransactions[0].transactionMode).toBe('Meal Card');
            
            expect(state.rawSmsTransactions[1].merchant).toBe('Swiggy');
            expect(state.rawSmsTransactions[1].source).toBe('Email: alerts@amazon.in');
            
            expect(state.rawSmsTransactions[2].merchant).toBe('Irctc');
            expect(state.rawSmsTransactions[2].transactionMode).toBe('UPI');
            expect(state.rawSmsTransactions[2].txnType).toBe('Refund');
            
            expect(state.rawSmsTransactions[3].merchant).toBe('Meal Wallet');
            expect(state.rawSmsTransactions[3].transactionMode).toBe('Meal Card');
            expect(state.rawSmsTransactions[3].txnType).toBe('Income');

            expect(state.rawSmsTransactions[4].merchant).toBe('Airtel');
            expect(state.rawSmsTransactions[4].masterCategory).toBe('Mobile & Internet');
            expect(state.rawSmsTransactions[4].txnType).toBe('Expense');

            expect(state.rawSmsTransactions[5].merchant).toBe('Airtel');
            expect(state.rawSmsTransactions[5].source).toBe('SMS: AD-AIRBIL-S');
            expect(state.rawSmsTransactions[5].txnType).toBe('Expense');

            expect(state.rawSmsTransactions[6].merchant).toBe('Airtel');
            expect(state.rawSmsTransactions[6].source).toBe('SMS: JX-HDFCBK-S');
            expect(state.rawSmsTransactions[6].transactionId).toBe('126917882958');
            expect(state.rawSmsTransactions[6].txnType).toBe('Expense');
        });
    });

    describe('Deduplication Logic Edge Cases (isDuplicateTxn)', () => {
        it('should filter out pending SMS when saved expense has matching txnId vs raw transactionId', () => {
            state.expenses = [
                { date: '2026-07-31', amount: 5598, note: 'Design Info', txnId: '621235352225' }
            ];
            state.rawSmsTransactions = [
                { date: '2026-07-31', amount: 5598, merchant: 'Design Info', transactionId: '621235352225', source: 'SMS: VM-HDFCBK-T' }
            ];

            recomputePendingSmsTransactions();

            // Should be filtered out because 621235352225 is already logged as an expense
            expect(state.pendingSmsTransactions.length).toBe(0);
        });

        it('should deduplicate raw SMS with missing date property by defaulting to today', () => {
            state.expenses = [
                { date: '2026-07-19', amount: 529.82, note: 'Airtel' } // Mock date is 2026-07-19
            ];
            state.rawSmsTransactions = [
                { amount: 529.82, merchant: 'Airtel', source: 'SMS: AD-AIRTEL-S' } // No date property
            ];

            recomputePendingSmsTransactions();

            // Should default date to 2026-07-19 and deduplicate against saved expense
            expect(state.pendingSmsTransactions.length).toBe(0);
        });

        it('should handle string amount parsing during deduplication', () => {
            state.expenses = [
                { date: '2026-07-19', amount: 1200, note: 'Supermarket' }
            ];
            state.rawSmsTransactions = [
                { date: '2026-07-19', amount: '1200.00', merchant: 'Supermarket', source: 'SMS: Grocery' }
            ];

            recomputePendingSmsTransactions();

            expect(state.pendingSmsTransactions.length).toBe(0);
        });

        it('should sanitize invalid "More Info" merchant name to Amazon when source/body references Amazon', () => {
            state.expenses = [];
            state.rawSmsTransactions = [
                { date: '2026-07-19', amount: 1940.07, merchant: 'More Info', source: 'Email: alerts@amazon.in', body: 'Debited for Amazon Pay' }
            ];

            recomputePendingSmsTransactions();

            expect(state.pendingSmsTransactions.length).toBe(1);
            expect(state.pendingSmsTransactions[0].merchant).toBe('Amazon');
            expect(state.pendingSmsTransactions[0].masterCategory).toBe('Shopping');
        });

        it('should overwrite stale cached item when fresh incoming transaction arrives with updated sign or txnType', () => {
            state.expenses = [];
            // Simulate stale item loaded from localStorage with positive amount / Refund
            state.rawSmsTransactions = [
                { date: '2026-07-19', amount: 1500, merchant: 'Meal Wallet', source: 'SMS: JD-Pluxee-S', txnType: 'Refund' }
            ];

            // Simulate fresh payload pushed from Android after cache wipe with negative amount / Income
            const freshPayload = JSON.stringify([
                { date: '2026-07-19', amount: -1500, merchant: 'Meal Wallet', transactionMode: 'Meal Card', source: 'SMS: JD-Pluxee-S', txnType: 'Income' }
            ]);

            receiveSmsTransactions(freshPayload);

            expect(state.rawSmsTransactions.length).toBe(1);
            expect(state.rawSmsTransactions[0].amount).toBe(-1500);
            expect(state.rawSmsTransactions[0].txnType).toBe('Income');
            expect(state.pendingSmsTransactions.length).toBe(1);
            expect(state.pendingSmsTransactions[0].txnType).toBe('Income');
        });

        it('should default unclassified credit transactions (amount < 0 without explicit txnType) to Refund', () => {
            state.expenses = [];
            state.rawSmsTransactions = [
                { date: '2026-07-19', amount: -500, merchant: 'Unknown Shop', source: 'SMS: Store' } // missing txnType & no mapping
            ];

            recomputePendingSmsTransactions();

            expect(state.pendingSmsTransactions.length).toBe(1);
            const txn = state.pendingSmsTransactions[0];
            const expectedType = txn.amount < 0 ? 'Refund' : 'Expense';
            const computedType = txn.txnType || helpers.getTxnTypeForMerchant(txn.merchant, expectedType);
            expect(computedType).toBe('Refund');
        });

        it('should preserve Refund even when merchant has historical Expense transactions', () => {
            state.expenses = [
                { note: 'Swiggy', category: 'Food', txnType: 'Expense', amount: 350 },
                { note: 'Swiggy', category: 'Food', txnType: 'Expense', amount: 420 },
                { note: 'Swiggy', category: 'Food', txnType: 'Expense', amount: 500 }
            ];
            state.rawSmsTransactions = [
                { date: '2026-07-19', amount: -250, merchant: 'Swiggy', source: 'SMS: Swiggy Refund' }
            ];

            recomputePendingSmsTransactions();

            const txn = state.pendingSmsTransactions[0];
            const isRefund = helpers.isRefundTxn(txn);
            expect(isRefund).toBe(true);

            const computedType = helpers.getTxnTypeForMerchant(txn.merchant, 'Refund', txn.source);
            expect(computedType).toBe('Refund');
        });

        it('should recognize refund from body or source text keywords even if amount was positive', () => {
            state.expenses = [];
            state.rawSmsTransactions = [
                { date: '2026-07-19', amount: 250, merchant: 'Swiggy', body: 'Refund of Rs 250 completed', source: 'SMS: Bank' }
            ];

            recomputePendingSmsTransactions();

            const txn = state.pendingSmsTransactions[0];
            expect(helpers.isRefundTxn(txn)).toBe(true);
        });

        it('should resolve to Income when Android app specifies txnType as Income', () => {
            state.expenses = [];
            state.rawSmsTransactions = [
                { date: '2026-07-19', amount: -1500, merchant: 'Meal Wallet', source: 'SMS: Pluxee', txnType: 'Income' }
            ];

            recomputePendingSmsTransactions();

            expect(state.pendingSmsTransactions.length).toBe(1);
            const txn = state.pendingSmsTransactions[0];
            const expectedType = txn.amount < 0 ? 'Refund' : 'Expense';
            const computedType = txn.txnType || helpers.getTxnTypeForMerchant(txn.merchant, expectedType);
            expect(computedType).toBe('Income');
        });
    });

    describe('Automatic Cross-Source Merging (Configurable 3-Day Window & Txn ID Appending)', () => {
        it('should automatically append new source and bank txn ID to an existing approved order transaction within 3 days without user approval', () => {
            state.expenses = [
                { date: '2026-08-01', amount: 1940.07, note: 'Amazon', source: 'Email: alerts@amazon.in', txnId: 'ORDER-405-1234567-890' }
            ];

            // Later HDFC bank email arrives 2 days later for the same transaction
            state.rawSmsTransactions = [
                { date: '2026-08-03', amount: 1940.07, source: 'Email: alerts@hdfcbank.net', transactionId: 'HDFC126917882958' }
            ];

            recomputePendingSmsTransactions();

            // Should automatically filter out from pending (no user approval modal needed)
            expect(state.pendingSmsTransactions.length).toBe(0);

            // Approved expense should be enriched with combined Txn ID and combined Source
            expect(state.expenses[0].txnId).toBe('ORDER-405-1234567-890|HDFC126917882958');
            expect(state.expenses[0].source).toBe('Email: alerts@amazon.in & Email: alerts@hdfcbank.net');
            expect(saveYearCSV).toHaveBeenCalledWith('2026');
        });

        it('should merge pending SMS and Email items within 3 days into a single suggestion with combined IDs and sources', () => {
            state.expenses = [];
            state.rawSmsTransactions = [
                { date: '2026-08-01', amount: 899, source: 'Email: alerts@amazon.in', transactionId: 'ORD99' },
                { date: '2026-08-03', amount: 899, source: 'SMS: JX-HDFCBK', transactionId: 'REF8877' }
            ];

            recomputePendingSmsTransactions();

            expect(state.pendingSmsTransactions.length).toBe(1);
            expect(state.pendingSmsTransactions[0].source).toContain('Email: alerts@amazon.in');
            expect(state.pendingSmsTransactions[0].source).toContain('SMS: JX-HDFCBK');
            expect(state.pendingSmsTransactions[0].transactionId).toBe('ORD99|REF8877');
        });

        it('should NOT merge transactions if date difference is greater than 3 days', () => {
            state.expenses = [
                { date: '2026-08-01', amount: 500, note: 'Amazon', source: 'Email: alerts@amazon.in', txnId: 'ORD11' }
            ];
            state.rawSmsTransactions = [
                { date: '2026-08-06', amount: 500, source: 'SMS: Bank', transactionId: 'TXN88' } // 5 days apart
            ];

            recomputePendingSmsTransactions();

            expect(state.pendingSmsTransactions.length).toBe(1);
            expect(state.expenses[0].txnId).toBe('ORD11');
        });

        it('should NOT merge same-source transactions with different transaction IDs (e.g. 2 Jio recharges)', () => {
            state.expenses = [];
            state.rawSmsTransactions = [
                { date: '2026-08-01', amount: 300, source: 'SMS: Jio', transactionId: 'TXN1001' },
                { date: '2026-08-02', amount: 300, source: 'SMS: Jio', transactionId: 'TXN1002' }
            ];

            recomputePendingSmsTransactions();

            expect(state.pendingSmsTransactions.length).toBe(2);
        });

        it('should NOT merge transactions when amount difference exceeds SMS_DEDUPLICATION_THRESHOLD', () => {
            state.expenses = [
                { date: '2026-08-01', amount: 500, source: 'Email: Amazon' }
            ];
            state.rawSmsTransactions = [
                { date: '2026-08-02', amount: 505, source: 'Email: Bank', transactionId: 'TXN88' } // Threshold is 1
            ];

            recomputePendingSmsTransactions();

            expect(state.pendingSmsTransactions.length).toBe(1);
        });

        it('should enrich committed expense even if the raw SMS/Email item had an older timestamp', () => {
            localStorage.setItem('expman_last_sms_date', '5000');
            state.rawSmsTransactions = [
                { date: '2026-08-01', amount: 1200, source: 'SMS: HDFC', transactionId: 'HDFC_OLD_123', timestamp: 1000 }
            ];
            // User manually logs / commits transaction
            state.expenses = [
                { date: '2026-08-02', amount: 1200, note: 'Supermarket', source: 'Manual', txnId: 'MANUAL_1' }
            ];

            recomputePendingSmsTransactions();

            // The committed expense in state.expenses should be enriched
            expect(state.expenses[0].txnId).toBe('MANUAL_1|HDFC_OLD_123');
            expect(state.expenses[0].source).toBe('Manual & SMS: HDFC');
            expect(state.pendingSmsTransactions.length).toBe(0);
        });

        it('should defer saveYearCSV while cloudSyncInProgress is true to prevent eTag validation errors, then save after sync finishes', () => {
            saveYearCSV.mockClear();
            state.cloudSyncInProgress = true;
            state.rawSmsTransactions = [
                { date: '2026-08-01', amount: 1500, source: 'Email: HDFC', transactionId: 'HDFC999' }
            ];
            state.expenses = [
                { date: '2026-08-02', amount: 1500, source: 'Email: Amazon', txnId: 'ORD123' }
            ];

            recomputePendingSmsTransactions();

            // Enriched in memory, but saveYearCSV deferred because cloudSyncInProgress is true
            expect(state.expenses[0].txnId).toBe('ORD123|HDFC999');
            expect(saveYearCSV).not.toHaveBeenCalled();

            // Cloud sync completes
            state.cloudSyncInProgress = false;
            recomputePendingSmsTransactions();

            // Now saveYearCSV is called with fresh eTags loaded
            expect(saveYearCSV).toHaveBeenCalledWith('2026');
        });

        it('should NOT append a Txn ID if that Txn ID already exists in another committed expense', () => {
            state.expenses = [
                { date: '2026-08-01', amount: 2000, note: 'Store A', source: 'Manual', txnId: 'MANUAL_1' },
                { date: '2026-08-02', amount: 2000, note: 'Store B', source: 'SMS: HDFC', txnId: 'EXISTING_TXN_99' }
            ];
            // Raw transaction has transactionId 'EXISTING_TXN_99' which already exists in expense [1]
            state.rawSmsTransactions = [
                { date: '2026-08-03', amount: 2000, source: 'Email: HDFC', transactionId: 'EXISTING_TXN_99' }
            ];

            recomputePendingSmsTransactions();

            // Exact real Txn ID match should enrich expense [1] (which has EXISTING_TXN_99), NOT expense [0]
            expect(state.expenses[0].txnId).toBe('MANUAL_1');
            expect(state.expenses[1].txnId).toBe('EXISTING_TXN_99');
            expect(state.expenses[1].source).toBe('SMS: HDFC & Email: HDFC');
        });

        it('should NOT merge two 2000 payments from HDFC on same day if expense already has HDFC source and a real Txn ID', () => {
            state.expenses = [
                { date: '2026-08-07', amount: 2000, note: 'Transfer 1', source: 'Email: HDFC', txnId: 'HDFC_101' }
            ];
            // Second raw HDFC transaction for 2000 on same day with different Txn ID 'HDFC_102'
            state.rawSmsTransactions = [
                { date: '2026-08-07', amount: 2000, source: 'Email: HDFC', transactionId: 'HDFC_102' }
            ];

            recomputePendingSmsTransactions();

            // HDFC_102 should NOT be merged into expense [0] because expense [0] already has HDFC + a real Txn ID
            expect(state.expenses[0].txnId).toBe('HDFC_101');
            expect(state.expenses[0].source).toBe('Email: HDFC');
            // HDFC_102 remains as a pending suggestion for the second 2000 transaction
            expect(state.pendingSmsTransactions.length).toBe(1);
            expect(state.pendingSmsTransactions[0].transactionId).toBe('HDFC_102');
        });

        it('should normalize Apay Wallet and Amazon Pay Balance transactions to Wallet transaction mode', () => {
            state.txnModes = ['📱 UPI', '💳 Card', '👛 Wallet'];
            const rawTransactions = [
                {
                    date: '2026-08-08',
                    amount: 341.00,
                    merchant: 'Apay Wallet',
                    body: 'Your Apay Wallet balance is debited for INR 341.00.',
                    transactionMode: 'UPI',
                    transactionId: '652832815062'
                },
                {
                    date: '2026-08-08',
                    amount: 696.00,
                    merchant: 'Domino\'s',
                    body: 'Payment Mode: Amazon Pay Balance',
                    transactionMode: 'UPI',
                    transactionId: 'DOMINOS_123'
                }
            ];

            receiveSmsTransactions(rawTransactions);

            expect(state.rawSmsTransactions.length).toBe(2);
            expect(state.rawSmsTransactions[0].transactionMode).toBe('Wallet');
            expect(state.rawSmsTransactions[1].transactionMode).toBe('Wallet');
        });
    });

    describe('showSmsApprovalModal & setupSmsApproval', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div class="modal-overlay" id="sms-modal-overlay" style="display: none;">
                    <div class="modal card">
                        <button type="button" id="sms-modal-close-btn"></button>
                        <input type="checkbox" id="sms-select-all" checked>
                        <span id="sms-count">0 transactions</span>
                        <div id="sms-approval-list"></div>
                        <button id="sms-modal-discard">Discard All</button>
                        <button id="sms-modal-approve">Approve Selected</button>
                    </div>
                </div>
            `;
            state.categories = ['Food', 'Bills', 'Shopping'];
            state.txnModes = ['UPI', 'Card', 'Cash'];
            setupSmsApproval();
        });

        it('should render transaction cards without ReferenceError and display correctly', () => {
            const txns = [
                { date: '2026-07-15', amount: 450, merchant: 'Swiggy', source: 'SMS: AD-SWIGGY', transactionMode: 'UPI' },
                { date: '2026-07-16', amount: 1200, merchant: 'Amazon', source: 'Email: Amazon', transactionMode: 'Card' }
            ];

            showSmsApprovalModal(txns);

            const overlay = document.getElementById('sms-modal-overlay');
            expect(overlay.style.display).toBe('flex');
            expect(document.getElementById('sms-count').textContent).toBe('2 transactions');

            const cards = document.querySelectorAll('.sms-card');
            expect(cards.length).toBe(2);
            expect(cards[0].textContent).toContain('Swiggy');
            expect(cards[0].textContent).toContain('450');
            expect(cards[1].textContent).toContain('Amazon');
            expect(cards[1].textContent).toContain('1200');
        });

        it('should fallback to source or default title when merchant is empty', () => {
            const txns = [
                { date: '2026-07-15', amount: 250, merchant: '', source: 'SMS: HDFC-Bank', transactionMode: 'UPI' }
            ];

            showSmsApprovalModal(txns);

            const cards = document.querySelectorAll('.sms-card');
            expect(cards.length).toBe(1);
            expect(cards[0].textContent).toContain('SMS: HDFC-Bank');
        });

        it('should close the modal overlay when close button is clicked', () => {
            const txns = [
                { date: '2026-07-15', amount: 250, merchant: 'Uber', source: 'SMS: Uber' }
            ];
            showSmsApprovalModal(txns);
            const overlay = document.getElementById('sms-modal-overlay');
            expect(overlay.style.display).toBe('flex');

            document.getElementById('sms-modal-close-btn').click();
            expect(overlay.style.display).toBe('none');
        });

        it('should close the modal overlay when backdrop is clicked', () => {
            const txns = [
                { date: '2026-07-15', amount: 250, merchant: 'Uber', source: 'SMS: Uber' }
            ];
            showSmsApprovalModal(txns);
            const overlay = document.getElementById('sms-modal-overlay');
            expect(overlay.style.display).toBe('flex');

            overlay.click();
            expect(overlay.style.display).toBe('none');
        });

        it('should toggle all checkboxes when select-all is toggled', () => {
            const txns = [
                { date: '2026-07-15', amount: 250, merchant: 'Uber', source: 'SMS: Uber' },
                { date: '2026-07-16', amount: 350, merchant: 'Ola', source: 'SMS: Ola' }
            ];
            showSmsApprovalModal(txns);

            const selectAll = document.getElementById('sms-select-all');
            const checkboxes = document.querySelectorAll('.sms-checkbox');
            expect(checkboxes[0].checked).toBe(true);
            expect(checkboxes[1].checked).toBe(true);

            selectAll.checked = false;
            selectAll.dispatchEvent(new Event('change'));
            expect(checkboxes[0].checked).toBe(false);
            expect(checkboxes[1].checked).toBe(false);
        });
    });
});
