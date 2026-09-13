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

function _doRenderAll() {
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

let renderPending = false;
let renderRafId = null;

export function renderAllImmediate() {
    if (renderRafId) {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(renderRafId);
        renderRafId = null;
    }
    renderPending = false;
    _doRenderAll();
}

export function renderAll() {
    // In Node / Jest testing environment, run synchronously
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
        _doRenderAll();
        return;
    }

    if (renderPending) return;
    renderPending = true;

    if (typeof requestAnimationFrame === 'function') {
        renderRafId = requestAnimationFrame(() => {
            renderPending = false;
            renderRafId = null;
            _doRenderAll();
        });
    } else {
        setTimeout(() => {
            renderPending = false;
            _doRenderAll();
        }, 0);
    }
}

window.renderAll = renderAll;
window.renderAllImmediate = renderAllImmediate;


