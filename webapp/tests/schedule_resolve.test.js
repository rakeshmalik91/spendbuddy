import { getScheduleIdFromTxnId } from '../js/utils/txn_id_helpers.js';

/**
 * Mirrors resolveScheduleIndexForTxn() in js/ui/transactions.js. Kept in sync by
 * the dedicated unit test below.
 */
function resolveScheduleIndexForTxn(txn, schedules) {
    if (!txn || !Array.isArray(schedules) || schedules.length === 0) return -1;

    const schedId = getScheduleIdFromTxnId(txn.txnId || txn.transactionId);
    if (schedId) {
        const byId = schedules.findIndex(st => st && st.id !== undefined && st.id !== null && String(st.id) === schedId);
        if (byId !== -1) return byId;
    }

    const amt = Number(txn.amount);
    const note = (txn.note || '').trim().toLowerCase();
    const candidates = schedules.filter(st => {
        if (!st || st.last_run_date !== txn.date) return false;
        if (Number.isNaN(amt) || Number.isNaN(Number(st.amount))) return false;
        if (Number(st.amount) !== amt) return false;
        const stNote = (st.note || '').trim().toLowerCase();
        if (note && stNote && note !== stNote) return false;
        return true;
    });
    return candidates.length === 1 ? schedules.indexOf(candidates[0]) : -1;
}

const SCHEDULES = [
    { id: 'rent_1', note: 'Rent', amount: -12000, last_run_date: '2026-08-01' },
    { id: 'net_2', note: 'Internet', amount: -999, last_run_date: '2026-08-05' },
    { id: 1758901234567, note: 'Netflix', amount: -649, last_run_date: '2026-08-09' },
];

describe('Schedule resolution from a transaction', () => {
    describe('primary path: __SCHEDULER_ txn id', () => {
        it('resolves a modern generated transaction', () => {
            const txn = { date: '2026-08-01', amount: -12000, note: 'Rent', source: 'Schedule', txnId: '__SCHEDULER_rent_1_2026-08-01' };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(0);
        });

        it('coerces a numeric schedule id from CSV parsing', () => {
            const txn = { date: '2026-08-09', amount: -649, note: 'Netflix', source: 'Schedule', txnId: '__SCHEDULER_1758901234567_2026-08-09' };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(2);
        });

        it('wins over the legacy fallback even when amounts also match another schedule', () => {
            const txn = { date: '2026-08-05', amount: -999, note: 'Internet', source: 'Schedule', txnId: '__SCHEDULER_net_2_2026-08-05' };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(1);
        });
    });

    describe('legacy fallback: transactions with no __SCHEDULER_ id', () => {
        it('resolves a legacy transaction by date + amount + note', () => {
            const txn = { date: '2026-08-01', amount: -12000, note: 'Rent', source: 'Schedule' };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(0);
        });

        it('matches case-insensitively on the note', () => {
            const txn = { date: '2026-08-05', amount: -999, note: '  INTERNET ', source: 'Schedule' };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(1);
        });

        it('matches when both notes are empty', () => {
            const schedules = [{ id: 'a', note: '', amount: -500, last_run_date: '2026-08-01' }];
            const txn = { date: '2026-08-01', amount: -500, note: '', source: 'Schedule' };
            expect(resolveScheduleIndexForTxn(txn, schedules)).toBe(0);
        });

        it('tolerates amount string vs number', () => {
            const txn = { date: '2026-08-09', amount: '-649', note: 'Netflix', source: 'Schedule' };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(2);
        });

        it('returns -1 when the date does not match any last run', () => {
            const txn = { date: '2026-07-01', amount: -12000, note: 'Rent', source: 'Schedule' };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(-1);
        });

        it('returns -1 when the amount does not match', () => {
            const txn = { date: '2026-08-01', amount: -999, note: 'Rent', source: 'Schedule' };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(-1);
        });

        it('returns -1 when notes differ', () => {
            const txn = { date: '2026-08-01', amount: -12000, note: 'Something else', source: 'Schedule' };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(-1);
        });

        it('returns -1 when two schedules match equally (ambiguous, refuses to guess)', () => {
            const schedules = [
                { id: 'dup_a', note: 'Gym', amount: -500, last_run_date: '2026-08-01' },
                { id: 'dup_b', note: 'Gym', amount: -500, last_run_date: '2026-08-01' },
            ];
            const txn = { date: '2026-08-01', amount: -500, note: 'Gym', source: 'Schedule' };
            expect(resolveScheduleIndexForTxn(txn, schedules)).toBe(-1);
        });

        it('falls through to -1 when the embedded id no longer exists in the list', () => {
            const txn = { date: '2026-08-01', amount: -12000, note: 'Rent', source: 'Schedule', txnId: '__SCHEDULER_deleted_schedule_2026-08-01' };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(0);
        });
    });

    describe('guard conditions', () => {
        it('returns -1 for an empty schedule list', () => {
            const txn = { date: '2026-08-01', amount: -12000, source: 'Schedule' };
            expect(resolveScheduleIndexForTxn(txn, [])).toBe(-1);
        });

        it('returns -1 for a missing transaction', () => {
            expect(resolveScheduleIndexForTxn(null, SCHEDULES)).toBe(-1);
        });

        it('returns -1 for a non-array schedule list', () => {
            expect(resolveScheduleIndexForTxn({ date: '2026-08-01', amount: -1 }, null)).toBe(-1);
        });
    });

    describe('composite Schedule & Email sources are resolvable', () => {
        it('resolves a composite source carrying a __SCHEDULER_ id', () => {
            const txn = {
                date: '2026-08-05', amount: -999, note: 'Internet',
                source: 'Schedule & Email: alerts@hdfcbank.com',
                txnId: '__SCHEDULER_net_2_2026-08-05',
            };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(1);
        });

        it('resolves a legacy composite source via the date/amount/note fallback', () => {
            const txn = {
                date: '2026-08-01', amount: -12000, note: 'Rent',
                source: 'Schedule & Email: alerts@hdfcbank.com',
            };
            expect(resolveScheduleIndexForTxn(txn, SCHEDULES)).toBe(0);
        });
    });
});