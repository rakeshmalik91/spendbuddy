import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from "../../config.js";
import { renderChartsPage } from "./charts.js";
import { $$, $ } from "../core/init.js";
import { escHtml, isRefundTxn } from "../utils/helpers.js";
import { state } from "../core/state.js";
import { updateTimeFilterUI } from "./time_filter.js";
import { evaluateExpression, getIsFormSubmitting, recordFormFillTime, setCategoryManuallyChanged, setTxnModeManuallyChanged, setTxnTypeManuallyChanged } from "./form.js";

export function invertExpression(expr) {
    if (!expr) return expr;
    let flipped = expr.replace(/[+-]/g, m => m === '+' ? '-' : '+');
    if (!/^\s*[+-]/.test(expr)) {
        flipped = '-' + flipped;
    } else {
        flipped = flipped.replace(/^\s*\+/, '');
    }
    return flipped;
}

export function isExcludedSuggestionSource(e) {
    if (!e) return false;
    if (typeof e === 'object') {
        if (isRefundTxn(e)) return true;
        const sourceLow = String(e.source || '').toLowerCase();
        return sourceLow.includes('schedule') || sourceLow.includes('quick add') || sourceLow.includes('refund');
    }
    const s = String(e).toLowerCase();
    return s.includes('refund') || s.includes('schedule') || s.includes('quick add');
}

/* Avoid moving focus into text inputs when selecting suggestion chips on
   touch-first/mobile layouts. Users can still tap the input directly to edit. */
function focusSuggestionInputOnDesktop(input) {
    if (!input) return;
    const touchFirst = (window.matchMedia &&
        (window.matchMedia('(pointer: coarse)').matches ||
         window.matchMedia('(hover: none)').matches)) ||
        window.innerWidth <= 860;
    if (!touchFirst) input.focus();
}

/* ══════════════ FORM DROPDOWNS ══════════════ */

/**
 * Renders a category string as emoji-only chip HTML.
 * If the category starts with an emoji, the chip shows only the emoji
 * by default and reveals the text label on hover / when active.
 * Categories that start with plain text are rendered normally.
 */
function categoryChipHTML(cat, extraClasses = '', extraAttrs = '') {
    const safe = escHtml(cat);
    // Match a leading emoji (one or more emoji codepoints + optional variation selector)
    const emojiMatch = cat.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})[\uFE0F\u200D\p{Emoji_Presentation}\p{Extended_Pictographic}]*/u);
    if (emojiMatch) {
        const emoji = escHtml(emojiMatch[0]);
        const label = escHtml(cat.slice(emojiMatch[0].length).trim());
        return `<div class="chip chip-emoji-only ${extraClasses}" data-value="${safe}" ${extraAttrs}>` +
            `<span class="chip-emoji">${emoji}</span>` +
            (label ? `<span class="chip-label">${label}</span>` : '') +
            `</div>`;
    }
    return `<div class="chip ${extraClasses}" data-value="${safe}" ${extraAttrs}>${safe}</div>`;
}


export function populateFormDropdowns() {
    const currencyInput = $('#input-currency');
    if (currencyInput && currencyInput.options.length === 0) {
        currencyInput.innerHTML = SUPPORTED_CURRENCIES.map(c =>
            `<option value="${c.code}" ${c.code === DEFAULT_CURRENCY ? 'selected' : ''}>${c.label}</option>`
        ).join('');
    }



    const visibleCategories = state.categories;
    const visibleTxnModes = state.txnModes;

    const catInput = $('#input-category');
    const catContainer = $('#category-chips');
    if (catContainer) {
        catContainer.innerHTML = visibleCategories.map(c => categoryChipHTML(c)).join('');

        $$('#category-chips .chip').forEach(chip => {
            chip.addEventListener('click', () => {
                setCategoryManuallyChanged(true);
                $$('#category-chips .chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                catInput.value = chip.dataset.value;
                if (typeof window.updateTxnTypeAuto === 'function') window.updateTxnTypeAuto();
            });
        });
    }

    const txnInput = $('#input-txn-type');
    const txnContainer = $('#txnmode-chips');
    if (txnContainer) {
        txnContainer.innerHTML = visibleTxnModes.map(t => categoryChipHTML(t)).join('');

        $$('#txnmode-chips .chip').forEach(chip => {
            chip.addEventListener('click', () => {
                setTxnModeManuallyChanged(true);
                $$('#txnmode-chips .chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                txnInput.value = chip.dataset.value;
            });
        });
    }

    const typeInput = $('#input-transaction-type');
    const typeContainer = $('#txntype-chips');
    let visibleTxnTypes = state.txnTypes || [];
    if (typeContainer) {
        visibleTxnTypes = visibleTxnTypes.filter(t => {
            if (t === 'Income' && state.hideIncome) return false;
            if (t === 'Investment' && state.hideInvestment) return false;
            if (t === 'Transfer' && state.hideTransfer) return false;
            return true;
        });

        typeContainer.innerHTML = visibleTxnTypes.map(t => {
            let short = t;
            if (t === 'Expense') short = 'Exp.';
            else if (t === 'Income') short = 'Inc.';
            else if (t === 'Refund') short = 'Ref.';
            else if (t === 'Investment') short = 'Inv.';
            else if (t === 'Transfer') short = 'Txfr.';
            return `<div class="chip txntype-${t.toLowerCase()}" data-value="${escHtml(t)}"><span class="chip-text-full">${escHtml(t)}</span><span class="chip-text-short">${escHtml(short)}</span></div>`;
        }).join('');

        $$('#txntype-chips .chip').forEach(chip => {
            chip.addEventListener('click', () => {
                setTxnTypeManuallyChanged(true);
                $$('#txntype-chips .chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                typeInput.value = chip.dataset.value;
                const amtInput = document.getElementById('input-amount');
                if (amtInput && amtInput.value) {
                    const currentEval = evaluateExpression(amtInput.value);
                    if (!isNaN(currentEval)) {
                        const t = chip.dataset.value;
                        if (t === 'Income' || t === 'Refund') {
                            if (currentEval > 0) amtInput.value = invertExpression(amtInput.value);
                        } else if (t === 'Investment') {
                            // Do nothing
                        } else {
                            if (currentEval < 0) amtInput.value = invertExpression(amtInput.value);
                        }
                    }
                }
            });
        });
    }

    if (visibleCategories.length > 0) {
        catInput.value = visibleCategories[0];
        syncChips('#category-chips', visibleCategories[0]);
    } else if (state.categories.length > 0) {
        catInput.value = state.categories[0];
    }
    
    if (visibleTxnModes.length > 0) {
        txnInput.value = visibleTxnModes[0];
        syncChips('#txnmode-chips', visibleTxnModes[0]);
    } else if (state.txnModes.length > 0) {
        txnInput.value = state.txnModes[0];
    }
    
    if (visibleTxnTypes && visibleTxnTypes.length > 0) {
        typeInput.value = visibleTxnTypes[0];
        syncChips('#txntype-chips', visibleTxnTypes[0]);
    }

    // Default dropdown state is untouched until user interacts
    setCategoryManuallyChanged(false);
    setTxnModeManuallyChanged(false);
    setTxnTypeManuallyChanged(false);

    // Populate trend filters in Charts View

    const trendCatEl = document.getElementById('trend-filter-category');
    if (trendCatEl) {
        const availableCats = state.categories;
        trendCatEl.innerHTML = '<div class="chip active" data-value="all">All Categories</div>' +
            availableCats.map(c => categoryChipHTML(c)).join('') +
            '<div class="chip" data-value="everything_else" style="display: none;">Everything else</div>';
        setupMultiSelectChips('#trend-filter-category');
    }
    const trendTxnEl = document.getElementById('trend-filter-txnmode');
    if (trendTxnEl) {
        const availableModes = state.txnModes;
        trendTxnEl.innerHTML = '<div class="chip active" data-value="all">All Modes</div>' +
            availableModes.map(t => categoryChipHTML(t)).join('') +
            '<div class="chip" data-value="everything_else" style="display: none;">Everything else</div>';
        setupMultiSelectChips('#trend-filter-txnmode');
    }

    populateNoteSuggestions();
    populateLocationSuggestions();
    populateTagSuggestions();
    populateFrequencyChips();
}

export function setupMultiSelectChips(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const allChips = container.querySelectorAll('.chip');
    const everythingElseChip = container.querySelector('.chip[data-value="everything_else"]');
    const allBtn = container.querySelector('.chip[data-value="all"]');

    const updateVisibility = () => {
        if (everythingElseChip && allBtn) {
            if (!allBtn.classList.contains('active')) {
                everythingElseChip.style.display = 'flex';
                everythingElseChip.style.alignItems = 'center';
            } else {
                everythingElseChip.style.display = 'none';
                everythingElseChip.classList.remove('active');
            }
        }
    };

    allChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const val = chip.dataset.value;
            if (val === 'all') {
                allChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
            } else {
                chip.classList.toggle('active');
                if (allBtn) allBtn.classList.remove('active');

                if (container.querySelectorAll('.chip.active:not([data-value="everything_else"])').length === 0 && allBtn) {
                    allChips.forEach(c => c.classList.remove('active'));
                    allBtn.classList.add('active');
                }
            }
            updateVisibility();
            renderChartsPage();
        });
    });
    
    updateVisibility();
}


export function populateNoteSuggestions() {
    const container = $('#note-suggestions');
    if (!container) return;

    container.innerHTML = '';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msPerDay = 1000 * 60 * 60 * 24;

    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - 6);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const noteCounts = {};
    const noteMinDaysAgo = {}; // Track the most recent occurrence
    const noteCanonical = {}; // Store the original casing of the most recent occurrence

    let scannedCount = 0;
    state.expenses.forEach(e => {
        if (!e.date || e.date < cutoffStr) return; // skip transactions older than 6 months

        // Exclude Refund/Schedule/QuickAdd transactions from note suggestions
        if (isExcludedSuggestionSource(e)) return;

        scannedCount++;
        const raw = (e.note || '').trim();
        if (!raw) return;

        const key = raw.toLowerCase();

        const txnDate = new Date(e.date);
        txnDate.setHours(0, 0, 0, 0);
        const daysAgo = Math.max(0, (today - txnDate) / msPerDay);

        noteCounts[key] = (noteCounts[key] || 0) + 1;
        noteMinDaysAgo[key] = Math.min(noteMinDaysAgo[key] ?? Infinity, daysAgo);
        noteCanonical[key] = raw; // last-seen casing wins
    });

    const frequentItems = Object.keys(noteCounts)
        .filter(key => noteCounts[key] >= 2)
        .map(key => {
            const count = noteCounts[key];
            const recentDaysAgo = noteMinDaysAgo[key];
            // Calculate a recentness multiplier (1.0 for today, 0.0 for 180 days ago)
            const recentness = Math.max(0, 180 - recentDaysAgo) / 180;

            // Explicitly weight by BOTH occurrences and recentness
            const score = count * recentness;

            return { key, count, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // Cap at 10 suggestions

    const frequent = frequentItems.map(item => item.key);

    console.log(`[Note Suggestions] Scanned ${scannedCount} transactions (last 6 months) out of ${state.expenses.length} total, found ${frequent.length} suggestions:`, frequentItems);

    if (frequent.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    container.innerHTML = frequent.map(key => {
        const count = noteCounts[key];
        const label = escHtml(noteCanonical[key]);
        return `<div class="chip note-chip" data-value="${label}" title="Used ${count} times">${label}</div>`;
    }).join('');

    // Click to fill note input
    container.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            if (getIsFormSubmitting()) return;
            recordFormFillTime();
            const noteInput = $('#input-note');
            const val = chip.dataset.value;
            // Toggle: if already selected, deselect
            if (chip.classList.contains('active')) {
                chip.classList.remove('active');
                noteInput.value = '';
            } else {
                container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                noteInput.value = val;
            }
            noteInput.dispatchEvent(new Event('input'));
            focusSuggestionInputOnDesktop(noteInput);
        });
    });
}

export function populateLocationSuggestions() {
    const container = $('#location-suggestions');
    if (!container) return;

    const locCounts = {};
    const locMinDaysAgo = {}; 
    const locCanonical = {}; 

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 1000 * 60 * 60 * 24;

    const cutoff = new Date(today);
    cutoff.setMonth(cutoff.getMonth() - 6);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    state.expenses.forEach(e => {
        if (!e.date || e.date < cutoffStr) return;

        if (isExcludedSuggestionSource(e)) return;

        const raw = (e.location || '').trim();
        if (!raw) return;

        const key = raw.toLowerCase();

        const txnDate = new Date(e.date);
        txnDate.setHours(0, 0, 0, 0);
        const daysAgo = Math.max(0, (today - txnDate) / msPerDay);

        locCounts[key] = (locCounts[key] || 0) + 1;
        locMinDaysAgo[key] = Math.min(locMinDaysAgo[key] ?? Infinity, daysAgo);
        locCanonical[key] = raw; 
    });

    const frequentItems = Object.keys(locCounts)
        .map(key => {
            const count = locCounts[key];
            const recentDaysAgo = locMinDaysAgo[key];
            const recentness = Math.max(0, 180 - recentDaysAgo) / 180;
            const score = count * recentness;
            return { key, count, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8); // Cap at 8 suggestions

    const frequent = frequentItems.map(item => item.key);

    if (frequent.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    container.innerHTML = frequent.map(key => {
        const count = locCounts[key];
        const label = escHtml(locCanonical[key]);
        return `<div class="chip note-chip" data-value="${label}" title="Used ${count} times">📍 ${label}</div>`;
    }).join('');

    container.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            if (getIsFormSubmitting()) return;
            recordFormFillTime();
            const locInput = $('#input-location');
            const val = chip.dataset.value;
            if (chip.classList.contains('active')) {
                chip.classList.remove('active');
                locInput.value = '';
            } else {
                container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                locInput.value = val;
            }
            focusSuggestionInputOnDesktop(locInput);
        });
    });
}

export function populateTagSuggestions() {
    const container = $('#tag-suggestions');
    if (!container) return;

    const tagCounts = {};
    const tagCanonical = {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setMonth(cutoff.getMonth() - 3);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const processItem = (item) => {
        if (!item) return;
        if (!item.date || item.date < cutoffStr) return;
        if (isExcludedSuggestionSource(item)) return;

        const raw = (item.tag || '').trim();
        if (!raw) return;
        const key = raw.toLowerCase();
        tagCounts[key] = (tagCounts[key] || 0) + 1;
        tagCanonical[key] = raw; // track latest canonical casing
    };

    if (Array.isArray(state.expenses)) {
        state.expenses.forEach(processItem);
    }

    // Order by number of occurrences descending, then alphabetically, limit 5
    const topTags = Object.keys(tagCounts)
        .sort((a, b) => {
            const countDiff = tagCounts[b] - tagCounts[a];
            if (countDiff !== 0) return countDiff;
            return a.localeCompare(b);
        })
        .slice(0, 5);

    if (topTags.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    container.innerHTML = topTags.map(key => {
        const count = tagCounts[key];
        const label = escHtml(tagCanonical[key]);
        return `<div class="chip note-chip" data-value="${label}" title="Used ${count} time${count > 1 ? 's' : ''}">🏷️ ${label}</div>`;
    }).join('');

    container.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            if (getIsFormSubmitting()) return;
            recordFormFillTime();
            const tagInput = $('#input-tag');
            const val = chip.dataset.value;
            if (chip.classList.contains('active')) {
                chip.classList.remove('active');
                tagInput.value = '';
            } else {
                container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                tagInput.value = val;
            }
            focusSuggestionInputOnDesktop(tagInput);
        });
    });
}


export function syncChips(containerSelector, value) {
    $$(`${containerSelector} .chip`).forEach(chip => {
        if (chip.dataset.value === value) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}


export function renderCalendar() {
    const container = $('#cal-days-container');
    if (!container) return;

    const year = state.calViewDate.getFullYear();
    const month = state.calViewDate.getMonth();

    if (typeof updateTimeFilterUI === 'function') updateTimeFilterUI();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = '';

    for (let i = 0; i < firstDay; i++) {
        html += `<div class="cal-day empty"></div>`;
    }

    const selectedDate = $('#input-date').value;
    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isActive = dateStr === selectedDate ? 'active' : '';
        const isToday = dateStr === todayStr ? 'today' : '';
        html += `<div class="cal-day ${isActive} ${isToday}" data-date="${dateStr}">${d}</div>`;
    }

    container.innerHTML = html;

    $$('.cal-day:not(.empty)').forEach(el => {
        el.addEventListener('click', () => {
            $('#input-date').value = el.dataset.date;
            $('#input-date').dispatchEvent(new Event('change'));
            renderCalendar();
        });
    });
}

export function populateFrequencyChips() {
    const freqInput = $('#input-frequency');
    const freqContainer = $('#frequency-chips');
    if (!freqContainer || !freqInput) return;

    const frequencies = [
        { value: 'one-off', label: 'One-off', emoji: '⏹️' },
        { value: 'instant', label: 'Quick Add', emoji: '⚡' },
        { value: 'daily', label: 'Daily', emoji: '📅' },
        { value: 'weekly', label: 'Weekly', emoji: '🗓️' },
        { value: 'biweekly', label: 'Biweekly', emoji: '🔄' },
        { value: 'monthly', label: 'Monthly', emoji: '📆' },
        { value: 'bimonthly', label: 'Bimonthly', emoji: '⏳' },
        { value: 'quarterly', label: 'Quarterly', emoji: '📦' },
        { value: 'yearly', label: 'Yearly', emoji: '🎂' }
    ];

    freqContainer.innerHTML = frequencies.map(f =>
        `<div class="frequency-chip" data-value="${f.value}">
            <span class="chip-emoji">${f.emoji}</span>
            <span>${f.label}</span>
         </div>`
    ).join('');

    const chips = freqContainer.querySelectorAll('.frequency-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            freqInput.value = chip.dataset.value;
            freqInput.dispatchEvent(new Event('change'));
        });
    });

    freqInput.addEventListener('change', () => {
        const val = freqInput.value || 'one-off';
        chips.forEach(c => {
            if (c.dataset.value === val) {
                c.classList.add('active');
            } else {
                c.classList.remove('active');
            }
        });
    });

    // Initialize active state
    const val = freqInput.value || 'one-off';
    const activeChip = freqContainer.querySelector(`.frequency-chip[data-value="${val}"]`);
    if (activeChip) activeChip.classList.add('active');
}

