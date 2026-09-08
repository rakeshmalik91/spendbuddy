import { renderDashboard, renderSelectedDayTransactions } from "./dashboard.js";
import { renderChartsPage } from "./charts.js";
import { populateFilterOptions } from "./filters.js";
import { renderCalendar, populateNoteSuggestions } from "./form_dropdowns.js";
import { renderSmsSuggestions, prefillLocation } from "./form.js";
import { $$, $ } from "../core/init.js";
import { renderTransactions } from "./transactions.js";
import { recomputePendingSmsTransactions } from "./sms_approval.js";
import { renderSettings } from "./settings.js";
import { renderBalanceTracker } from "./balance.js?v=4";
import { renderKeywordMappings } from "./keyword_mappings.js";

/* ══════════════ RENDER ALL ══════════════ */

export function renderAll() {
    populateFilterOptions();
    if (typeof recomputePendingSmsTransactions === 'function') recomputePendingSmsTransactions();
    renderDashboard();
    renderTransactions();
    renderSelectedDayTransactions();
    renderChartsPage();
    if (typeof renderCalendar === 'function') renderCalendar();
    populateNoteSuggestions();
    if (typeof renderSmsSuggestions === 'function') renderSmsSuggestions();
    if (typeof prefillLocation === 'function') prefillLocation();
    
    // Also update settings pages (Category/TxnMode/Keyword tables) and balance tracker
    if (typeof renderSettings === 'function') renderSettings();
    if (typeof renderBalanceTracker === 'function') renderBalanceTracker();
    if (typeof renderKeywordMappings === 'function') renderKeywordMappings();
}
window.renderAll = renderAll;


