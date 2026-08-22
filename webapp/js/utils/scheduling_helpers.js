import { parseLocalDate, getLocalDateString } from "./date_helpers.js";

/* ══════════════ SCHEDULING HELPERS ══════════════
 * Pure scheduling calculation functions with no UI or circular dependencies.
 * editScheduledTransaction remains in helpers.js due to deep UI coupling.
 * ════════════════════════════════════════════════ */

export function calculateNextRunDate(frequency, st, fromDate, isInitial = false) {
    let d = parseLocalDate(fromDate);

    let hasMultiWeekdays = (['weekly', 'biweekly'].includes(frequency) && st.recur_weekdays && st.recur_weekdays.length > 0);
    if (hasMultiWeekdays) {
        if (!isInitial) {
            d.setDate(d.getDate() + 1);
            let currentDay = d.getDay();
            let nextWeekday = st.recur_weekdays.find(w => w >= currentDay);
            if (nextWeekday !== undefined) {
                d.setDate(d.getDate() + (nextWeekday - currentDay));
            } else {
                let firstWeekday = Math.min(...st.recur_weekdays);
                let daysToNextWeek = (7 - currentDay) + firstWeekday;
                if (frequency === 'biweekly') {
                    daysToNextWeek += 7; // skip a week
                }
                d.setDate(d.getDate() + daysToNextWeek);
            }
        } else {
            let currentDay = d.getDay();
            let nextWeekday = st.recur_weekdays.find(w => w >= currentDay);
            if (nextWeekday !== undefined) {
                d.setDate(d.getDate() + (nextWeekday - currentDay));
            } else {
                let firstWeekday = Math.min(...st.recur_weekdays);
                let daysToNextWeek = (7 - currentDay) + firstWeekday;
                d.setDate(d.getDate() + daysToNextWeek);
            }
        }
        return getLocalDateString(d);
    }

    // If it is not the initial run, advance the date to the next period based on the frequency
    if (!isInitial) {
        if (frequency === 'daily') d.setDate(d.getDate() + 1);
        else if (frequency === 'weekly') d.setDate(d.getDate() + 7);
        else if (frequency === 'biweekly') d.setDate(d.getDate() + 14);
        else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
        else if (frequency === 'bimonthly') d.setMonth(d.getMonth() + 2);
        else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
        else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
    }

    // Biweekly/bimonthly/quarterly frequencies do not map to strict calendar dates for initial run adjustments, so we return early
    if (isInitial && ['biweekly', 'bimonthly', 'quarterly'].includes(frequency)) {
        return getLocalDateString(d);
    }

    // Adjust the advanced date to align with the user's specific day-of-week or day-of-month recurrence settings
    if (frequency === 'weekly' && !isNaN(st.recur_weekday)) {
        // Advance day-by-day until we match the configured day of the week (0 = Sunday, 6 = Saturday)
        while (d.getDay() !== st.recur_weekday) d.setDate(d.getDate() + 1);
    } else if (['monthly', 'bimonthly', 'quarterly'].includes(frequency) && !isNaN(st.recur_day)) {
        d.setDate(1);
        let targetMonth = d.getMonth();
        let targetYear = d.getFullYear();
        let daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        // Constrain the recurrence day to the total days of target month (e.g. day 31 becomes 28/29 in Feb)
        d.setDate(Math.min(st.recur_day, daysInTargetMonth));

        // On initial setups, if the resulting calculated date falls in the past relative to the start date, shift it to next month
        if (isInitial && d < parseLocalDate(fromDate)) {
            d.setMonth(d.getMonth() + 1);
            daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            d.setDate(Math.min(st.recur_day, daysInTargetMonth));
        }
    } else if (frequency === 'yearly' && !isNaN(st.recur_month) && !isNaN(st.recur_day)) {
        d.setDate(1);
        d.setMonth(st.recur_month - 1);
        let daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(st.recur_day, daysInTargetMonth));

        // For yearly recurrences, if the computed month/day is in the past, shift to the next year
        if (isInitial && d < parseLocalDate(fromDate)) {
            d.setFullYear(d.getFullYear() + 1);
            daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            d.setDate(Math.min(st.recur_day, daysInTargetMonth));
        }
    }

    return getLocalDateString(d);
}

export function buildFrequencyString(st, formatDateFn) {
    let freqStr = st.frequency;

    if (st.frequency === 'instant') {
        return 'Instant (Quick Add)';
    } else if (st.frequency === 'one-off') {
        return 'One-off Schedule';
    }

    if (['biweekly', 'bimonthly', 'quarterly'].includes(st.frequency)) {
        if (st.frequency === 'biweekly' && st.recur_weekdays && st.recur_weekdays.length > 0) {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            let dayNames = st.recur_weekdays.map(d => days[d]).join(', ');
            freqStr += ` (on ${dayNames})`;
        } else {
            const anchor = st.start_date || st.next_run_date;
            if (anchor) freqStr += ` (from ${formatDateFn(anchor)})`;
        }
    } else if (st.frequency === 'weekly' && st.recur_weekdays && st.recur_weekdays.length > 0) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        let dayNames = st.recur_weekdays.map(d => days[d]).join(', ');
        freqStr += ` (on ${dayNames})`;
    } else if (st.frequency === 'weekly' && !isNaN(st.recur_weekday)) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        freqStr += ` (on ${days[st.recur_weekday]})`;
    } else if (st.frequency === 'monthly' && !isNaN(st.recur_day)) {
        freqStr += ` (on ${st.recur_day})`;
    } else if (st.frequency === 'yearly' && !isNaN(st.recur_month) && !isNaN(st.recur_day)) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        freqStr += ` (on ${months[st.recur_month - 1]} ${st.recur_day})`;
    }

    if (st.end_condition === 'enabled' && st.end_date && !isNaN(st.max_occurrences)) {
        freqStr += ` - Ends: ${formatDateFn(st.end_date)} (${st.run_count || 0}/${st.max_occurrences} runs)`;
    } else if (st.end_condition === 'until_date' && st.end_date) {
        freqStr += ` - Ends: ${formatDateFn(st.end_date)}`;
    } else if (st.end_condition === 'after_occurrences' && !isNaN(st.max_occurrences)) {
        freqStr += ` - Runs: ${st.run_count || 0}/${st.max_occurrences}`;
    }

    return freqStr;
}
