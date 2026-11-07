import { applyAutoTag } from '../utils/auto_tag.js';
import { updateUserSettings } from '../services/user_settings.js';
import { getStorage, ref, getDownloadURL, listAll } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { fetchYearCSVIfNeeded, loadMetadata, amountToStr, roundAmount, csvEscape, saveScheduledCSV, processScheduledTransactions, uploadFile, expensesToCSV, normalizeRow } from "../services/storage.js";
import { getUserEmail, getRequiredEmail } from "../services/auth.js";
import { switchView } from "./navigation.js";
import { parseLocalDate, formatDate, toast, calculateNextRunDate, getLocalDateString, getCategoryForMerchant, getTxnTypeForMerchant, getLastLocation, mapTxnMode, getDistance, getCurrentLocationTag, resetLocationPermissionDenied, getTxnModeForMerchant, findMatchingKeywordRule, isRefundTxn, normalizeTxnType } from "../utils/helpers.js";
import { $, hideLoader, showLoader, $$ } from "../core/init.js";
import { state } from "../core/state.js";
import { populateFormDropdowns, syncChips, renderCalendar } from "./form_dropdowns.js";
import { renderSettings } from "./settings.js";
import { renderSelectedDayTransactions } from "./dashboard.js";
import { renderAll } from "./render_all.js";
import { USE_LOCAL_DATA } from "../../config.js";
import { getTxnTypeFromMapping } from "../utils/txn_mode_mapping.js";
import { getRawSmsSuggestionsForDate, consumeRawSmsTransaction, discardRawSmsTransaction, isDuplicateTxn, recomputePendingSmsTransactions } from "./sms_approval.js";

/* ══════════════ FORM ══════════════ */
let currentSuggestionSource = '';
let currentSuggestionTxnId = '';
let currentSelectedSuggestionTxn = null;
let isFormSubmitting = false;
let lastSubmitStartTime = 0;
let lastFormFillTime = 0;

// Track manual user modifications in Add form to prevent inference from overwriting them
let isCategoryManuallyChanged = false;
let isTxnModeManuallyChanged = false;
let isTxnTypeManuallyChanged = false;

export function setCategoryManuallyChanged(val = true) {
    isCategoryManuallyChanged = !!val;
}
export function setTxnModeManuallyChanged(val = true) {
    isTxnModeManuallyChanged = !!val;
}
export function setTxnTypeManuallyChanged(val = true) {
    isTxnTypeManuallyChanged = !!val;
}
export function getCategoryManuallyChanged() {
    return isCategoryManuallyChanged;
}
export function getTxnModeManuallyChanged() {
    return isTxnModeManuallyChanged;
}
export function getTxnTypeManuallyChanged() {
    return isTxnTypeManuallyChanged;
}

/**
 * Returns whether form is currently submitting (saving to cloud)
 */
export function getIsFormSubmitting() {
    return isFormSubmitting;
}

/**
 * Record timestamp when form values are populated (e.g. from suggestions)
 */
export function recordFormFillTime() {
    lastFormFillTime = Date.now();
}

/**
 * Toggle form submitting state, lock inputs/buttons, and prevent race condition clicks
 */
export function setFormSubmittingState(submitting) {
    isFormSubmitting = submitting;
    const form = $('#expense-form');
    const btnSubmit = $('#btn-submit');
    const btnCancel = $('#btn-cancel');
    const smsSuggestionsContainer = $('#sms-suggestions-container');
    const noteSuggestions = $('#note-suggestions');
    const locationSuggestions = $('#location-suggestions');
    const tagSuggestions = $('#tag-suggestions');

    if (submitting) {
        lastSubmitStartTime = Date.now();
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.dataset.origText = btnSubmit.textContent;
            btnSubmit.textContent = 'Saving...';
        }
        if (btnCancel) btnCancel.disabled = true;

        if (form) form.classList.add('form-submitting');
        if (smsSuggestionsContainer) smsSuggestionsContainer.classList.add('form-submitting');
        if (noteSuggestions) noteSuggestions.classList.add('form-submitting');
        if (locationSuggestions) locationSuggestions.classList.add('form-submitting');
        if (tagSuggestions) tagSuggestions.classList.add('form-submitting');
    } else {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            updateFormActionButtons();
        }
        if (btnCancel) btnCancel.disabled = false;

        if (form) form.classList.remove('form-submitting');
        if (smsSuggestionsContainer) smsSuggestionsContainer.classList.remove('form-submitting');
        if (noteSuggestions) noteSuggestions.classList.remove('form-submitting');
        if (locationSuggestions) locationSuggestions.classList.remove('form-submitting');
        if (tagSuggestions) tagSuggestions.classList.remove('form-submitting');
    }
}

/**
 * Evaluate a mathematical expression (e.g., "127+100+30")
 * Returns the calculated value as a number
 */
export function evaluateExpression(expr) {
    if (!expr || typeof expr !== 'string') return 0;
    
    // If it's just a plain number without operators or parentheses, return it directly
    const plainNum = parseFloat(expr);
    if (!isNaN(plainNum) && !/[+\-*/()]/.test(expr)) {
        return plainNum;
    }
    
    try {
        // Remove whitespace and validate expression contains only allowed arithmetic characters: digits, ., +, -, *, /, (, )
        const cleaned = expr.replace(/\s/g, '');
        if (!/^[\d.+\-*/()]+$/.test(cleaned)) {
            return isNaN(plainNum) ? 0 : plainNum;
        }

        // Tokenize stream
        const tokens = [];
        let i = 0;
        while (i < cleaned.length) {
            const ch = cleaned[i];
            if ('+-*/()'.includes(ch)) {
                tokens.push(ch);
                i++;
            } else if (/[0-9.]/.test(ch)) {
                let numStr = '';
                while (i < cleaned.length && /[0-9.]/.test(cleaned[i])) {
                    numStr += cleaned[i];
                    i++;
                }
                tokens.push(parseFloat(numStr) || 0);
            } else {
                i++;
            }
        }

        let pos = 0;
        const peek = () => tokens[pos];
        const consume = (expected) => {
            const t = tokens[pos];
            if (expected !== undefined && t !== expected) {
                throw new Error('Unexpected token: ' + t);
            }
            pos++;
            return t;
        };

        // Grammar: expr -> term (( '+' | '-' ) term)*
        function parseExpression() {
            let left = parseTerm();
            while (peek() === '+' || peek() === '-') {
                const op = consume();
                const right = parseTerm();
                if (op === '+') left += right;
                else left -= right;
            }
            return left;
        }

        // Grammar: term -> factor (( '*' | '/' ) factor)*
        function parseTerm() {
            let left = parseFactor();
            while (peek() === '*' || peek() === '/') {
                const op = consume();
                const right = parseFactor();
                if (op === '*') {
                    left *= right;
                } else {
                    left = right !== 0 ? left / right : 0;
                }
            }
            return left;
        }

        // Grammar: factor -> ('+' | '-')? ( NUMBER | '(' expr ')' )
        function parseFactor() {
            if (peek() === '+') {
                consume('+');
                return parseFactor();
            }
            if (peek() === '-') {
                consume('-');
                return -parseFactor();
            }
            if (peek() === '(') {
                consume('(');
                const val = parseExpression();
                consume(')');
                return val;
            }
            const t = consume();
            if (typeof t === 'number') return t;
            return 0;
        }

        const res = parseExpression();
        return isFinite(res) ? res : (isNaN(plainNum) ? 0 : plainNum);
    } catch (e) {
        return isNaN(plainNum) ? 0 : plainNum;
    }
}

export async function saveYearCSV(year) {
    if (USE_LOCAL_DATA) {
        toast('Running locally: Cloud sync disabled', 'info');
        return;
    }
    // Guard against undefined, null, or invalid year arguments to prevent creating invalid cloud files like 'undefined.csv'
    if (!year || typeof year !== 'string' || year === 'undefined') {
        console.warn('[Storage] saveYearCSV called with missing or invalid year:', year, '- defaulting to current year');
        year = new Date().getFullYear().toString();
    }

    // Always sort state.expenses date descending
    state.expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const yearExpenses = state.expenses.filter(e => e.date && e.date.startsWith(year));
    const trashed = (state.trash || []).filter(e => e.date && e.date.startsWith(year)).map(e => ({...e, deleted: true}));
    const csvContent = expensesToCSV(yearExpenses.concat(trashed));

    const userEmail = getRequiredEmail();
    const fileRef = ref(state.storage, `${userEmail}/${year}.csv`);
    await uploadFile(fileRef, csvContent);
}

export async function saveMetadataCSV() {
    if (USE_LOCAL_DATA) return;
    const header = 'Type,Value\n';
    const catRows = state.categories.map(c => `Category,${csvEscape(c)}`);
    const txnRows = state.txnModes.map(c => `Transaction Mode,${csvEscape(c)}`);
    const csvContent = header + catRows.concat(txnRows).join('\n');
    const userEmail = getRequiredEmail();
    const fileRef = ref(state.storage, `${userEmail}/metadata.csv`);
    await uploadFile(fileRef, csvContent);
}

export async function saveLocationCSV() {
    if (USE_LOCAL_DATA) return;
    const header = 'tag,lat,lon,radius\n';
    const rows = state.locationsConfig.map(c => `${csvEscape(c.tag)},${c.lat},${c.lon},${c.radius}`);
    const csvContent = header + rows.join('\n');
    const userEmail = getRequiredEmail();
    const fileRef = ref(state.storage, `${userEmail}/location.csv`);
    await uploadFile(fileRef, csvContent);
}

export async function bulkUpdateCSVs(field, oldValue, newValue) {
    if (USE_LOCAL_DATA) return;
    const userEmail = getRequiredEmail();
    const storageRef = ref(state.storage, `${userEmail}/`);
    const res = await listAll(storageRef);

    const yearFiles = res.items.filter(itemRef => /^\d{4}\.csv$/.test(itemRef.name));

    for (const fileRef of yearFiles) {
        try {
            const url = await getDownloadURL(fileRef);
            const response = await fetch(url);
            if (!response.ok) continue;
            const text = await response.text();

            const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
            let modified = false;

            parsed.data.forEach(row => {
                let actualField = field === 'category' ? 'Category' : 'Transaction Mode';
                if (row[actualField] === oldValue) {
                    row[actualField] = newValue || '';
                    modified = true;
                }
            });

            if (modified) {
                // Re-normalise each raw Papa row so Transaction Type is preserved
                const normalized = parsed.data.map(normalizeRow).filter(r => r !== null);
                const newCsv = expensesToCSV(normalized);
                await uploadFile(fileRef, newCsv);
            }
        } catch (e) {
            console.error('Error bulk updating file:', fileRef.name, e);
        }
    }
}

export function setupForm() {
    const form = $('#expense-form');
    setupAddFormChipScrollbars();
    syncFormExtraOptionsForViewport();
    if (!window.__formExtraOptionsResizeBound) {
        window.__formExtraOptionsResizeBound = true;
        window.addEventListener('resize', syncFormExtraOptionsForViewport, { passive: true });
    }

    const autoTagToggle = $('#form-auto-tag-toggle');
    if (autoTagToggle && !autoTagToggle.dataset.bound) {
        autoTagToggle.dataset.bound = 'true';
        autoTagToggle.addEventListener('click', async () => {
            if (!state.autoTag) return;
            state.autoTagEnabled = !state.autoTagEnabled;
            localStorage.setItem('expman_auto_tag_enabled', state.autoTagEnabled ? 'true' : 'false');
            syncFormAutoTagTool();
            try {
                await updateUserSettings({ autoTag: { tag: state.autoTag, enabled: state.autoTagEnabled } });
            } catch (err) {
                console.error('Failed to sync auto tagging setting', err);
                toast('Could not sync auto tagging setting', 'error');
            }
            toast(state.autoTagEnabled ? `Auto tagging enabled for “${state.autoTag}”` : 'Auto tagging disabled', 'info');
        });
    }
    syncFormAutoTagTool();

    // Restrict amount input to numbers and math operators
    $('#input-amount')?.addEventListener('input', function(e) {
        this.value = this.value.replace(/[^0-9.+\-]/g, '');
    });

    // Auto-detect location button in form
    const btnDetectLoc = $('#btn-detect-location');
    if (btnDetectLoc) {
        btnDetectLoc.addEventListener('click', async () => {
            resetLocationPermissionDenied();
            btnDetectLoc.disabled = true;
            btnDetectLoc.innerHTML = '<span>⏳ Locating...</span>';
            try {
                const tag = await getCurrentLocationTag({ explicit: true });
                if (tag) {
                    const locInput = $('#input-location');
                    if (locInput) locInput.value = tag;
                    toast(`📍 Location detected: ${tag}`, 'success');
                } else {
                    toast('No matching location configured', 'info');
                }
            } catch (err) {
                toast('Failed to detect location', 'error');
            } finally {
                btnDetectLoc.disabled = false;
                btnDetectLoc.innerHTML = '<span>📍 Detect</span>';
            }
        });
    }

    // Populate select options for days
    let daysHtml = '';
    for (let i = 1; i <= 31; i++) daysHtml += `<option value="${i}">${i}</option>`;
    if ($('#input-freq-day')) $('#input-freq-day').innerHTML = daysHtml;
    if ($('#input-freq-yearly-day')) $('#input-freq-yearly-day').innerHTML = daysHtml;

    const freqInput = $('#input-frequency');

    const syncEndConditions = (source) => {
        const enableCb = $('#input-end-enable');
        const dateInput = $('#input-end-date');
        const occInput = $('#input-max-occurrences');
        const inputsContainer = $('#end-condition-inputs');
        if (!enableCb || !dateInput || !occInput) return;

        if (!enableCb.checked) {
            dateInput.disabled = true;
            occInput.disabled = true;
            if (inputsContainer) inputsContainer.style.opacity = '0.5';
            return;
        }

        dateInput.disabled = false;
        occInput.disabled = false;
        if (inputsContainer) inputsContainer.style.opacity = '1';

        const frequency = freqInput ? freqInput.value : 'one-off';
        const startDate = $('#input-date') ? $('#input-date').value : '';
        
        if (dateInput && startDate) {
            dateInput.min = startDate;
        }

        if (!startDate || frequency === 'one-off' || frequency === 'instant') return;

        let entry = {
            frequency,
            recur_month: parseInt($('#input-freq-month').value),
            recur_day: (['monthly', 'bimonthly', 'quarterly'].includes(frequency)) ? parseInt($('#input-freq-day').value) : parseInt($('#input-freq-yearly-day').value),
            recur_weekdays: Array.from(document.querySelectorAll('.weekday-btn.selected')).map(b => parseInt(b.dataset.val)).sort((a,b) => a-b)
        };
        entry.recur_weekday = entry.recur_weekdays.length > 0 ? entry.recur_weekdays[0] : NaN;

        if (source === 'date') {
            let endDate = dateInput.value;
            if (!endDate) return;
            if (endDate < startDate) {
                dateInput.type = 'date';
                dateInput.value = startDate;
                endDate = startDate;
            }
            
            let count = 0;
            let currentNext = calculateNextRunDate(frequency, entry, startDate, true);
            let maxLoops = 10000;
            while (currentNext <= endDate && count < maxLoops) {
                count++;
                let next = calculateNextRunDate(frequency, entry, currentNext);
                if (next <= currentNext) break;
                currentNext = next;
            }
            occInput.value = count;
        } else if (source === 'occurrences') {
            let count = parseInt(occInput.value);
            if (isNaN(count) || count < 1) return;

            let currentNext = calculateNextRunDate(frequency, entry, startDate, true);
            let maxLoops = 10000;
            let c = 1;
            while (c < count && c < maxLoops) {
                let next = calculateNextRunDate(frequency, entry, currentNext);
                if (next <= currentNext) break;
                currentNext = next;
                c++;
            }
            dateInput.type = 'date';
            dateInput.value = currentNext;
        }
    };

        const updateRecurrenceFields = () => {
        if (!freqInput) return;
        const val = freqInput.value;
        const wrapper = $('#freq-options-wrapper');
        
        if (wrapper) {
            wrapper.style.display = (val === 'one-off') ? 'none' : 'flex';
        }

        $('#freq-weekly-options').style.display = 'none';
        $('#freq-monthly-options').style.display = 'none';
        $('#freq-yearly-options').style.display = 'none';

        if (['weekly', 'biweekly'].includes(val)) $('#freq-weekly-options').style.display = 'block';
        if (['monthly', 'bimonthly', 'quarterly'].includes(val)) $('#freq-monthly-options').style.display = 'block';
        if (val === 'yearly') $('#freq-yearly-options').style.display = 'flex';

        const dateVal = $('#input-date').value;
        if (dateVal && val !== 'one-off' && val !== 'instant') {
            const d = parseLocalDate(dateVal);
            if (['weekly', 'biweekly'].includes(val)) {
                const currentDay = d.getDay();
                let btn = document.querySelector(`.weekday-btn[data-val="${currentDay}"]`);
                if (btn) btn.classList.add('selected');
            } else if (['monthly', 'bimonthly', 'quarterly'].includes(val)) {
                $('#input-freq-day').value = d.getDate();
                $('#input-freq-day').disabled = false;
            } else if (val === 'yearly') {
                $('#input-freq-yearly-day').value = d.getDate();
                $('#input-freq-month').value = d.getMonth() + 1;
                $('#input-freq-yearly-day').disabled = false;
                $('#input-freq-month').disabled = false;
            }
        }

        const hint = $('#freq-start-date-hint');
        if (hint) {
            const recurringFreqs = ['daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'yearly'];
            hint.style.display = recurringFreqs.includes(val) ? 'block' : 'none';
            if (recurringFreqs.includes(val) && dateVal) {
                hint.innerHTML = `Starting from <strong style="color: var(--accent);">${formatDate(dateVal)}</strong>`;
            } else {
                hint.textContent = 'Select a start date on the calendar above.';
            }
        }

        const qaHint = $('#freq-quick-add-hint');
        if (qaHint) {
            qaHint.style.display = val === 'instant' ? 'block' : 'none';
        }

        const endConditionGroup = $('#end-condition-group');
        if (endConditionGroup) {
            if (val === 'one-off' || val === 'instant') {
                endConditionGroup.style.display = 'none';
            } else {
                endConditionGroup.style.display = 'block';
                syncEndConditions('occurrences');
            }
        }
    };

    if ($('#input-end-enable')) {
        $('#input-end-enable').addEventListener('change', () => syncEndConditions('occurrences'));
    }
    if ($('#input-end-date')) {
        $('#input-end-date').addEventListener('change', () => syncEndConditions('date'));
    }
    if ($('#input-max-occurrences')) {
        $('#input-max-occurrences').addEventListener('input', () => syncEndConditions('occurrences'));
    }

    if (freqInput) {
        freqInput.addEventListener('change', () => {
            updateRecurrenceFields();
            updateFormActionButtons();
        });
        updateFormActionButtons();
    }

    const adjustStartDateFromRecurrence = () => {
        if (!freqInput) return;
        const val = freqInput.value;
        const dateVal = $('#input-date').value;
        if (!dateVal) return;
        const d = parseLocalDate(dateVal);

        if (['weekly', 'biweekly'].includes(val)) {
            let selectedBtns = Array.from(document.querySelectorAll('.weekday-btn.selected'));
            if (selectedBtns.length === 0) return;
            let selectedDays = selectedBtns.map(b => parseInt(b.dataset.val)).sort((a,b) => a-b);
            
            const currentWeekday = d.getDay();
            let nextWeekday = selectedDays.find(w => w >= currentWeekday);
            let diff;
            if (nextWeekday !== undefined) {
                diff = nextWeekday - currentWeekday;
            } else {
                diff = (7 - currentWeekday) + selectedDays[0];
            }
            d.setDate(d.getDate() + diff);
        } else if (['monthly', 'bimonthly', 'quarterly'].includes(val)) {
            const targetDay = parseInt($('#input-freq-day').value);
            d.setDate(targetDay);
        } else if (val === 'yearly') {
            const targetDay = parseInt($('#input-freq-yearly-day').value);
            const targetMonth = parseInt($('#input-freq-month').value) - 1;
            d.setMonth(targetMonth);
            d.setDate(targetDay);
        }

        const newDateStr = getLocalDateString(d);
        if (newDateStr !== dateVal) {
            $('#input-date').value = newDateStr;
            $('#input-date').dispatchEvent(new Event('change'));
        }
    };

    document.querySelectorAll('.weekday-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('selected');
            let selectedBtns = document.querySelectorAll('.weekday-btn.selected');
            if (selectedBtns.length === 0) {
                btn.classList.add('selected'); // prevent zero selection
                return;
            }
            adjustStartDateFromRecurrence();
        });
    });

    if ($('#input-freq-day')) $('#input-freq-day').addEventListener('change', adjustStartDateFromRecurrence);
    if ($('#input-freq-yearly-day')) $('#input-freq-yearly-day').addEventListener('change', adjustStartDateFromRecurrence);
    if ($('#input-freq-month')) $('#input-freq-month').addEventListener('change', adjustStartDateFromRecurrence);

    // Auto-update selected day's transactions
    $('#input-date').addEventListener('change', () => {
        updateRecurrenceFields();
        renderSelectedDayTransactions();
        renderSmsSuggestions();
        updateFormActionButtons();
        if (typeof renderCalendar === 'function') renderCalendar();

        const inputDate = $('#input-date').value;
        const todayStr = getLocalDateString();

        let yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = getLocalDateString(yesterday);

        let tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = getLocalDateString(tomorrow);

        $('#btn-date-yesterday')?.classList.toggle('active', inputDate === yesterdayStr);
        $('#btn-date-today')?.classList.toggle('active', inputDate === todayStr);
        $('#btn-date-tomorrow')?.classList.toggle('active', inputDate === tomorrowStr);
    });

    // Old Calendar navigation removed

    $('#btn-date-yesterday')?.addEventListener('click', () => {
        let d = new Date();
        d.setDate(d.getDate() - 1);
        $('#input-date').value = getLocalDateString(d);
        $('#input-date').dispatchEvent(new Event('change'));
        state.calViewDate = new Date(d);
        renderCalendar();
        fetchYearCSVIfNeeded(d.getFullYear());
    });
    $('#btn-date-today')?.addEventListener('click', () => {
        let d = new Date();
        $('#input-date').value = getLocalDateString(d);
        $('#input-date').dispatchEvent(new Event('change'));
        state.calViewDate = new Date(d);
        renderCalendar();
        fetchYearCSVIfNeeded(d.getFullYear());
    });
    $('#btn-date-tomorrow')?.addEventListener('click', () => {
        let d = new Date();
        d.setDate(d.getDate() + 1);
        $('#input-date').value = getLocalDateString(d);
        $('#input-date').dispatchEvent(new Event('change'));
        state.calViewDate = new Date(d);
        renderCalendar();
        fetchYearCSVIfNeeded(d.getFullYear());
    });

    const today = getLocalDateString();
    $('#input-date').value = today;
    $('#input-date').dispatchEvent(new Event('change'));
    prefillLocation();

    $('#input-amount')?.addEventListener('input', (e) => {
        const val = e.target.value;
        const errEl = $('#amount-error');
        if (val && !/^(-?)(\d+\.?\d*)([+\-*](\d+\.?\d*))*$/.test(val)) {
            if (errEl) errEl.style.display = 'block';
        } else {
            if (errEl) errEl.style.display = 'none';
        }
        updateTxnTypeAuto();
    });

    $('#input-note')?.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val) {
            // Only infer category if left untouched by user
            if (!isCategoryManuallyChanged && !currentSelectedSuggestionTxn) {
                let fallbackCategory = state.categories.find(c => c.toLowerCase().includes('other')) || 'Others';
                let bestMatch = getCategoryForMerchant(val);
                if (!state.categories.includes(bestMatch)) bestMatch = state.categories[0];
                
                if (bestMatch !== fallbackCategory) {
                    $('#input-category').value = bestMatch;
                    syncChips('#category-chips', bestMatch);
                }
            }

            // Only infer transaction type if left untouched by user
            if (!isTxnTypeManuallyChanged && !currentSelectedSuggestionTxn) {
                const currentTxnType = $('#input-transaction-type').value;
                let bestTxnType = getTxnTypeForMerchant(val, currentTxnType);
                if (bestTxnType && bestTxnType !== currentTxnType) {
                    $('#input-transaction-type').value = bestTxnType;
                    syncChips('#txntype-chips', bestTxnType);
                }
            }

            // Only infer transaction mode if left untouched by user and custom mapping specifies txnMode
            if (!isTxnModeManuallyChanged && !currentSelectedSuggestionTxn) {
                const rule = findMatchingKeywordRule(val);
                if (rule && rule.txnMode) {
                    const mappedMode = getTxnModeForMerchant(val, null, state.txnModes);
                    if (mappedMode && state.txnModes.includes(mappedMode)) {
                        $('#input-txn-type').value = mappedMode;
                        syncChips('#txnmode-chips', mappedMode);
                    }
                }
            }
        }
    });

    $('#input-category')?.addEventListener('change', () => {
        isCategoryManuallyChanged = true;
    });
    $('#input-txn-type')?.addEventListener('change', () => {
        isTxnModeManuallyChanged = true;
    });
    $('#input-transaction-type')?.addEventListener('change', () => {
        isTxnTypeManuallyChanged = true;
    });

    // We can expose updateTxnTypeAuto globally for category changes
    window.updateTxnTypeAuto = updateTxnTypeAuto;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Block submissions if already submitting or if cloud sync is refreshing data
        if (isFormSubmitting || state.cloudSyncInProgress) {
            if (state.cloudSyncInProgress) toast('Please wait for cloud sync to complete...', 'error');
            return;
        }

        // Manual validation for required fields
        if (!$('#input-date').value) {
            toast('Please select a Date', 'error');
            return;
        }
        if (!$('#input-category').value) {
            toast('Please select a Category', 'error');
            return;
        }
        if (!$('#input-transaction-type').value) {
            toast('Please select a Transaction Type', 'error');
            return;
        }
        const rawAmount = $('#input-amount').value;
        if (!rawAmount) {
            toast('Please enter an amount', 'error');
            return;
        }
        const parsedAmt = roundAmount(evaluateExpression(rawAmount));
        if (isNaN(parsedAmt)) {
            toast('Please enter a valid amount', 'error');
            return;
        }

        const idx = parseInt($('#edit-index').value);
        const sIdxElement = $('#edit-scheduled-index');
        const sIdx = sIdxElement ? parseInt(sIdxElement.value) : -1;

        const frequency = $('#input-frequency')?.value || 'one-off';
        const isFutureDate = $('#input-date') && $('#input-date').value > getLocalDateString();
        const scheduleMode = sIdx >= 0 || frequency !== 'one-off' || (frequency === 'one-off' && isFutureDate);

        // Lock form inputs, disable buttons, and prevent race condition clicks
        setFormSubmittingState(true);

        try {
            if (scheduleMode) {
                const startDate = $('#input-date').value;
                const amountInputValue = $('#input-amount').value;
                const entry = {
                    id: sIdx >= 0 ? state.scheduledTransactions[sIdx].id : Date.now().toString(),
                    date: startDate,
                    amount: (() => {
                        let a = roundAmount(evaluateExpression(amountInputValue));
                        const t = $('#input-transaction-type').value;
                        if (t === 'Income' || t === 'Refund') return -Math.abs(a);
                        if (t === 'Investment') return a;
                        return Math.abs(a);
                    })(),
                    amountExpression: amountInputValue.split(/[-+]/).filter(Boolean).length > 1 ? amountInputValue.trim() : '',
                    currency: $('#input-currency').value,
                    category: $('#input-category').value,
                    txnType: $('#input-transaction-type').value,
                    txnMode: $('#input-txn-type').value,
                    note: $('#input-note').value.trim(),
                    location: $('#input-location').value.trim() || await getCurrentLocationTag(),
                    tag: $('#input-tag')?.value.trim() || '',
                    frequency: frequency,
                    end_condition: $('#input-end-enable') && $('#input-end-enable').checked ? 'enabled' : 'never',
                    end_date: $('#input-end-date') ? $('#input-end-date').value : '',
                    max_occurrences: $('#input-max-occurrences') && $('#input-max-occurrences').value ? parseInt($('#input-max-occurrences').value) : NaN,
                };

                if (frequency === 'instant') {
                    // For instant templates, do not store start_date, last_run_date, next_run_date, or any recurrence fields
                    entry.start_date = '';
                    entry.last_run_date = '';
                    entry.next_run_date = '';
                    entry.recur_month = NaN;
                    entry.recur_day = NaN;
                    entry.recur_weekday = NaN;
                } else if (frequency === 'one-off') {
                    // For one-off schedules, store start_date and next_run_date but no recurrence fields
                    entry.start_date = startDate;
                    entry.last_run_date = sIdx >= 0 ? state.scheduledTransactions[sIdx].last_run_date : '';
                    entry.next_run_date = startDate;
                    entry.recur_month = NaN;
                    entry.recur_day = NaN;
                    entry.recur_weekday = NaN;
                } else {
                    // Recurring schedules store all dates and recurrence settings
                    entry.start_date = startDate;
                    entry.last_run_date = sIdx >= 0 ? state.scheduledTransactions[sIdx].last_run_date : '';
                    entry.recur_month = parseInt($('#input-freq-month').value);
                    entry.recur_day = (['monthly', 'bimonthly', 'quarterly'].includes(frequency)) ? parseInt($('#input-freq-day').value) : parseInt($('#input-freq-yearly-day').value);
                    let selectedBtns = document.querySelectorAll('.weekday-btn.selected');
                    entry.recur_weekdays = Array.from(selectedBtns).map(b => parseInt(b.dataset.val)).sort((a,b) => a-b);
                    entry.recur_weekday = entry.recur_weekdays.length > 0 ? entry.recur_weekdays[0] : NaN;
                    
                    entry.next_run_date = calculateNextRunDate(frequency, entry, startDate, true);
                }

                if (isNaN(entry.amount)) {
                    toast('Please enter a valid amount', 'error');
                    return;
                }

                if (entry.end_condition === 'enabled' && !entry.end_date && isNaN(entry.max_occurrences)) {
                    toast('Please provide either an end date or a maximum number of occurrences', 'error');
                    return;
                }
                if (['biweekly', 'bimonthly', 'quarterly'].includes(frequency)) {
                    if (!startDate) {
                        toast('Please select a start date', 'error');
                        return;
                    }
                    entry.next_run_date = startDate;
                }

                if (entry.location) {
                    localStorage.setItem('expman_last_location', entry.location);
                }

                if (sIdx >= 0) {
                    const existing = state.scheduledTransactions[sIdx];
                    const oldExisting = { ...existing };
                    const oldWeekdaysStr = (existing.recur_weekdays || []).join(',');
                    const newWeekdaysStr = (entry.recur_weekdays || []).join(',');
                    const freqChanged = existing.frequency !== entry.frequency || existing.recur_month !== entry.recur_month || existing.recur_day !== entry.recur_day || existing.recur_weekday !== entry.recur_weekday || oldWeekdaysStr !== newWeekdaysStr || existing.start_date !== entry.start_date;

                    existing.amount = entry.amount;
                    existing.amountExpression = entry.amountExpression;
                    existing.currency = entry.currency;
                    existing.category = entry.category;
                    existing.txnType = entry.txnType;
                    existing.txnMode = entry.txnMode;
                    existing.note = entry.note;
                    existing.location = entry.location;
                    existing.tag = entry.tag;
                    existing.frequency = entry.frequency;
                    existing.recur_month = entry.recur_month;
                    existing.recur_day = entry.recur_day;
                    existing.recur_weekday = entry.recur_weekday;
                    existing.recur_weekdays = entry.recur_weekdays;
                    existing.end_condition = entry.end_condition;
                    existing.end_date = entry.end_date;
                    existing.max_occurrences = entry.max_occurrences;
                    existing.start_date = entry.start_date;
                    existing.last_run_date = entry.last_run_date;
                    existing.next_run_date = entry.next_run_date;

                    if (freqChanged) existing.next_run_date = entry.next_run_date;

                    toast('Updating schedule to cloud...', 'info');
                    try {
                        await saveScheduledCSV();
                        const { recordActivity } = await import("../services/activity.js");
                        await recordActivity({action:"updated",type:"schedule",source:"schedule",id:entry.id,txn:entry,changes:{
                            amount:{from:oldExisting.amount,to:entry.amount},note:{from:oldExisting.note,to:entry.note},date:{from:oldExisting.start_date,to:entry.start_date}
                        }});
                        await processScheduledTransactions();
                        toast('Scheduled transaction updated!', 'success');
                        const targetView = state.editOriginView || 'scheduled';
                        resetForm(true);
                        state.editOriginView = null;
                        renderAll();
                        switchView(targetView);
                    } catch (error) {
                        if (error.message === "CONFLICT_DETECTED") {
                            state.scheduledTransactions[sIdx] = oldExisting;
                            renderAll();
                            toast('Conflict! Schedule modified elsewhere. Please refresh.', 'error');
                            return;
                        } else {
                            toast('Error saving to cloud', 'error');
                        }
                    }
                } else {
                    state.scheduledTransactions.push(entry);
                    toast('Saving schedule to cloud...', 'info');
                    try {
                        await saveScheduledCSV();
                        const { recordActivity } = await import("../services/activity.js");
                        await recordActivity({action:"added",type:"schedule",source:"schedule",id:entry.id,txn:entry});
                        await processScheduledTransactions();
                        toast('Scheduled transaction added!', 'success');
                        resetForm(true);
                        renderAll();
                        switchView('scheduled');
                    } catch (error) {
                        if (error.message === "CONFLICT_DETECTED") {
                            const addedIdx = state.scheduledTransactions.indexOf(entry);
                            if (addedIdx > -1) state.scheduledTransactions.splice(addedIdx, 1);
                            renderAll();
                            toast('Conflict! Schedule modified elsewhere. Please refresh.', 'error');
                            return;
                        } else {
                            toast('Error saving to cloud', 'error');
                        }
                    }
                }
            } else {
                const amountInputValue = $('#input-amount').value;
                const entry = {
                    date: $('#input-date').value,
                    amount: (() => {
                        let a = roundAmount(evaluateExpression(amountInputValue));
                        const t = $('#input-transaction-type').value;
                        if (t === 'Income' || t === 'Refund') return -Math.abs(a);
                        if (t === 'Investment') return a;
                        return Math.abs(a);
                    })(),
                    amountExpression: amountInputValue.split(/[-+]/).filter(Boolean).length > 1 ? amountInputValue.trim() : '',
                    currency: $('#input-currency').value,
                    category: $('#input-category').value,
                    txnType: $('#input-transaction-type').value,
                    txnMode: $('#input-txn-type').value,
                    note: $('#input-note').value.trim(),
                    location: $('#input-location').value.trim() || await getCurrentLocationTag(),
                    tag: $('#input-tag')?.value.trim() || '',
                    source: idx >= 0 ? state.expenses[idx].source : currentSuggestionSource,
                    txnId: idx >= 0 ? state.expenses[idx].txnId : currentSuggestionTxnId
                };

                if (entry.location) {
                    localStorage.setItem('expman_last_location', entry.location);
                }

                if (idx >= 0) {
                    const oldEntry = { ...state.expenses[idx] };
                    const oldYear = state.expenses[idx].date.split('-')[0];
                    state.expenses[idx] = entry;
                    state.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
                    const newYear = entry.date.split('-')[0];
                    const newIdx = state.expenses.indexOf(entry);

                    toast('Saving to cloud...', 'info');
                    try {
                        if (oldYear === newYear) {
                            await saveYearCSV(newYear);
                        } else {
                            await saveYearCSV(oldYear);
                            await saveYearCSV(newYear);
                        }
                        const { recordActivity } = await import("../services/activity.js");
                        await recordActivity({action:"updated",type:"txn",source:entry.source || "manual",txn:entry,changes:{
                            amount:{from:oldEntry.amount,to:entry.amount}, note:{from:oldEntry.note,to:entry.note}, date:{from:oldEntry.date,to:entry.date}
                        }});
                        toast('Transaction updated!', 'success');
                        const targetView = state.editOriginView || state.previousView || 'dashboard';
                        resetForm(true);
                        state.editOriginView = null;
                        renderAll();

                        switchView(targetView);
                        setTimeout(() => {
                            const rowId = state.previousView === 'dashboard' ? `dash-row-${newIdx}` : `txn-row-${newIdx}`;
                            const row = document.getElementById(rowId);
                            if (row) {
                                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                row.style.transition = 'background-color 0.5s';
                                const oldBg = row.style.backgroundColor;
                                row.style.backgroundColor = 'rgba(99, 138, 255, 0.3)';
                                setTimeout(() => row.style.backgroundColor = oldBg, 1500);
                            }
                        }, 100);
                        return;
                    } catch (error) {
                        if (error.message === "CONFLICT_DETECTED") {
                            const currentIdx = state.expenses.indexOf(entry);
                            if (currentIdx > -1) state.expenses[currentIdx] = oldEntry;
                            state.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
                            renderAll();
                            toast('Conflict! Data modified on another device. Please refresh.', 'error');
                            return;
                        } else {
                            toast('Error saving to cloud', 'error');
                        }
                    }
                } else {
                    applyAutoTag(entry, { isUpdate: false });
                    state.expenses.unshift(entry);
                    state.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
                    const newYear = entry.date.split('-')[0];

                    toast('Saving to cloud...', 'info');
                    try {
                        await saveYearCSV(newYear);
                        const { recordActivity } = await import("../services/activity.js");
                        await recordActivity({action:"added",type:String(entry.source||"").toLowerCase().replace(/[^a-z]/g,"").includes("quickadd")?"quickadd":"txn",source:entry.source || "manual",txn:entry});
                        toast('Transaction added!', 'success');
                    } catch (error) {
                        if (error.message === "CONFLICT_DETECTED") {
                            const addedIdx = state.expenses.indexOf(entry);
                            if (addedIdx > -1) state.expenses.splice(addedIdx, 1);
                            renderAll();
                            toast('Conflict! Data modified on another device. Please refresh.', 'error');
                            return;
                        } else {
                            const addedIdx = state.expenses.indexOf(entry);
                            if (addedIdx > -1) state.expenses.splice(addedIdx, 1);
                            renderAll();
                            toast('Error saving to cloud', 'error');
                            return;
                        }
                    }
                }

                if (currentSelectedSuggestionTxn) {
                    consumeRawSmsTransaction(currentSelectedSuggestionTxn);
                    currentSelectedSuggestionTxn = null;
                } else {
                    recomputePendingSmsTransactions();
                }

                if (entry.location) {
                    localStorage.setItem('expman_last_location', entry.location);
                }
                resetForm(true);
                renderAll();
                renderSmsSuggestions();
            }
        } finally {
            setFormSubmittingState(false);
        }
    });
    $('#btn-cancel').addEventListener('click', () => {
        const targetView = state.editOriginView || state.previousView || 'dashboard';
        resetForm();
        state.editOriginView = null;
        switchView(targetView);
    });
}

export function updateTxnTypeAuto() {
    if (isTxnTypeManuallyChanged) return;
    const typeInput = $('#input-transaction-type');
    if (!typeInput) return;
    const amtStr = $('#input-amount')?.value;
    const cat = ($('#input-category')?.value || '').toLowerCase();
    const note = ($('#input-note')?.value || '').trim();

    // Priority 0: Custom keyword mapping override on note
    if (typeof findMatchingKeywordRule === 'function') {
        const customRule = findMatchingKeywordRule(note);
        if (customRule && customRule.txnType) {
            const ruleType = normalizeTxnType(customRule.txnType);
            typeInput.value = ruleType;
            syncChips('#txntype-chips', ruleType);
            return;
        }
    }

    let expectedType = typeInput.value;
    
    const mappedType = getTxnTypeFromMapping(cat);
    if (mappedType) {
        expectedType = mappedType;
    } else {
        // Evaluate expression to get the actual numeric value
        const amt = evaluateExpression(amtStr);
        if (!isNaN(amt)) {
            if (amt < 0) {
                if (expectedType !== 'Income' && expectedType !== 'Refund' && expectedType !== 'Investment') {
                    expectedType = 'Refund';
                }
            } else {
                if (expectedType !== 'Expense' && expectedType !== 'Income' && expectedType !== 'Refund' && expectedType !== 'Investment' && expectedType !== 'Transfer') {
                    expectedType = 'Expense';
                }
            }
        }
    }
    
    typeInput.value = expectedType;
    syncChips('#txntype-chips', expectedType);
}

export function updateFormActionButtons() {
    const btnSubmit = $('#btn-submit');
    if (!btnSubmit) return;

    const frequency = $('#input-frequency')?.value || 'one-off';
    const sIdxElement = $('#edit-scheduled-index');
    const editingScheduled = sIdxElement && parseInt(sIdxElement.value) >= 0;
    const isFutureDate = $('#input-date') && $('#input-date').value > getLocalDateString();

    if (editingScheduled) {
        btnSubmit.textContent = 'Update Schedule';
    } else if (frequency === 'instant') {
        btnSubmit.textContent = 'Save Quick Add Template';
    } else if (frequency !== 'one-off' || isFutureDate) {
        btnSubmit.textContent = 'Schedule Entry';
    } else {
        const editIdxEl = $('#edit-index');
        const idx = editIdxEl ? parseInt(editIdxEl.value) : -1;
        btnSubmit.textContent = idx >= 0 ? 'Update Entry' : 'Add Entry';
    }
}

export function prefillLocation(options = {}) {
    const locInput = $('#input-location');
    if (!locInput) return Promise.resolve();
    
    const prevDefault = typeof getLastLocation === 'function' ? getLastLocation() : '';
    // Check if user is typing manually; don't override if they are
    if (locInput.value && locInput.value !== prevDefault) return Promise.resolve();

    // Immediately pre-populate with last known location if input is empty
    if (!locInput.value && prevDefault) {
        locInput.value = prevDefault;
    }

    const isAddView = typeof document !== 'undefined' && 
        (document.querySelector('.view.active')?.id === 'view-add' || 
         document.getElementById('view-add')?.classList.contains('active'));

    const effectiveOptions = {
        ...options,
        explicit: options.explicit || isAddView
    };

    if (typeof getCurrentLocationTag !== 'function') return Promise.resolve();
    return getCurrentLocationTag(effectiveOptions).then(tag => {
        if (!locInput.value || locInput.value === prevDefault || locInput.value === tag) {
            if (tag) {
                locInput.value = tag;
            }
        }
    });
}

function syncFormExtraOptionsForViewport() {
    const details = $('#form-extra-options');
    if (!details) return;
    // Keep advanced fields permanently visible on desktop. On compact screens
    // they remain in the user-controlled disclosure, collapsed by default.
    const compactLayout = window.matchMedia
        ? window.matchMedia('(max-width: 1024px)').matches
        : window.innerWidth <= 1024;
    details.open = !compactLayout;
}

function setupAddFormChipScrollbars() {
    const form = $('#expense-form');
    if (!form || form.dataset.chipScrollbarsReady === 'true') return;
    form.dataset.chipScrollbarsReady = 'true';

    const refresh = (shell) => {
        const group = shell.querySelector('.chip-group');
        const bar = shell.querySelector('.chip-scrollbar');
        const thumb = shell.querySelector('.chip-scrollbar-thumb');
        if (!group || !bar || !thumb) return;

        const maxScroll = group.scrollWidth - group.clientWidth;
        const overflowing = maxScroll > 2 && group.clientWidth > 0 &&
            getComputedStyle(group).display !== 'none';
        bar.classList.toggle('visible', overflowing);
        if (!overflowing) return;

        const ratio = group.clientWidth / group.scrollWidth;
        const thumbWidth = Math.max(18, bar.clientWidth * ratio);
        const travel = Math.max(0, bar.clientWidth - thumbWidth);
        const progress = maxScroll > 0 ? group.scrollLeft / maxScroll : 0;
        thumb.style.width = `${thumbWidth}px`;
        thumb.style.transform = `translateX(${travel * progress}px)`;
    };

    const attach = (group) => {
        if (group.closest('.chip-scroll-shell')) return;
        const shell = document.createElement('div');
        shell.className = 'chip-scroll-shell';
        group.parentNode.insertBefore(shell, group);
        shell.appendChild(group);

        const bar = document.createElement('div');
        bar.className = 'chip-scrollbar';
        bar.setAttribute('aria-hidden', 'true');
        const thumb = document.createElement('span');
        thumb.className = 'chip-scrollbar-thumb';
        bar.appendChild(thumb);
        shell.appendChild(bar);

        group.addEventListener('scroll', () => refresh(shell), { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(() => refresh(shell));
            resizeObserver.observe(group);
            resizeObserver.observe(shell);
        } else {
            window.addEventListener('resize', () => refresh(shell), { passive: true });
        }
        if (typeof MutationObserver !== 'undefined') {
            const mutationObserver = new MutationObserver(() => requestAnimationFrame(() => refresh(shell)));
            mutationObserver.observe(group, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
        }
        refresh(shell);
    };

    form.querySelectorAll('.chip-group').forEach(attach);
    requestAnimationFrame(() => form.querySelectorAll('.chip-scroll-shell').forEach(refresh));
}

function syncFormAutoTagTool() {
    const tool = $('#form-auto-tag-tool');
    const name = $('#form-auto-tag-name');
    const toggle = $('#form-auto-tag-toggle');
    const editIndex = $('#edit-index');
    const scheduledIndex = $('#edit-scheduled-index');
    const isNewEntry = (!editIndex || parseInt(editIndex.value, 10) < 0) &&
        (!scheduledIndex || parseInt(scheduledIndex.value, 10) < 0);
    const configured = !!String(state.autoTag || '').trim();

    if (!tool) return;
    tool.hidden = !(configured && isNewEntry);
    if (name) name.textContent = state.autoTag || '';
    if (toggle) {
        toggle.textContent = state.autoTagEnabled ? 'ON' : 'OFF';
        toggle.classList.toggle('active', !!state.autoTagEnabled);
        toggle.setAttribute('aria-pressed', state.autoTagEnabled ? 'true' : 'false');
        toggle.title = state.autoTagEnabled ? 'Disable automatic tagging' : 'Enable automatic tagging';
    }
}

export function resetForm(force = false) {
    // If a suggestion or form input was filled after submission started, skip reset unless forced
    if (!force && (isFormSubmitting || (lastFormFillTime > lastSubmitStartTime && lastSubmitStartTime > 0))) {
        console.warn('[Form] Skipping resetForm to prevent overwriting new user input from race condition.');
        return;
    }
    lastSubmitStartTime = 0;
    lastFormFillTime = 0;
    const form = $('#expense-form');
    if (!form) return;

    // Preserve existing date if set, otherwise default to today
    const existingDate = $('#input-date') ? $('#input-date').value : '';
    const dateToKeep = existingDate || getLocalDateString();

    form.reset();
    
    // Explicitly restore preserved date (do not reset date)
    if ($('#input-date')) {
        $('#input-date').value = dateToKeep;
        $('#input-date').dispatchEvent(new Event('change'));
    }
    state.calViewDate = (existingDate && typeof parseLocalDate === 'function' ? parseLocalDate(existingDate) : null) || new Date();
    if ($('#cal-days-container')) renderCalendar();

    if ($('#input-amount')) $('#input-amount').value = '';
    if ($('#input-note')) $('#input-note').value = '';
    const prevDefaultLoc = typeof getLastLocation === 'function' ? getLastLocation() : '';
    if ($('#input-location')) $('#input-location').value = prevDefaultLoc || '';
    if ($('#input-tag')) $('#input-tag').value = '';
    if ($('#input-end-date')) {
        $('#input-end-date').type = 'text';
        $('#input-end-date').value = '';
    }
    if ($('#input-max-occurrences')) $('#input-max-occurrences').value = '';
    if ($('#input-end-enable')) $('#input-end-enable').checked = false;
    if ($('#amount-error')) $('#amount-error').style.display = 'none';

    // Clear weekday buttons selection
    document.querySelectorAll('.weekday-btn.selected').forEach(b => b.classList.remove('selected'));

    currentSuggestionSource = '';
    currentSuggestionTxnId = '';
    currentSelectedSuggestionTxn = null;

    $$('#note-suggestions .chip, #location-suggestions .chip, #tag-suggestions .chip').forEach(c => c.classList.remove('active'));

    prefillLocation();
    
    if ($('#edit-index')) $('#edit-index').value = -1;
    if ($('#edit-scheduled-index')) $('#edit-scheduled-index').value = -1;
    syncFormAutoTagTool();
    syncFormExtraOptionsForViewport();
    if ($('#form-title')) $('#form-title').textContent = 'Add New Entry';
    if ($('#btn-submit')) {
        $('#btn-submit').textContent = 'Add Entry';
        $('#btn-submit').style.display = 'inline-block';
    }
    if ($('#btn-cancel')) $('#btn-cancel').style.display = 'none';

    if ($('#input-frequency')) {
        // Triggers updateFormActionButtons via change event
        $('#input-frequency').value = 'one-off';
        $('#input-frequency').dispatchEvent(new Event('change'));
    }

    // Set default category and transaction type
    if (state.categories.length > 0 && $('#input-category')) {
        $('#input-category').value = state.categories[0];
        syncChips('#category-chips', state.categories[0]);
    }
    if (state.txnModes.length > 0 && $('#input-txn-type')) {
        $('#input-txn-type').value = state.txnModes[0];
        syncChips('#txnmode-chips', state.txnModes[0]);
    }
    if (state.txnTypes && state.txnTypes.length > 0 && $('#input-transaction-type')) {
        $('#input-transaction-type').value = state.txnTypes[0];
        syncChips('#txntype-chips', state.txnTypes[0]);
    }
    if (state.currency && $('#input-currency')) {
        $('#input-currency').value = state.currency;
    }

    // Clear note suggestion chip active states
    $$('#note-suggestions .chip').forEach(c => c.classList.remove('active'));

    // Reset manual change flags so new entry starts with untouched fields
    isCategoryManuallyChanged = false;
    isTxnModeManuallyChanged = false;
    isTxnTypeManuallyChanged = false;

    if (typeof renderSelectedDayTransactions === 'function') {
        renderSelectedDayTransactions();
    }
}

export async function editEntry(idx) {
    state.editOriginView = window.location.hash.replace('#', '') || 'dashboard';
    const e = state.expenses[idx];
    if (!e) return;

    // Preserve existing entry's category, mode, and type from note inference
    isCategoryManuallyChanged = true;
    isTxnModeManuallyChanged = true;
    isTxnTypeManuallyChanged = true;

    // Lazy-load state.categories & txn types if not yet loaded
    if (!state.masterDataLoaded) {
        showLoader('Fetching state.categories...');
        await loadMetadata();
        populateFormDropdowns();
        renderSettings();
        state.masterDataLoaded = true;
        hideLoader();
    }

    $('#edit-index').value = idx;
    syncFormAutoTagTool();
    syncFormExtraOptionsForViewport();
    $('#input-date').value = e.date;
    $('#input-date').dispatchEvent(new Event('change'));
    state.calViewDate = new Date(e.date);
    if ($('#cal-days-container')) renderCalendar();
    // Show expression if it exists, otherwise show the calculated amount
    const displayAmount = (e.txnType === 'Refund' || e.txnType === 'Income' || e.amount < 0) ? -Math.abs(e.amount) : Math.abs(e.amount);
    $('#input-amount').value = e.amountExpression || amountToStr(displayAmount);
    if ($('#input-currency')) $('#input-currency').value = e.currency || 'INR';
    $('#input-category').value = e.category;
    syncChips('#category-chips', e.category);
    const initialTxnType = e.txnType || (e.amount < 0 ? 'Refund' : 'Expense');
    $('#input-transaction-type').value = initialTxnType;
    syncChips('#txntype-chips', initialTxnType);
    $('#input-txn-type').value = e.txnMode;
    syncChips('#txnmode-chips', e.txnMode);
    $('#input-note').value = e.note;
    if ($('#input-location')) $('#input-location').value = e.location || '';
    if ($('#input-tag')) $('#input-tag').value = e.tag || '';
    $$('#tag-suggestions .chip').forEach(c => c.classList.toggle('active', c.dataset.value === (e.tag || '')));
    $('#form-title').textContent = 'Edit Transaction';
    $('#btn-submit').textContent = 'Update Entry';
    $('#btn-submit').style.display = 'inline-block';
    $('#btn-cancel').style.display = 'inline-flex';
    updateFormActionButtons();
    switchView('add');
}

export async function generateRefund(idx) {
    const e = state.expenses[idx];
    if (!e) return;

    // Ensure original expense has a Txn ID if missing
    if (!e.txnId || !e.txnId.trim()) {
        e.txnId = '__TXN_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    }

    const baseNote = e.note || '';
    const noteText = baseNote.toLowerCase().startsWith('refund:') 
        ? baseNote 
        : (baseNote ? `Refund: ${baseNote}` : `Refund: ${e.category}`);

    const refundTxn = {
        date: e.date,
        amount: -Math.abs(e.amount),
        expression: '',
        currency: e.currency || 'INR',
        category: e.category,
        txnType: 'Refund',
        txnMode: e.txnMode || 'UPI',
        note: noteText,
        source: 'Refund Action',
        txnId: e.txnId.trim(),
        location: e.location || await getCurrentLocationTag(),
        tag: e.tag || ''
    };

    if (refundTxn.location) {
        localStorage.setItem('expman_last_location', refundTxn.location);
    }

    state.expenses.push(refundTxn);

    toast('Generating refund...', 'info');
    try {
        const yr = e.date.slice(0, 4);
        await saveYearCSV(yr);
        toast('Refund generated and linked!', 'success');
        renderAll();
    } catch (err) {
        toast('Error saving refund', 'error');
    }
}

export function renderSmsSuggestions() {
    const container = $('#sms-suggestions-container');
    const list = $('#sms-suggestions-list');
    if (!container || !list) return;

    const date = $('#input-date').value;
    if (!date) {
        container.style.display = 'none';
        return;
    }

    const suggestions = getRawSmsSuggestionsForDate(date);

    if (suggestions.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    list.innerHTML = '';

    suggestions.forEach(txn => {

        const customRule = findMatchingKeywordRule(txn.merchant) || (txn.source ? findMatchingKeywordRule(txn.source) : null);
        const ruleTxnType = (customRule && customRule.txnType) ? normalizeTxnType(customRule.txnType) : null;

        const isRefund = ruleTxnType ? (ruleTxnType === 'Refund') : isRefundTxn(txn);
        const isExpense = ruleTxnType ? (ruleTxnType === 'Expense') : (!isRefund && normalizeTxnType(txn.txnType) !== 'Income' && txn.amount >= 0);
        const amountColor = isExpense ? 'var(--red)' : 'var(--green)';
        const amountPrefix = isExpense ? '' : '+';

        const div = document.createElement('div');
        div.className = 'sms-suggestion-card';
        div.style.cssText = 'padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-body); cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;';

        const mappedMode = getTxnModeForMerchant(txn.merchant, txn.transactionMode, state.txnModes, txn.source);

        div.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="font-weight: 600; color: var(--text-main);">${txn.merchant || 'Unknown'}</div>
                <div style="font-size: 0.85rem; color: var(--text-muted);">${txn.source} &bull; ${mappedMode}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="font-weight: 700; color: ${amountColor}; font-size: 1.1rem;">
                    ${amountPrefix}₹${amountToStr(Math.abs(txn.amount))}
                </div>
                <button type="button" class="btn-dismiss-suggestion" title="Dismiss suggestion" style="background: none; border: none; color: var(--text-muted); font-size: 1.2rem; cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1;">&times;</button>
            </div>
        `;

        const dismissBtn = div.querySelector('.btn-dismiss-suggestion');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                discardRawSmsTransaction(txn);
                if (currentSelectedSuggestionTxn && isDuplicateTxn(currentSelectedSuggestionTxn, txn)) {
                    resetForm();
                }
                renderAll();
            });
        }

        div.addEventListener('mouseover', () => div.style.background = 'var(--bg-card-hover)');
        div.addEventListener('mouseout', () => div.style.background = 'var(--bg-body)');

        div.addEventListener('click', () => {
            if (isFormSubmitting) return;
            recordFormFillTime();

            if (!isCategoryManuallyChanged) {
                let bestMatch = getCategoryForMerchant(txn.merchant, txn.masterCategory, txn.source);
                if (!state.categories.includes(bestMatch)) bestMatch = state.categories[0];

                $('#input-category').value = bestMatch;
                syncChips('#category-chips', bestMatch);
            }

            const mappedMode = getTxnModeForMerchant(txn.merchant, txn.transactionMode, state.txnModes, txn.source);
            if (!isTxnModeManuallyChanged && mappedMode && state.txnModes.includes(mappedMode)) {
                $('#input-txn-type').value = mappedMode;
                syncChips('#txnmode-chips', mappedMode);
            }

            if (!isTxnTypeManuallyChanged) {
                let bestTxnType = null;
                if (ruleTxnType) {
                    bestTxnType = ruleTxnType;
                } else if (isRefund) {
                    bestTxnType = 'Refund';
                } else if (normalizeTxnType(txn.txnType) === 'Income') {
                    bestTxnType = 'Income';
                } else if (txn.txnType) {
                    bestTxnType = normalizeTxnType(txn.txnType);
                } else {
                    const expectedType = (txn.amount < 0 || isRefund) ? 'Refund' : 'Expense';
                    bestTxnType = getTxnTypeForMerchant(txn.merchant, expectedType, txn.source);
                }
                
                $('#input-transaction-type').value = bestTxnType;
                syncChips('#txntype-chips', bestTxnType);
            }

            const effectiveType = $('#input-transaction-type')?.value || (ruleTxnType || (isRefund ? 'Refund' : (txn.amount < 0 ? 'Refund' : 'Expense')));
            const fillAmount = (effectiveType === 'Income' || effectiveType === 'Refund') ? -Math.abs(txn.amount) : Math.abs(txn.amount);
            $('#input-amount').value = fillAmount;

            $('#input-note').value = txn.merchant || '';
            currentSuggestionSource = txn.source;
            currentSuggestionTxnId = txn.transactionId || '';
            currentSelectedSuggestionTxn = txn;

            const locInput = $('#input-location');
            if (locInput && !locInput.value) {
                prefillLocation();
            }

            // Highlight form
            const formCard = document.querySelector('.form-card');
            if (formCard) {
                formCard.style.transition = 'box-shadow 0.3s';
                formCard.style.boxShadow = '0 0 0 2px var(--accent)';
                setTimeout(() => formCard.style.boxShadow = '', 1000);
            }
            const amountInput = $('#input-amount');
            if (amountInput && typeof amountInput.scrollIntoView === 'function') {
                amountInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });

        list.appendChild(div);
    });

    if (list.children.length === 0) {
        container.style.display = 'none';
    }
}

