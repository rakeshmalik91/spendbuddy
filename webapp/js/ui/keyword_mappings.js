import { state } from "../core/state.js";
import { $, $$, showLoader, hideLoader } from "../core/init.js";
import { toast, escHtml } from "../utils/helpers.js";
import { updateUserSettings } from "../services/user_settings.js";
import { openModal } from "./modal.js";
import { saveYearCSV } from "./form.js";
import { renderAll } from "./render_all.js";
import { stripEmojiPrefix, normalizeTxnType, resolveCategoryName, resolveTxnModeName, findMatchingKeywordRule } from "../utils/category_helpers.js";

let currentEditingIndex = -1;
let isInitialized = false;

/**
 * Initializes listeners for the Keyword Mappings modal and controls.
 */
export function initKeywordMappings() {
    if (isInitialized) return;
    isInitialized = true;

    $('#btn-add-keyword-mapping')?.addEventListener('click', () => {
        openKeywordMappingModal(-1);
    });

    $('#btn-run-all-rules')?.addEventListener('click', () => {
        runAllKeywordMappingsOnExisting();
    });

    $('#kw-modal-cancel')?.addEventListener('click', closeKeywordMappingModal);
    $('#kw-modal-close-btn')?.addEventListener('click', closeKeywordMappingModal);
    $('#kw-modal-save')?.addEventListener('click', saveKeywordMapping);

    const overlay = $('#keyword-mapping-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeKeywordMappingModal();
            }
        });
    }

    // Filter/search input
    $('#kw-search-input')?.addEventListener('input', (e) => {
        renderKeywordMappings(e.target.value.trim().toLowerCase());
    });
}

/**
 * Renders the table of custom keyword mapping rules.
 * @param {string} filterText - Optional search/filter substring
 */
export function renderKeywordMappings(filterText = '') {
    const tbody = $('#keyword-mapping-tbody');
    if (!tbody) return;

    initKeywordMappings();

    if (!Array.isArray(state.keywordMappings)) {
        state.keywordMappings = [];
    }

    let mappings = state.keywordMappings;
    if (filterText) {
        mappings = mappings.filter(m =>
            (m.keyword || '').toLowerCase().includes(filterText) ||
            (m.category || '').toLowerCase().includes(filterText) ||
            (m.tag || '').toLowerCase().includes(filterText) ||
            (m.txnType || '').toLowerCase().includes(filterText) ||
            (m.txnMode || '').toLowerCase().includes(filterText)
        );
    }

    if (mappings.length === 0) {
        if (state.keywordMappings.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-muted); font-style: italic; padding: 28px 16px;">
                        No custom keyword rules configured yet.<br>
                        Click <strong>"+ Add Rule"</strong> to override default category, tag, type, or mode for specific merchants/keywords.
                    </td>
                </tr>`;
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-muted); font-style: italic; padding: 24px 16px;">
                        No keyword rules match "${escHtml(filterText)}".
                    </td>
                </tr>`;
        }
        return;
    }

    tbody.innerHTML = mappings.map((rule) => {
        const origIndex = state.keywordMappings.indexOf(rule);
        const isEnabled = rule.enabled !== false;
        const resolvedCategory = resolveCategoryName(rule.category, state.categories);
        const categoryDisplay = resolvedCategory
            ? `<span style="font-weight: 500; color: var(--text-main);">${escHtml(resolvedCategory)}</span>`
            : `<span style="color: var(--text-muted); font-style: italic;">—</span>`;

        const tagDisplay = rule.tag
            ? `<span class="badge-tag" title="Tag: ${escHtml(rule.tag)}">🏷️ ${escHtml(rule.tag)}</span>`
            : `<span style="color: var(--text-muted); font-style: italic;">—</span>`;

        const normalizedType = normalizeTxnType(rule.txnType);
        let txnTypeBadge = `<span style="color: var(--text-muted); font-style: italic;">—</span>`;
        if (normalizedType) {
            const cls = `type-${normalizedType.toLowerCase()}`;
            txnTypeBadge = `<span class="badge-txn-type ${cls}">${escHtml(normalizedType)}</span>`;
        }

        const resolvedMode = resolveTxnModeName(rule.txnMode, state.txnModes);
        const txnModeDisplay = resolvedMode
            ? `<span style="font-weight: 500; color: var(--text-main);">${escHtml(resolvedMode)}</span>`
            : `<span style="color: var(--text-muted); font-style: italic;">—</span>`;

        const rowOpacity = isEnabled ? '1' : '0.55';

        return `
            <tr data-index="${origIndex}" style="opacity: ${rowOpacity};">
                <td data-label="Status" style="text-align: center;">
                    <label class="toggle-switch" style="transform: scale(0.8); margin: 0 auto; display: inline-block;" title="${isEnabled ? 'Disable rule' : 'Enable rule'}">
                        <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="window.toggleKeywordMappingEnabled(${origIndex}, this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td data-label="Keyword">
                    <span class="kw-keyword-badge" style="font-weight: 600; color: var(--accent); font-family: monospace; font-size: 0.95rem; background: rgba(59, 130, 246, 0.08); padding: 2px 6px; border-radius: 4px; display: inline-block; max-width: 100%; word-break: break-word; overflow-wrap: anywhere; white-space: normal;">
                        ${escHtml(rule.keyword)}
                    </span>
                </td>
                <td data-label="Category">${categoryDisplay}</td>
                <td data-label="Tag">${tagDisplay}</td>
                <td data-label="Txn Type">${txnTypeBadge}</td>
                <td data-label="Txn Mode">${txnModeDisplay}</td>
                <td data-label="Actions">
                    <div class="row-actions">
                        <button class="row-btn run-btn" onclick="window.runKeywordMappingOnExisting(${origIndex})" title="Run rule on existing transactions">⚡</button>
                        <button class="row-btn" onclick="window.editKeywordMapping(${origIndex})" title="Edit rule">✏️</button>
                        <button class="row-btn delete" onclick="window.deleteKeywordMapping(${origIndex})" title="Delete rule">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

export function openKeywordMappingModal(index = -1) {
    currentEditingIndex = index;
    const overlay = $('#keyword-mapping-modal-overlay');
    if (!overlay) return;

    const titleEl = $('#kw-modal-title');
    const inputKeyword = $('#kw-input-keyword');
    const inputTag = $('#kw-input-tag');
    const selectCategory = $('#kw-input-category');
    const selectTxnType = $('#kw-input-txntype');
    const selectTxnMode = $('#kw-input-txnmode');
    const inputEnabled = $('#kw-input-enabled');

    // Populate category dropdown
    selectCategory.innerHTML = `<option value="">-- No Category Override --</option>` +
        state.categories.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');

    // Populate txn type dropdown
    const txnTypes = ['Expense', 'Income', 'Refund', 'Transfer', 'Investment'];
    selectTxnType.innerHTML = `<option value="">-- No Txn Type Override --</option>` +
        txnTypes.map(t => `<option value="${t}">${t}</option>`).join('');

    // Populate txn mode dropdown
    selectTxnMode.innerHTML = `<option value="">-- No Txn Mode Override --</option>` +
        state.txnModes.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('');

    if (index >= 0 && state.keywordMappings[index]) {
        const rule = state.keywordMappings[index];
        titleEl.textContent = 'Edit Keyword Mapping';
        inputKeyword.value = rule.keyword || '';
        if (inputTag) inputTag.value = rule.tag || '';
        if (inputEnabled) inputEnabled.checked = rule.enabled !== false;

        if (rule.category) {
            const cleanCat = stripEmojiPrefix(rule.category).toLowerCase();
            const opt = Array.from(selectCategory.options).find(o => stripEmojiPrefix(o.value).toLowerCase() === cleanCat);
            selectCategory.value = opt ? opt.value : rule.category;
        } else {
            selectCategory.value = '';
        }

        if (rule.txnType) {
            const cleanType = rule.txnType.trim().toLowerCase();
            const opt = Array.from(selectTxnType.options).find(o => o.value.toLowerCase() === cleanType);
            selectTxnType.value = opt ? opt.value : rule.txnType;
        } else {
            selectTxnType.value = '';
        }

        if (rule.txnMode) {
            const cleanMode = stripEmojiPrefix(rule.txnMode).toLowerCase();
            const opt = Array.from(selectTxnMode.options).find(o => stripEmojiPrefix(o.value).toLowerCase() === cleanMode);
            selectTxnMode.value = opt ? opt.value : rule.txnMode;
        } else {
            selectTxnMode.value = '';
        }
    } else {
        titleEl.textContent = 'Add Keyword Mapping';
        inputKeyword.value = '';
        if (inputTag) inputTag.value = '';
        if (inputEnabled) inputEnabled.checked = true;
        selectCategory.value = '';
        selectTxnType.value = '';
        selectTxnMode.value = '';
    }

    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    setTimeout(() => inputKeyword.focus(), 50);
}

/**
 * Closes the modal.
 */
export function closeKeywordMappingModal() {
    const overlay = $('#keyword-mapping-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    currentEditingIndex = -1;
}

/**
 * Validates and saves the current keyword rule.
 */
export async function saveKeywordMapping() {
    const inputKeyword = $('#kw-input-keyword');
    const inputTag = $('#kw-input-tag');
    const selectCategory = $('#kw-input-category');
    const selectTxnType = $('#kw-input-txntype');
    const selectTxnMode = $('#kw-input-txnmode');
    const inputEnabled = $('#kw-input-enabled');

    const keyword = (inputKeyword?.value || '').trim();
    const tag = (inputTag?.value || '').trim();
    const category = selectCategory?.value || '';
    const txnType = selectTxnType?.value || '';
    const txnMode = selectTxnMode?.value || '';
    const enabled = inputEnabled ? inputEnabled.checked : true;

    if (!keyword) {
        toast('Please enter a keyword', 'error');
        inputKeyword?.focus();
        return;
    }

    if (!category && !txnType && !txnMode && !tag) {
        toast('Please select at least one override (Category, Tag, Txn Type, or Txn Mode)', 'error');
        return;
    }

    // Check for duplicate keyword
    const duplicateIdx = state.keywordMappings.findIndex((r, idx) =>
        idx !== currentEditingIndex && (r.keyword || '').trim().toLowerCase() === keyword.toLowerCase()
    );
    if (duplicateIdx !== -1) {
        toast(`A mapping for "${keyword}" already exists`, 'error');
        inputKeyword?.focus();
        return;
    }

    showLoader('Saving keyword mapping...');

    const ruleData = {
        id: (currentEditingIndex >= 0 && state.keywordMappings[currentEditingIndex]?.id)
            ? state.keywordMappings[currentEditingIndex].id
            : 'kw_' + Date.now(),
        keyword,
        category: category ? stripEmojiPrefix(category) : null,
        txnType: txnType ? normalizeTxnType(txnType) : null,
        txnMode: txnMode ? stripEmojiPrefix(txnMode) : null,
        tag: tag || null,
        enabled: Boolean(enabled)
    };

    if (currentEditingIndex >= 0) {
        state.keywordMappings[currentEditingIndex] = ruleData;
    } else {
        state.keywordMappings.push(ruleData);
    }

    // Save to local storage
    localStorage.setItem('expman_keyword_mappings', JSON.stringify(state.keywordMappings));

    // Save to cloud user_settings.json
    try {
        await updateUserSettings({ keywordMappings: state.keywordMappings });
        toast(`Keyword rule for "${keyword}" saved`, 'success');
    } catch (err) {
        console.error("Failed to sync keyword mapping to cloud:", err);
        toast(`Saved locally (cloud sync error)`, 'warning');
    } finally {
        hideLoader();
        closeKeywordMappingModal();
        renderKeywordMappings();
    }
}

/**
 * Deletes a keyword mapping by index.
 * @param {number} index
 */
export function deleteKeywordMapping(index) {
    if (!state.keywordMappings || !state.keywordMappings[index]) return;
    const rule = state.keywordMappings[index];
    const kw = rule.keyword;

    openModal({
        title: 'Delete Keyword Mapping',
        message: `Are you sure you want to delete the mapping for "${kw}"?`,
        confirmLabel: 'Delete',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
            showLoader('Deleting mapping...');
            state.keywordMappings.splice(index, 1);
            localStorage.setItem('expman_keyword_mappings', JSON.stringify(state.keywordMappings));

            try {
                await updateUserSettings({ keywordMappings: state.keywordMappings });
                toast(`Deleted rule for "${kw}"`, 'success');
            } catch (err) {
                console.error("Failed to sync deletion to cloud:", err);
                toast(`Deleted locally (cloud sync error)`, 'warning');
            } finally {
                hideLoader();
                renderKeywordMappings();
            }
        }
    });
}

/**
 * Runs a specific keyword mapping rule on all existing transactions in state.expenses.
 * @param {number} index - Index of rule in state.keywordMappings
 */
export function runKeywordMappingOnExisting(index) {
    if (!state.keywordMappings || !state.keywordMappings[index]) return;
    const rule = state.keywordMappings[index];
    const kw = (rule.keyword || '').trim();
    if (!kw) return;

    const overridesSummary = [];
    if (rule.category) overridesSummary.push(`Category → ${rule.category}`);
    if (rule.tag) overridesSummary.push(`Tag → ${rule.tag}`);
    if (rule.txnType) overridesSummary.push(`Txn Type → ${rule.txnType}`);
    if (rule.txnMode) overridesSummary.push(`Txn Mode → ${rule.txnMode}`);

    openModal({
        title: 'Run Rule on Existing Transactions',
        message: `Apply rule for "${kw}" across all historical transactions?\n\n${overridesSummary.join('\n')}\n\nMatching records will be updated and synced to the cloud.`,
        confirmLabel: 'Apply Rule',
        confirmClass: 'btn-primary',
        onConfirm: async () => {
            await executeRulesOnExpenses([rule]);
        }
    });
}

/**
 * Runs all configured keyword mapping rules on all existing transactions.
 */
export function runAllKeywordMappingsOnExisting() {
    if (!state.keywordMappings || state.keywordMappings.length === 0) {
        toast('No keyword mapping rules configured yet', 'info');
        return;
    }

    openModal({
        title: 'Run All Rules on Existing Transactions',
        message: `Apply all ${state.keywordMappings.length} keyword mapping rule(s) across all historical transactions?\n\nMatching records will be updated and synced to the cloud.`,
        confirmLabel: 'Run All Rules',
        confirmClass: 'btn-primary',
        onConfirm: async () => {
            await executeRulesOnExpenses(state.keywordMappings);
        }
    });
}

/**
 * Helper to apply an array of rules to state.expenses and save affected years.
 * @param {Array} rules
 */
export async function executeRulesOnExpenses(rules) {
    if (!rules || rules.length === 0 || !Array.isArray(state.expenses)) return;

    showLoader('Applying rules to transactions...');
    let totalUpdated = 0;
    let totalMatched = 0;
    const modifiedYears = new Set();

    for (const e of state.expenses) {
        // Find matching rule across note, merchant, or source with comma-separated token and specificity support
        const matchedRule = findMatchingKeywordRule(e.note, rules)
            || (e.merchant ? findMatchingKeywordRule(e.merchant, rules) : null)
            || (e.source ? findMatchingKeywordRule(e.source, rules) : null);

        if (!matchedRule || matchedRule.enabled === false) continue;
        totalMatched++;
        let changed = false;

        if (matchedRule.tag) {
            if (e.tag !== matchedRule.tag) {
                e.tag = matchedRule.tag;
                changed = true;
            }
        }

        if (matchedRule.category) {
            const targetCategory = resolveCategoryName(matchedRule.category, state.categories);
            if (targetCategory && e.category !== targetCategory) {
                e.category = targetCategory;
                changed = true;
            }
        }

        if (matchedRule.txnType) {
            const targetType = normalizeTxnType(matchedRule.txnType);
            if (targetType && e.txnType !== targetType) {
                e.txnType = targetType;
                // Keep amount sign consistent with transaction type conventions
                if (e.txnType === 'Income' || e.txnType === 'Refund') {
                    e.amount = -Math.abs(e.amount);
                } else {
                    e.amount = Math.abs(e.amount);
                }
                changed = true;
            }
        }

        if (matchedRule.txnMode) {
            const targetMode = resolveTxnModeName(matchedRule.txnMode, state.txnModes);
            if (targetMode && e.txnMode !== targetMode) {
                e.txnMode = targetMode;
                changed = true;
            }
        }

        if (changed) {
            totalUpdated++;
            if (e.date && e.date.length >= 4) {
                modifiedYears.add(e.date.slice(0, 4));
            }
        }
    }

    if (totalUpdated > 0) {
        try {
            for (const yr of modifiedYears) {
                await saveYearCSV(yr);
            }
            hideLoader();
            renderAll();
            toast(`Updated ${totalUpdated} transaction(s) across ${modifiedYears.size} year(s)`, 'success');
        } catch (err) {
            hideLoader();
            console.error("Failed to save updated transactions to cloud:", err);
            renderAll();
            toast(`Updated ${totalUpdated} transaction(s), but cloud save failed`, 'error');
        }
    } else {
        hideLoader();
        if (totalMatched > 0) {
            toast(`All ${totalMatched} matching transaction(s) already match rule values`, 'info');
        } else {
            toast('No matching transactions found in history', 'info');
        }
    }
}

/**
 * Synchronizes keyword mappings when a Category or Transaction Mode is renamed or deleted.
 * @param {'category'|'txnmode'} entityType - 'category' or 'txnmode'
 * @param {'rename'|'delete'} action - 'rename' or 'delete'
 * @param {string} oldName - The old name being renamed or deleted
 * @param {string|null} newNameOrFallback - The new name (for rename) or fallback replacement (for delete)
 * @returns {Promise<boolean>} Whether any keyword mappings were changed
 */
export async function syncKeywordMappingsOnEntityChange(entityType, action, oldName, newNameOrFallback) {
    if (!state.keywordMappings || !Array.isArray(state.keywordMappings) || state.keywordMappings.length === 0) {
        return false;
    }
    if (!oldName) return false;

    const field = entityType === 'category' ? 'category' : 'txnMode';
    const cleanOld = stripEmojiPrefix(oldName).trim().toLowerCase();
    let changed = false;

    const matchesEntity = (val) => {
        if (!val) return false;
        return stripEmojiPrefix(val).trim().toLowerCase() === cleanOld;
    };

    if (action === 'rename') {
        const targetNew = stripEmojiPrefix(newNameOrFallback || '');
        if (!targetNew || matchesEntity(targetNew)) return false;

        state.keywordMappings.forEach(rule => {
            if (matchesEntity(rule[field])) {
                rule[field] = targetNew;
                changed = true;
            }
        });
    } else if (action === 'delete') {
        const targetFallback = newNameOrFallback ? stripEmojiPrefix(newNameOrFallback) : null;
        const nextRules = [];

        for (const rule of state.keywordMappings) {
            if (matchesEntity(rule[field])) {
                changed = true;
                if (targetFallback) {
                    rule[field] = targetFallback;
                    nextRules.push(rule);
                } else {
                    rule[field] = null;
                    // Keep rule if it still has at least one other override (e.g. txnType or the other entity)
                    if (rule.category || rule.txnType || rule.txnMode) {
                        nextRules.push(rule);
                    }
                    // Else rule has no remaining overrides, omit it from nextRules
                }
            } else {
                nextRules.push(rule);
            }
        }
        state.keywordMappings = nextRules;
    }

    if (changed) {
        localStorage.setItem('expman_keyword_mappings', JSON.stringify(state.keywordMappings));
        try {
            await updateUserSettings({ keywordMappings: state.keywordMappings });
        } catch (err) {
            console.error("Failed to sync updated keyword mappings to cloud:", err);
        }
        if (typeof renderKeywordMappings === 'function') {
            try {
                renderKeywordMappings();
            } catch (e) {
                // Table might not be mounted if on another view
            }
        }
    }

    return changed;
}

// Attach to window for inline HTML onclick attributes
window.openKeywordMappingModal = openKeywordMappingModal;
window.editKeywordMapping = openKeywordMappingModal;
window.deleteKeywordMapping = deleteKeywordMapping;
window.renderKeywordMappings = renderKeywordMappings;
window.runKeywordMappingOnExisting = runKeywordMappingOnExisting;
window.runAllKeywordMappingsOnExisting = runAllKeywordMappingsOnExisting;
window.syncKeywordMappingsOnEntityChange = syncKeywordMappingsOnEntityChange;


/**
 * Toggles whether a keyword mapping rule is enabled or disabled.
 * @param {number} index
 * @param {boolean} enabled
 */
export async function toggleKeywordMappingEnabled(index, enabled) {
    if (!state.keywordMappings || !state.keywordMappings[index]) return;
    state.keywordMappings[index].enabled = Boolean(enabled);
    localStorage.setItem('expman_keyword_mappings', JSON.stringify(state.keywordMappings));
    try {
        await updateUserSettings({ keywordMappings: state.keywordMappings });
        toast(`Keyword rule for "${state.keywordMappings[index].keyword}" ${enabled ? 'enabled' : 'disabled'}`, 'info');
    } catch (err) {
        console.error("Failed to sync keyword mapping toggle to cloud:", err);
    }
    renderKeywordMappings();
}
window.toggleKeywordMappingEnabled = toggleKeywordMappingEnabled;
