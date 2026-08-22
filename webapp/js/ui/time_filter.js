import { showLoader, hideLoader, $$, $ } from "../core/init.js";
import { renderAll } from "./render_all.js";
import { state } from "../core/state.js";
import { loadHistoricalData, fetchYearCSVIfNeeded } from "../services/storage.js";
import { renderCalendar } from "./form_dropdowns.js";

/* ══════════════ GLOBAL TIME FILTER ══════════════ */

export function setupTimeFilter() {
    const t = new Date();
    const todayStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    if ($('#custom-time-start')) $('#custom-time-start').setAttribute('max', todayStr);
    if ($('#custom-time-end')) $('#custom-time-end').setAttribute('max', todayStr);

    $$('.custom-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const days = e.currentTarget.dataset.days;
            const fy = e.currentTarget.dataset.fy;
            const today = new Date();
            let start = new Date();
            let end = new Date(today);

            if (days) {
                start.setDate(today.getDate() - parseInt(days));
            } else if (fy) {
                let currentYear = today.getFullYear();
                let currentMonth = today.getMonth(); // 0 = Jan, 3 = Apr

                if (fy === 'this') {
                    if (currentMonth < 3) {
                        start = new Date(currentYear - 1, 3, 1);
                    } else {
                        start = new Date(currentYear, 3, 1);
                    }
                } else if (fy === 'last') {
                    if (currentMonth < 3) {
                        start = new Date(currentYear - 2, 3, 1);
                        end = new Date(currentYear - 1, 2, 31);
                    } else {
                        start = new Date(currentYear - 1, 3, 1);
                        end = new Date(currentYear, 2, 31);
                    }
                }
            }

            $('#custom-time-start').value = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
            $('#custom-time-end').value = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
            
            updateCustomPresetHighlight();
            if ($('#btn-custom-time-apply')) $('#btn-custom-time-apply').click();
        });
    });
    
    // Add event listeners to input fields to update highlighting if dates are manually changed
    if ($('#custom-time-start')) $('#custom-time-start').addEventListener('change', updateCustomPresetHighlight);
    if ($('#custom-time-end')) $('#custom-time-end').addEventListener('change', updateCustomPresetHighlight);

    $$('.time-tab').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            state.timeMode = e.currentTarget.dataset.mode;
            state.limitDashboard = 20;
            state.limitTransactions = 20;

            // Sync all tabs across the state.app
            $$('.time-tab').forEach(b => {
                if (b.dataset.mode === state.timeMode) b.classList.add('active');
                else b.classList.remove('active');
            });

            if (state.timeMode === 'custom') {
                updateTimeFilterUI();
                if (!$('#custom-time-start').value || !$('#custom-time-end').value) {
                    const today = new Date();
                    const start = new Date();
                    start.setDate(today.getDate() - 30);
                    
                    $('#custom-time-start').value = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
                    $('#custom-time-end').value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
                }
                
                updateCustomPresetHighlight();
                if ($('#btn-custom-time-apply')) {
                    $('#btn-custom-time-apply').click();
                }
                return;
            }

            if (state.timeMode === 'all' || state.timeMode === 'year') {
                setTimeout(() => {
                    updateTimeFilterUI();
                    renderAll();
                    
                    if (state.timeMode === 'all' && !state.historicalLoaded) {
                        loadHistoricalData().then(() => {
                            if (state.timeMode === 'all') renderAll();
                        });
                    }
                }, 50);
            } else {
                updateTimeFilterUI();
                renderAll();
            }
        });
    });

    $$('.time-prev').forEach(btn => btn.addEventListener('click', () => shiftTime(-1)));
    $$('.time-next').forEach(btn => btn.addEventListener('click', () => shiftTime(1)));
    $$('.time-prev-year').forEach(btn => btn.addEventListener('click', () => shiftTime(-1, 'year')));
    $$('.time-next-year').forEach(btn => btn.addEventListener('click', () => shiftTime(1, 'year')));

    if ($('#btn-custom-time-apply')) {
        $('#btn-custom-time-apply').addEventListener('click', async () => {
            const start = $('#custom-time-start').value;
            const end = $('#custom-time-end').value;
            if (!start || !end) {
                alert('Please select both start and end dates.');
                return;
            }
            if (start > end) {
                alert('Start date cannot be after end date.');
                return;
            }
            
            state.customDateStart = start;
            state.customDateEnd = end;
            
            const startYear = new Date(start + 'T00:00:00').getFullYear();
            const endYear = new Date(end + 'T00:00:00').getFullYear();
            
            const d1 = new Date(start + 'T00:00:00');
            const d2 = new Date(end + 'T00:00:00');
            const days = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
            const pD1 = new Date(d1);
            pD1.setDate(pD1.getDate() - days);
            const prevStartYear = pD1.getFullYear();

            for (let y = prevStartYear; y <= endYear; y++) {
                if (!state.loadedYears.has(y)) {
                    if (typeof fetchYearCSVIfNeeded === 'function') await fetchYearCSVIfNeeded(y);
                }
            }

            state.limitDashboard = 20;
            state.limitTransactions = 20;
            renderAll();
        });
    }

    updateTimeFilterUI();
}

export async function shiftTime(dir, overrideMode = null) {
    const isAddView = document.querySelector('.view.active')?.id === 'view-add';
    if (isAddView) {
        if (overrideMode === 'year') {
            state.calViewDate.setFullYear(state.calViewDate.getFullYear() + dir);
        } else {
            state.calViewDate.setMonth(state.calViewDate.getMonth() + dir);
        }
        updateTimeFilterUI();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof fetchYearCSVIfNeeded === 'function') fetchYearCSVIfNeeded(state.calViewDate.getFullYear());
        return;
    }

    const mode = overrideMode || state.timeMode;
    if (mode === 'year') state.timeDate.setFullYear(state.timeDate.getFullYear() + dir);
    else if (mode === 'month') state.timeDate.setMonth(state.timeDate.getMonth() + dir);
    else if (mode === 'week') state.timeDate.setDate(state.timeDate.getDate() + (dir * 7));
    else if (mode === 'day') state.timeDate.setDate(state.timeDate.getDate() + dir);

    state.limitDashboard = 20;
    state.limitTransactions = 20;

    if (!state.historicalLoaded && state.timeDate.getFullYear() !== new Date().getFullYear()) {
        await loadHistoricalData();
    }

    if (mode === 'year') {
        setTimeout(() => {
            updateTimeFilterUI();
            renderAll();
        }, 50);
    } else {
        updateTimeFilterUI();
        renderAll();
    }
}

export function updateTimeFilterUI() {
    const navs = $$('.time-nav');
    const labels = $$('.time-label');
    if (navs.length === 0 || labels.length === 0) return;

    const isAddView = document.querySelector('.view.active')?.id === 'view-add';

    // We ALWAYS keep nav visible so the layout never jumps!
    navs.forEach(nav => { nav.style.visibility = 'visible'; nav.style.display = ''; });

    if (state.timeMode === 'custom' && !isAddView) {
        if ($('#custom-time-nav')) $('#custom-time-nav').style.display = 'flex';
    } else {
        if ($('#custom-time-nav')) $('#custom-time-nav').style.display = 'none';
    }

    let text = '';
    if (isAddView) {
        const y = state.calViewDate.getFullYear();
        const m = state.calViewDate.getMonth();
        text = new Date(y, m).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        $$('.time-nav-btn').forEach(btn => btn.style.visibility = 'visible');
    } else {
        const y = state.timeDate.getFullYear();
        const m = state.timeDate.getMonth();
        const d = state.timeDate.getDate();

        if (state.timeMode === 'all') {
            text = 'Lifetime';
            navs.forEach(nav => { nav.style.display = 'none'; });
            restoreCustomInputs();
        } else if (state.timeMode === 'custom') {
            text = 'Custom Range';
            $$('.time-nav-btn').forEach(btn => btn.style.visibility = 'hidden');
            labels.forEach(label => label.style.color = 'var(--text-muted)');
            if (window.innerWidth <= 768) {
                navs.forEach(nav => { nav.style.display = 'none'; });
                labels.forEach(label => label.style.display = '');
                restoreCustomInputs();
            } else {
                labels.forEach(label => label.style.display = 'none');
                const nav = document.getElementById('global-time-nav');
                const wrapper = document.getElementById('custom-inputs-wrapper');
                // Insert the wrapper right after the time-label
                if (nav && wrapper && wrapper.parentNode !== nav) {
                    nav.insertBefore(wrapper, nav.querySelector('.time-next'));
                }
            }
        } else {
            $$('.time-nav-btn').forEach(btn => btn.style.visibility = 'visible');
            labels.forEach(label => label.style.color = ''); // reset to default CSS color
            labels.forEach(label => label.style.display = '');
            restoreCustomInputs();
            if (state.timeMode === 'year') text = y;
            else if (state.timeMode === 'month') text = new Date(y, m).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
            else if (state.timeMode === 'week') {
                const start = new Date(y, m, d - state.timeDate.getDay());
                const end = new Date(y, m, d - state.timeDate.getDay() + 6);
                text = `${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
            }
            else if (state.timeMode === 'day') text = state.timeDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
        }
    }

    labels.forEach(label => label.textContent = text);
}

function restoreCustomInputs() {
    const ctn = document.getElementById('custom-time-nav');
    const wrapper = document.getElementById('custom-inputs-wrapper');
    if (ctn && wrapper && wrapper.parentNode !== ctn) {
        ctn.appendChild(wrapper);
    }
}

export function getGlobalFilteredExpenses() {
    let source = state.expenses;
    if (state.hideIncome) source = source.filter(e => e.txnType !== 'Income');
    if (state.hideInvestment) source = source.filter(e => e.txnType !== 'Investment');
    if (state.hideTransfer) source = source.filter(e => e.txnType !== 'Transfer');

    if (state.timeMode === 'all') return source;
    if (state.timeMode === 'custom') {
        if (!state.customDateStart || !state.customDateEnd) return [];
        return source.filter(e => e.date && e.date >= state.customDateStart && e.date <= state.customDateEnd);
    }

    const targetY = state.timeDate.getFullYear();
    const targetM = state.timeDate.getMonth();
    const targetD = state.timeDate.getDate();

    return source.filter(e => {
        if (!e.date) return false;
        const eDate = new Date(e.date + 'T00:00:00');
        const eY = eDate.getFullYear();
        const eM = eDate.getMonth();

        if (state.timeMode === 'year') return eY === targetY;
        if (state.timeMode === 'month') return eY === targetY && eM === targetM;
        if (state.timeMode === 'week') {
            const startOfWeek = new Date(targetY, targetM, targetD - state.timeDate.getDay());
            const endOfWeek = new Date(targetY, targetM, targetD - state.timeDate.getDay() + 6);
            return eDate >= startOfWeek && eDate <= endOfWeek;
        }
        if (state.timeMode === 'day') return eY === targetY && eM === targetM && eDate.getDate() === targetD;
        return true;
    });
}

export function getPrevGlobalFilteredExpenses() {
    let source = state.expenses;
    if (state.hideIncome) source = source.filter(e => e.txnType !== 'Income');
    if (state.hideInvestment) source = source.filter(e => e.txnType !== 'Investment');
    if (state.hideTransfer) source = source.filter(e => e.txnType !== 'Transfer');

    if (state.timeMode === 'all') return [];
    if (state.timeMode === 'custom') {
        if (!state.customDateStart || !state.customDateEnd) return [];
        const d1 = new Date(state.customDateStart + 'T00:00:00');
        const d2 = new Date(state.customDateEnd + 'T00:00:00');
        const days = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;

        const pD2 = new Date(d1);
        pD2.setDate(pD2.getDate() - 1);
        const pD1 = new Date(pD2);
        pD1.setDate(pD1.getDate() - days + 1);
        
        const pd1Str = `${pD1.getFullYear()}-${String(pD1.getMonth()+1).padStart(2,'0')}-${String(pD1.getDate()).padStart(2,'0')}`;
        const pd2Str = `${pD2.getFullYear()}-${String(pD2.getMonth()+1).padStart(2,'0')}-${String(pD2.getDate()).padStart(2,'0')}`;

        return source.filter(e => e.date && e.date >= pd1Str && e.date <= pd2Str);
    }

    let targetY = state.timeDate.getFullYear();
    let targetM = state.timeDate.getMonth();
    let targetD = state.timeDate.getDate();

    if (state.timeMode === 'year') {
        targetY -= 1;
    } else if (state.timeMode === 'month') {
        targetM -= 1;
        if (targetM < 0) {
            targetM = 11;
            targetY -= 1;
        }
    } else if (state.timeMode === 'week') {
        targetD -= 7;
    } else if (state.timeMode === 'day') {
        targetD -= 1;
    }

    const prevDate = new Date(targetY, targetM, targetD);
    targetY = prevDate.getFullYear();
    targetM = prevDate.getMonth();
    targetD = prevDate.getDate();

    return source.filter(e => {
        if (!e.date) return false;
        const eDate = new Date(e.date + 'T00:00:00');
        const eY = eDate.getFullYear();
        const eM = eDate.getMonth();

        if (state.timeMode === 'year') return eY === targetY;
        if (state.timeMode === 'month') return eY === targetY && eM === targetM;
        if (state.timeMode === 'week') {
            const startOfWeek = new Date(targetY, targetM, targetD - prevDate.getDay());
            const endOfWeek = new Date(targetY, targetM, targetD - prevDate.getDay() + 6);
            return eDate >= startOfWeek && eDate <= endOfWeek;
        }
        if (state.timeMode === 'day') return eY === targetY && eM === targetM && eDate.getDate() === targetD;
        return false;
    });
}

export function getPrev5GlobalFilteredExpenses() {
    let source = state.expenses;
    if (state.hideIncome) source = source.filter(e => e.txnType !== 'Income');
    if (state.hideInvestment) source = source.filter(e => e.txnType !== 'Investment');
    if (state.hideTransfer) source = source.filter(e => e.txnType !== 'Transfer');

    if (state.timeMode === 'all') return { expenses: [], days: 1 };
    if (state.timeMode === 'custom') {
        if (!state.customDateStart || !state.customDateEnd) return { expenses: [], days: 1 };
        const d1 = new Date(state.customDateStart + 'T00:00:00');
        const d2 = new Date(state.customDateEnd + 'T00:00:00');
        const customDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
        
        // 5 periods back
        const pD2 = new Date(d1);
        pD2.setDate(pD2.getDate() - 1);
        const pD1 = new Date(pD2);
        pD1.setDate(pD1.getDate() - (customDays * 5) + 1);
        
        const pd1Str = `${pD1.getFullYear()}-${String(pD1.getMonth()+1).padStart(2,'0')}-${String(pD1.getDate()).padStart(2,'0')}`;
        const pd2Str = `${pD2.getFullYear()}-${String(pD2.getMonth()+1).padStart(2,'0')}-${String(pD2.getDate()).padStart(2,'0')}`;

        let actualStartDate = new Date(pD1.getFullYear(), pD1.getMonth(), pD1.getDate());
        let actualEndDate = new Date(pD2.getFullYear(), pD2.getMonth(), pD2.getDate());
        
        let firstDateStr = null;
        if (state.expenses.length > 0) {
            firstDateStr = state.expenses[state.expenses.length - 1].date;
        }
        
        if (firstDateStr && firstDateStr > pd1Str) {
            const parts = firstDateStr.split('-');
            actualStartDate = new Date(parts[0], parts[1] - 1, parts[2]);
        }
        
        let actualDays = 0;
        if (actualStartDate <= actualEndDate) {
            actualDays = Math.round((actualEndDate - actualStartDate) / (1000 * 60 * 60 * 24)) + 1;
        }
        
        let finalDays = Math.min(customDays * 5, actualDays);

        return {
            expenses: source.filter(e => e.date && e.date >= pd1Str && e.date <= pd2Str),
            days: finalDays
        };
    }

    let targetY = state.timeDate.getFullYear();
    let targetM = state.timeDate.getMonth();
    let targetD = state.timeDate.getDate();

    let startY = targetY;
    let startM = targetM;
    let startD = targetD;
    
    let daysCount = 0;

    if (state.timeMode === 'year') {
        startY -= 5;
        for (let i=1; i<=5; i++) {
            let y = targetY - i;
            daysCount += ((y % 4 === 0 && y % 100 > 0) || y % 400 === 0) ? 366 : 365;
        }
    } else if (state.timeMode === 'month') {
        startM -= 5;
        while (startM < 0) { startM += 12; startY -= 1; }
        for (let i=1; i<=5; i++) {
            let m = targetM - i;
            let y = targetY;
            while (m < 0) { m += 12; y -= 1; }
            daysCount += new Date(y, m + 1, 0).getDate();
        }
    } else if (state.timeMode === 'week') {
        startD -= 35;
        daysCount = 35;
    } else if (state.timeMode === 'day') {
        startD -= 5;
        daysCount = 5;
    }

    const startDate = new Date(startY, startM, startD);
    const endDate = new Date(targetY, targetM, targetD);
    
    if (state.timeMode === 'week') {
        // Adjust for week start (Sunday)
        const dayOffset = startDate.getDay();
        startDate.setDate(startDate.getDate() - dayOffset);
        
        const endDayOffset = endDate.getDay();
        endDate.setDate(endDate.getDate() - endDayOffset - 1);
    } else if (state.timeMode === 'month') {
        startDate.setDate(1);
        endDate.setDate(0);
    } else if (state.timeMode === 'year') {
        startDate.setMonth(0, 1);
        endDate.setMonth(0, 0);
    } else if (state.timeMode === 'day') {
        endDate.setDate(endDate.getDate() - 1);
    }

    const sdStr = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`;
    const edStr = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;

    let actualStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    let actualEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    let firstDateStr = null;
    if (state.expenses.length > 0) {
        firstDateStr = state.expenses[state.expenses.length - 1].date;
    }
    
    if (firstDateStr && firstDateStr > sdStr) {
        const parts = firstDateStr.split('-');
        actualStartDate = new Date(parts[0], parts[1] - 1, parts[2]);
    }
    
    let actualDays = 0;
    if (actualStartDate <= actualEndDate) {
        actualDays = Math.round((actualEndDate - actualStartDate) / (1000 * 60 * 60 * 24)) + 1;
    }
    
    daysCount = Math.min(daysCount, actualDays);

    return {
        expenses: source.filter(e => e.date && e.date >= sdStr && e.date <= edStr),
        days: daysCount
    };
}

export function getTrendExpenses(ignoreTrendFilters = false) {
    const baseExpenses = getGlobalFilteredExpenses();
    // If called for Dashboard charts or when trend filters should be bypassed, return global filtered expenses directly
    if (ignoreTrendFilters) return baseExpenses;

    const activeCats = Array.from(document.querySelectorAll('#trend-filter-category .chip.active')).map(c => c.dataset.value);
    const activeTxns = Array.from(document.querySelectorAll('#trend-filter-txnmode .chip.active')).map(c => c.dataset.value);

    return baseExpenses.filter(e => {
        if (activeCats.length > 0 && !activeCats.includes('all') && !activeCats.includes('everything_else') && !activeCats.includes(e.category)) return false;
        if (activeTxns.length > 0 && !activeTxns.includes('all') && !activeTxns.includes('everything_else') && !activeTxns.includes(e.txnMode)) return false;
        return true;
    });
}

export function updateCustomPresetHighlight() {
    const startVal = $('#custom-time-start') ? $('#custom-time-start').value : null;
    const endVal = $('#custom-time-end') ? $('#custom-time-end').value : null;
    if (!startVal || !endVal) return;
    
    $$('.custom-preset-btn').forEach(btn => {
        btn.classList.remove('active');
        
        const days = btn.dataset.days;
        const fy = btn.dataset.fy;
        const today = new Date();
        let expectedStart = new Date();
        let expectedEnd = new Date(today);

        if (days) {
            expectedStart.setDate(today.getDate() - parseInt(days));
        } else if (fy) {
            let currentYear = today.getFullYear();
            let currentMonth = today.getMonth();

            if (fy === 'this') {
                if (currentMonth < 3) {
                    expectedStart = new Date(currentYear - 1, 3, 1);
                } else {
                    expectedStart = new Date(currentYear, 3, 1);
                }
            } else if (fy === 'last') {
                if (currentMonth < 3) {
                    expectedStart = new Date(currentYear - 2, 3, 1);
                    expectedEnd = new Date(currentYear - 1, 2, 31);
                } else {
                    expectedStart = new Date(currentYear - 1, 3, 1);
                    expectedEnd = new Date(currentYear, 2, 31);
                }
            }
        }
        
        const expStartStr = `${expectedStart.getFullYear()}-${String(expectedStart.getMonth()+1).padStart(2,'0')}-${String(expectedStart.getDate()).padStart(2,'0')}`;
        const expEndStr = `${expectedEnd.getFullYear()}-${String(expectedEnd.getMonth()+1).padStart(2,'0')}-${String(expectedEnd.getDate()).padStart(2,'0')}`;
        
        if (startVal === expStartStr && endVal === expEndStr) {
            btn.classList.add('active');
        }
    });
}

