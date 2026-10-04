import { getScheduleIdFromTxnId, TXN_SOURCE_SCHEDULE, getRawSourceList, getDisplaySourceList } from '../js/utils/txn_id_helpers.js';

describe('Schedule badge link helpers', () => {
    describe('getScheduleIdFromTxnId', () => {
        it('extracts the schedule id from a generated scheduler txn id', () => {
            expect(getScheduleIdFromTxnId('__SCHEDULER_1717171717171_2026-08-27')).toBe('1717171717171');
        });

        it('keeps underscores inside a free-form schedule id', () => {
            expect(getScheduleIdFromTxnId('__SCHEDULER_rent_bills_uk_2026-08-27')).toBe('rent_bills_uk');
        });

        it('handles ids containing dashes before the trailing date', () => {
            expect(getScheduleIdFromTxnId('__SCHEDULER_my-rent-2026_2026-08-27')).toBe('my-rent-2026');
        });

        it('finds the scheduler id among multiple pipe-separated ids', () => {
            expect(getScheduleIdFromTxnId('TXN12345|__SCHEDULER_abc_2026-08-27')).toBe('abc');
        });

        it('ignores surrounding whitespace', () => {
            expect(getScheduleIdFromTxnId('  __SCHEDULER_xyz_2026-08-27  ')).toBe('xyz');
        });

        it('returns null for non-scheduler system ids', () => {
            expect(getScheduleIdFromTxnId('__TXN_12345_2026-08-27')).toBeNull();
            expect(getScheduleIdFromTxnId('__QUICKADD_99_2026-08-27')).toBeNull();
        });

        it('returns null for real user txn ids', () => {
            expect(getScheduleIdFromTxnId('TXN12345')).toBeNull();
        });

        it('returns null when no trailing ISO date is present', () => {
            expect(getScheduleIdFromTxnId('__SCHEDULER_12345')).toBeNull();
        });

        it('returns null for empty / missing input', () => {
            expect(getScheduleIdFromTxnId('')).toBeNull();
            expect(getScheduleIdFromTxnId(null)).toBeNull();
            expect(getScheduleIdFromTxnId(undefined)).toBeNull();
        });

        it('does not match a date-like tail with an invalid shape', () => {
            expect(getScheduleIdFromTxnId('__SCHEDULER_abc_2026-8-27')).toBeNull();
        });
    });

    describe('badge labelling: linkability is decided per badge label', () => {
        const isLinkable = (label) => label === TXN_SOURCE_SCHEDULE;

        it('links the standalone Schedule badge of a pure Schedule source', () => {
            const source = 'Schedule';
            // desktop branch renders one badge per raw source
            expect(getRawSourceList(source).filter(isLinkable)).toEqual(['Schedule']);
        });

        it('links the standalone Schedule badge of a composite source', () => {
            const source = 'Schedule & Email: alerts@hdfcbank.com';
            // desktop splits this into two separate badges; the Schedule one links
            const rawBadges = getRawSourceList(source);
            expect(rawBadges).toEqual(['Schedule', 'Email: alerts@hdfcbank.com']);
            expect(rawBadges.filter(isLinkable)).toEqual(['Schedule']);
        });

        it('does NOT link the combined Schedule & Email badge', () => {
            const combined = getDisplaySourceList('Schedule & Email: alerts@hdfcbank.com');
            expect(combined).toEqual(['Schedule & Email']);
            expect(combined.filter(isLinkable)).toEqual([]);
        });

        it('does not link a plain Email badge', () => {
            expect(getRawSourceList('Email: alerts@hdfcbank.com').filter(isLinkable)).toEqual([]);
        });

        it('does not link an SMS badge', () => {
            expect(getRawSourceList('SMS: AD-HDFCBK-S').filter(isLinkable)).toEqual([]);
        });
    });
});