import { $, $$ } from "../core/init.js";
import { state } from "../core/state.js";
import { amountToStr, saveBalanceCSV } from "../services/storage.js";
import { escHtml, getLocalDateString, toast } from "../utils/helpers.js";
import { evaluateExpression } from "./form.js";
import { ensureChartFullscreenButton, openChartPopup } from "./chart_popup.js";

let newColumnDate = null;
let currentAccounts = [];
let currentTypes = [];

function setupAutocomplete(input, getOptions) {
    if (!input) return;
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    input.parentNode.appendChild(dropdown);

    let activeIndex = -1;

    function renderOptions(query) {
        const options = getOptions();
        const filtered = query ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options;
        
        dropdown.innerHTML = '';
        if (filtered.length === 0) {
            dropdown.classList.remove('show');
            return;
        }

        filtered.forEach((opt, idx) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = opt;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = opt;
                dropdown.classList.remove('show');
            });
            dropdown.appendChild(item);
        });
        dropdown.classList.add('show');
        
        // Smart positioning: if there is not enough space below, open upwards
        const rect = input.getBoundingClientRect();
        if (window.innerHeight - rect.bottom < 200) {
            dropdown.style.top = 'auto';
            dropdown.style.bottom = 'calc(100% + 4px)';
        } else {
            dropdown.style.bottom = 'auto';
            dropdown.style.top = 'calc(100% + 4px)';
        }
        
        activeIndex = -1;
    }

    input.addEventListener('focus', () => renderOptions(input.value));
    input.addEventListener('input', () => renderOptions(input.value));
    input.addEventListener('blur', () => dropdown.classList.remove('show'));
    
    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.autocomplete-item');
        if (!dropdown.classList.contains('show') || items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % items.length;
            updateActive(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = activeIndex - 1;
            if (activeIndex < 0) activeIndex = items.length - 1;
            updateActive(items);
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            items[activeIndex].dispatchEvent(new Event('mousedown'));
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('show');
        }
    });

    function updateActive(items) {
        items.forEach((item, idx) => {
            if (idx === activeIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }
}

export function initBalanceTracker() {
    const form = $('#form-balance');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const date = $('#input-balance-date').value;
            const account = $('#input-balance-account').value.trim();
            const type = $('#input-balance-type').value.trim();
            const rawAmount = $('#input-balance-amount').value.trim();
            
            const amtRegex = /^(-?)(\d+\.?\d*)([+\-*](\d+\.?\d*))*$/;
            if (!amtRegex.test(rawAmount)) {
                toast('Please enter a valid amount or mathematical expression (e.g. 500, 100+50*2)', 'error');
                $('#input-balance-amount').style.borderColor = 'var(--amount-negative)';
                $('#input-balance-amount').focus();
                return;
            }
            
            const amount = evaluateExpression(rawAmount);

            if (!date || !account || isNaN(amount)) {
                toast("Please fill in all fields correctly.", "error");
                return;
            }
            $('#input-balance-amount').style.borderColor = '';

            const editId = $('#edit-balance-id') ? $('#edit-balance-id').value : '';
            
            if (editId) {
                const idx = state.balanceData.findIndex(d => d.id === editId);
                if (idx !== -1) {
                    state.balanceData[idx] = { id: editId, date, account, type, amount, amountExpression: rawAmount === String(amount) ? '' : rawAmount };
                }
                if ($('#edit-balance-id')) $('#edit-balance-id').value = '';
                const btn = $('#btn-balance-submit');
                if (btn) btn.textContent = 'Save Balance';
            } else {
                const id = Date.now().toString() + Math.random().toString(36).substring(2);
                state.balanceData.push({ id, date, account, type, amount, amountExpression: rawAmount === String(amount) ? '' : rawAmount });
            }
            
            if (date === newColumnDate) newColumnDate = null;

            state.balanceData.sort((a, b) => b.date.localeCompare(a.date));

            // Optimistic UI update
            renderBalanceTracker();
            $('#input-balance-account').value = '';
            $('#input-balance-type').value = '';
            $('#input-balance-amount').value = '';

            try {
                await saveBalanceCSV();
                toast(editId ? "Balance updated." : "Balance saved.", "success");
            } catch (err) {
                console.error(err);
                toast("Failed to save balance to cloud.", "error");
            }
        });
    }

    // Default date to today
    const dateInput = $('#input-balance-date');
    if (dateInput && !dateInput.value) {
        dateInput.value = getLocalDateString();
    }
    setupAutocomplete(document.getElementById('input-balance-account'), () => currentAccounts);
    setupAutocomplete(document.getElementById('input-balance-type'), () => currentTypes);
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        const currentWidth = window.innerWidth;
        if ((lastWidth <= 768 && currentWidth > 768) || (lastWidth > 768 && currentWidth <= 768)) {
            lastWidth = currentWidth;
            renderBalanceTracker();
        }
    });
}

// Removed renderAccountSuggestions

function formatPivotDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

export function renderBalanceTracker() {
    const table = document.getElementById('balance-tracker-table');
    if (table) {
        if (window.innerWidth <= 768) table.classList.remove('matrix-table');
        else table.classList.add('matrix-table');
    }

    // Populate unique accounts for suggestions
    const uniqueAccounts = [...new Map(state.balanceData.map(d => [d.account + '::' + (d.type || ''), { account: d.account, type: d.type || '' }])).values()].sort((a, b) => a.account.localeCompare(b.account) || a.type.localeCompare(b.type));
    
    currentAccounts = [...new Set(uniqueAccounts.map(u => u.account))].sort();
    currentTypes = [...new Set(uniqueAccounts.map(u => u.type).filter(t => t))].sort();

    // Get unique dates sorted descending
    const uniqueDatesRaw = [...new Set(state.balanceData.map(b => b.date))];
    const uniqueDates = uniqueDatesRaw.sort((a, b) => b.localeCompare(a));
    
    if (newColumnDate && !uniqueDates.includes(newColumnDate)) {
        uniqueDates.unshift(newColumnDate);
    }

    const thead = $('#balance-table-head');
    const tbody = $('#balance-table-body');
    const tfoot = $('#balance-table-foot');
    if (!thead || !tbody) return;

    const addCard = document.querySelector('.add-data-point-card');

    if (!state.balanceData || state.balanceData.length === 0) {
        thead.innerHTML = '';
        if (tfoot) tfoot.innerHTML = '';
        tbody.innerHTML = `<tr><td style="text-align: center; color: var(--text-muted); padding: 24px;">No balance data yet.</td></tr>`;
        if (addCard) {
            addCard.style.setProperty('display', 'block', 'important');
        }
        return;
    }
    
    if (addCard) {
        addCard.style.removeProperty('display');
    }

    // Build bipartite graph for both mobile and desktop
    const adj = new Map();
    const accNodes = new Set();
    const typeNodes = new Set();
    
    uniqueAccounts.forEach(p => {
        const aId = 'A:' + p.account;
        const tId = 'T:' + p.type;
        accNodes.add(aId);
        typeNodes.add(tId);
        if (!adj.has(aId)) adj.set(aId, new Set());
        if (!adj.has(tId)) adj.set(tId, new Set());
        adj.get(aId).add(tId);
        adj.get(tId).add(aId);
    });

    const visited = new Set();
    const components = [];
    
    for (const node of [...accNodes, ...typeNodes]) {
        if (!visited.has(node)) {
            const compAccs = new Set();
            const compTypes = new Set();
            const q = [node];
            visited.add(node);
            
            while (q.length > 0) {
                const curr = q.shift();
                if (curr.startsWith('A:')) compAccs.add(curr.substring(2));
                else compTypes.add(curr.substring(2));
                
                if (adj.has(curr)) {
                    for (const neighbor of adj.get(curr)) {
                        if (!visited.has(neighbor)) {
                            visited.add(neighbor);
                            q.push(neighbor);
                        }
                    }
                }
            }
            components.push({ accounts: [...compAccs].sort((a,b)=>a.localeCompare(b)), types: [...compTypes].sort((a,b)=>a.localeCompare(b)) });
        }
    }

    // Sort components by first account name
    components.sort((a, b) => a.accounts[0].localeCompare(b.accounts[0]));

    const uniqueAccountsOrdered = [];
    const groupingMode = new Map(); // Store whether each pair is grouped by 'account' or 'type'

    components.forEach(comp => {
        const pairsInComp = uniqueAccounts.filter(p => comp.accounts.includes(p.account) && comp.types.includes(p.type));
        
        if (comp.accounts.length > 1 && comp.types.length === 1) {
            // N-to-1 mapping: Group by Type
            pairsInComp.sort((a, b) => a.account.localeCompare(b.account));
            pairsInComp.forEach(p => {
                uniqueAccountsOrdered.push(p);
                groupingMode.set(p.account + '::' + p.type, 'type');
            });
        } else {
            // Group by Account
            pairsInComp.sort((a, b) => a.account.localeCompare(b.account) || a.type.localeCompare(b.type));
            pairsInComp.forEach(p => {
                uniqueAccountsOrdered.push(p);
                groupingMode.set(p.account + '::' + p.type, 'account');
            });
        }
    });

    uniqueAccounts.length = 0;
    uniqueAccounts.push(...uniqueAccountsOrdered);

    window.balanceIgnoredRows = window.balanceIgnoredRows || new Set();

    if (window.innerWidth <= 768) {
        thead.innerHTML = '';
        const tableWrap = tbody.closest('.table-wrap');
        if (tableWrap) tableWrap.style.whiteSpace = 'normal';


        // Group data by date
        const grouped = {};
        state.balanceData.forEach(b => {
            if (!grouped[b.date]) grouped[b.date] = [];
            grouped[b.date].push(b);
        });
        
        const sortedDates = Object.keys(grouped).sort((a,b) => b.localeCompare(a));
        window.balanceMobileShowDates = window.balanceMobileShowDates || 1;
        const limit = window.balanceMobileShowDates;
        const datesToShow = sortedDates.slice(0, limit);
        
        let html = '';
        
        datesToShow.forEach(date => {
            // Group header
            html += `<tr><td colspan="4" style="background: var(--bg-card); font-weight: bold; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); color: var(--accent); font-size: 0.95em;">${formatPivotDate(date)}</td></tr>`;
            
            // For mobile, find effective balances for all unique accounts on this date
            const recordsOrdered = [];
            uniqueAccountsOrdered.forEach(u => {
                const allEntries = state.balanceData.filter(r => r.account === u.account && (r.type || '') === u.type);
                // state.balanceData is sorted descending by date
                const entry = allEntries.find(r => r.date <= date);
                if (entry && entry.amount !== 0) {
                    recordsOrdered.push({
                        id: entry.date === date ? entry.id : '',
                        date: date,
                        account: entry.account,
                        type: entry.type,
                        amount: entry.amount,
                        amountExpression: entry.amountExpression || '',
                        isCarryForward: entry.date !== date
                    });
                }
            });
            
            let lastGroupVal = null;
            let lastGroupMode = null;

            recordsOrdered.forEach(b => {
                const mode = groupingMode.get(b.account + '::' + (b.type || ''));
                const currentGroupVal = mode === 'type' ? b.type : b.account;
                
                let showAccount = true;
                let showType = true;

                if (mode === lastGroupMode && currentGroupVal === lastGroupVal) {
                    if (mode === 'type') showType = false;
                    if (mode === 'account') showAccount = false;
                }

                lastGroupMode = mode;
                lastGroupVal = currentGroupVal;

                html += `
                    <tr class="balance-row">
                        <td style="width: 32%; max-width: 28vw; padding: 10px 4px 10px 12px; font-weight: 500; font-size: 0.95em; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid var(--border-subtle); opacity: ${showAccount ? '1' : '0'}; cursor: text;" class="editable-account-cell" data-old="${escHtml(b.account)}" data-type="${escHtml(b.type || '')}" data-id="${escHtml(b.id)}" title="Click to edit">
                            <span class="account-name-span">${escHtml(b.account)}</span>
                        </td>
                        <td style="width: 22%; max-width: 20vw; padding: 10px 4px; color: var(--text-muted); font-size: 0.85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid var(--border-subtle); opacity: ${showType ? '1' : '0'}; cursor: text;" class="editable-type-cell" data-old="${escHtml(b.type || '')}" data-account="${escHtml(b.account)}" data-id="${escHtml(b.id)}" title="Click to edit">
                            <span class="account-type-span">${escHtml(b.type || '-')}</span>
                        </td>
                        <td style="width: auto; padding: 10px 4px; text-align: right; cursor: text; border-bottom: 1px solid var(--border-subtle);" title="Click to edit" class="editable-balance-cell" data-account="${escHtml(b.account)}" data-type="${escHtml(b.type || '')}" data-date="${b.date}" data-val="${b.amount}" data-expr="${escHtml(b.amountExpression || '')}">
                            <span style="font-size: ${b.isCarryForward ? '1em' : '1.05em'}; font-weight: ${b.isCarryForward ? 'normal' : 'bold'}; color: ${b.amount > 0 ? (b.isCarryForward ? '#85c3ac' : '#8cebc8') : b.amount < 0 ? 'var(--red)' : 'var(--text-main)'}; opacity: ${b.isCarryForward ? '0.35' : '0.85'}; white-space: nowrap;">₹${amountToStr(b.amount)}</span>
                        </td>
                        <td style="width: 32px; padding: 10px 8px 10px 4px; text-align: right; border-bottom: 1px solid var(--border-subtle);">
                            <button class="delete-balance-btn" data-id="${escHtml(b.id)}" title="Delete" style="padding: 4px; font-size: 1.1rem; border: none; background: transparent; cursor: pointer; color: var(--amount-negative); ${b.isCarryForward ? 'display: none;' : ''}">🗑️</button>
                        </td>
                        <td style="display: none;" data-label="Date">${formatPivotDate(b.date)}</td>
                    </tr>
                `;
            });
            
            let pos = 0;
            let neg = 0;
            recordsOrdered.forEach(b => {
                if (b.amount > 0) pos += b.amount;
                else if (b.amount < 0) neg += b.amount;
            });
            
            html += `
                <tr style="background: rgba(34, 197, 94, 0.15);">
                    <td colspan="2" style="padding: 10px 4px 10px 12px; font-weight: bold; font-size: 0.9em; color: rgb(74, 222, 128); border-bottom: none;">Assets (+)</td>
                    <td colspan="2" style="padding: 10px 12px 10px 4px; text-align: right; font-weight: bold; font-size: 0.95em; color: rgb(74, 222, 128); border-bottom: none;">₹${amountToStr(pos)}</td>
                </tr>
                <tr style="background: rgba(239, 68, 68, 0.15);">
                    <td colspan="2" style="padding: 10px 4px 10px 12px; font-weight: bold; font-size: 0.9em; color: var(--amount-negative); border-bottom: none;">Liabilities (-)</td>
                    <td colspan="2" style="padding: 10px 12px 10px 4px; text-align: right; font-weight: bold; font-size: 0.95em; color: var(--amount-negative); border-bottom: none;">₹${amountToStr(Math.abs(neg))}</td>
                </tr>
                <tr style="background: var(--accent);">
                    <td colspan="2" style="padding: 12px 4px 12px 12px; font-weight: bold; font-size: 1em; color: white; border-bottom: 6px solid var(--bg-main);">Net Balance</td>
                    <td colspan="2" style="padding: 12px 12px 12px 4px; text-align: right; font-weight: bold; font-size: 1.1em; color: white; border-bottom: 6px solid var(--bg-main);">₹${amountToStr(pos + neg)}</td>
                </tr>
            `;
        });
        
        if (limit < sortedDates.length) {
            html += `<tr><td colspan="4" style="text-align: center; padding: 16px; border: none;"><button id="btn-balance-mobile-show-more" style="display: inline-block; padding: 8px 24px; background: var(--bg-hover); color: var(--text-main); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-weight: bold;">Show More</button></td></tr>`;
        }
        
        tbody.innerHTML = html;
        
        const btnMore = document.getElementById('btn-balance-mobile-show-more');
        if (btnMore) {
            btnMore.addEventListener('click', (e) => {
                e.preventDefault();
                window.balanceMobileShowDates += 3;
                renderBalanceTracker();
            });
        }
    } else {
        const tableWrap = tbody.closest('.table-wrap');
        if (tableWrap) tableWrap.style.whiteSpace = 'nowrap';
        // Render header
        thead.innerHTML = `
            <tr>
                <th style="text-align: left; position: sticky; left: 0; background: #121620; z-index: 2; min-width: 160px; max-width: 160px; width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <div style="display: flex; align-items: center; gap: 8px; max-width: 100%; overflow: hidden;">
                        <input type="checkbox" id="toggle-all-rows" ${window.balanceIgnoredRows.size === 0 ? 'checked' : ''} title="Toggle all">
                        <span>Account <span style="font-size: 0.7em;">▼</span></span>
                    </div>
                </th>
                <th style="text-align: left; position: sticky; left: 160px; background: #121620; z-index: 2; border-right: 1px solid var(--border);">
                    <div style="display: flex; align-items: center;">
                        <span>Type <span style="font-size: 0.7em;">▼</span></span>
                    </div>
                    <div data-tooltip="Add Today's Entry" data-tooltip-pos="left" style="position: absolute; right: 0; top: 50%; transform: translate(50%, -50%); display: flex;">
                        <button id="btn-add-column" style="padding: 4px; font-size: 1.1rem; line-height: 1; border: none; background: #121620; color: var(--accent); cursor: ${uniqueDatesRaw.includes(getLocalDateString()) ? 'not-allowed' : 'pointer'}; font-weight: bold; border-radius: 50%; ${uniqueDatesRaw.includes(getLocalDateString()) ? 'opacity: 0.3; pointer-events: none;' : ''}">+</button>
                    </div>
                </th>
                ${uniqueDates.map(d => {
                    if (d === newColumnDate) {
                        return `<th style="text-align: right; min-width: 140px; background: var(--bg-hover);">
                                    <input type="date" id="new-column-date-input" value="${newColumnDate}" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--accent); border-radius: 4px; padding: 2px 4px; font-size: 0.85em; width: 110px;">
                                    <button id="btn-close-column" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; padding: 0 2px;">&times;</button>
                                </th>`;
                    }
                    return `<th style="text-align: right; min-width: 100px;">${formatPivotDate(d)} <span style="font-size: 0.7em;">▼</span></th>`;
                }).join('')}
            </tr>
        `;

        const allRowsHtml = [];
        let i = 0;
        while (i < uniqueAccounts.length) {
            const p = uniqueAccounts[i];
            const mode = groupingMode.get(p.account + '::' + p.type);
            if (mode === 'type') {
                let j = i;
                while (j < uniqueAccounts.length && groupingMode.get(uniqueAccounts[j].account + '::' + uniqueAccounts[j].type) === 'type' && uniqueAccounts[j].type === p.type) j++;
                const span = j - i;
                for (let k = i; k < j; k++) {
                    const currP = uniqueAccounts[k];
                    const isFirst = k === i;
                    let allIgnored = true;
                    if (isFirst) {
                        for(let m = i; m < j; m++) {
                            if(!window.balanceIgnoredRows.has(uniqueAccounts[m].account + '::' + (uniqueAccounts[m].type || ''))) {
                                allIgnored = false; break;
                            }
                        }
                    }
                    
                    const typeTd = isFirst ? `
                        <td rowspan="${span}" data-label="Type" style="position: sticky; left: 160px; background: #121620; color: var(--text-muted); font-size: 0.9em; z-index: 1; min-width: 100px; vertical-align: middle; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border-subtle); cursor: text;" class="editable-type-cell balance-type-cell" data-old="${escHtml(currP.type || '')}" data-account="${escHtml(currP.account)}" title="Click to edit">
                            <div style="display: flex; align-items: center; gap: 8px; max-width: 100%; overflow: hidden;">
                                ${span > 1 ? `<input type="checkbox" class="group-visibility-toggle" data-group-type="type" data-group-val="${escHtml(currP.type || '')}" ${allIgnored ? '' : 'checked'} style="cursor: pointer;" title="Toggle group">` : ''}
                                <span class="account-type-span" style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escHtml(currP.type)}</span>
                            </div>
                        </td>` : '';
                    const accountTd = `
                        <td style="position: sticky; left: 0; background: #121620; font-weight: 500; z-index: 1; min-width: 160px; max-width: 160px; width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; border-bottom: 1px solid var(--border-subtle); cursor: text;" class="editable-account-cell" data-old="${escHtml(currP.account)}" data-type="${escHtml(currP.type || '')}" title="Click to edit">
                            <div style="display: flex; align-items: center; gap: 8px; max-width: 100%; overflow: hidden;">
                                <input type="checkbox" class="row-visibility-toggle" data-key="${escHtml(currP.account + '::' + (currP.type || ''))}" data-account="${escHtml(currP.account)}" data-type="${escHtml(currP.type || '')}" ${window.balanceIgnoredRows.has(currP.account + '::' + (currP.type || '')) ? '' : 'checked'} style="cursor: pointer;">
                                <span class="account-name-span" style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escHtml(currP.account)}</span>
                            </div>
                        </td>`;
                    allRowsHtml.push(renderSingleRow(currP, accountTd, typeTd, uniqueDates));
                }
                i = j;
            } else {
                let j = i;
                while (j < uniqueAccounts.length && groupingMode.get(uniqueAccounts[j].account + '::' + uniqueAccounts[j].type) === 'account' && uniqueAccounts[j].account === p.account) j++;
                const span = j - i;
                for (let k = i; k < j; k++) {
                    const currP = uniqueAccounts[k];
                    const isFirst = k === i;
                    let allIgnored = true;
                    if (isFirst) {
                        for(let m = i; m < j; m++) {
                            if(!window.balanceIgnoredRows.has(uniqueAccounts[m].account + '::' + (uniqueAccounts[m].type || ''))) {
                                allIgnored = false; break;
                            }
                        }
                    }
                    
                    const accountTd = isFirst ? `
                        <td rowspan="${span}" data-label="Account" style="position: sticky; left: 0; background: #121620; font-weight: 500; z-index: 1; min-width: 160px; max-width: 160px; width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; border-bottom: 1px solid var(--border-subtle); cursor: text;" class="editable-account-cell" data-old="${escHtml(currP.account)}" data-type="${escHtml(currP.type || '')}" title="Click to edit">
                            <div style="display: flex; align-items: center; gap: 8px; max-width: 100%; overflow: hidden;">
                                ${span > 1 ? `<input type="checkbox" class="group-visibility-toggle" data-group-type="account" data-group-val="${escHtml(currP.account)}" ${allIgnored ? '' : 'checked'} style="cursor: pointer;" title="Toggle group">` : `<input type="checkbox" class="row-visibility-toggle" data-key="${escHtml(currP.account + '::' + (currP.type || ''))}" data-account="${escHtml(currP.account)}" data-type="${escHtml(currP.type || '')}" ${window.balanceIgnoredRows.has(currP.account + '::' + (currP.type || '')) ? '' : 'checked'} style="cursor: pointer;">`}
                                <span class="account-name-span" style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escHtml(currP.account)}</span>
                            </div>
                        </td>` : '';
                    const typeTd = `
                        <td style="position: sticky; left: 160px; background: #121620; color: var(--text-muted); font-size: 0.9em; z-index: 1; min-width: 100px; vertical-align: middle; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border-subtle); cursor: text;" class="editable-type-cell balance-type-cell" data-old="${escHtml(currP.type || '')}" data-account="${escHtml(currP.account)}" title="Click to edit">
                            <div style="display: flex; align-items: center; gap: 8px; max-width: 100%; overflow: hidden;">
                                ${span > 1 ? `<input type="checkbox" class="row-visibility-toggle" data-key="${escHtml(currP.account + '::' + (currP.type || ''))}" data-account="${escHtml(currP.account)}" data-type="${escHtml(currP.type || '')}" ${window.balanceIgnoredRows.has(currP.account + '::' + (currP.type || '')) ? '' : 'checked'} style="cursor: pointer;">` : ''}
                                <span class="account-type-span" style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escHtml(currP.type)}</span>
                            </div>
                        </td>`;
                    allRowsHtml.push(renderSingleRow(currP, accountTd, typeTd, uniqueDates));

                }
                i = j;
            }
        }
        
        allRowsHtml.push(`
            <tr id="desktop-add-btn-row">
                <td colspan="2" style="position: sticky; left: 0; background: #121620; z-index: 1; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border-subtle); text-align: center; padding: 4px; cursor: pointer;" id="btn-show-desktop-add-row" title="Add Data Point">
                    <span style="font-size: 1.2rem; font-weight: bold; color: var(--accent);">+</span>
                </td>
                <td colspan="${uniqueDates.length}" style="background: #121620; border-bottom: 1px solid var(--border-subtle);"></td>
            </tr>
            <tr id="desktop-add-form-row" style="display: none; background: #121620;">
                <td style="position: sticky; left: 0; background: #121620; z-index: 1; border-bottom: 1px solid var(--border-subtle); padding: 8px; min-width: 160px; max-width: 160px; width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <input type="text" id="desktop-balance-account" placeholder="Account" style="width: 100%; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; font-size: 0.9em;" autocomplete="off">
                </td>
                <td style="position: sticky; left: 160px; background: #121620; z-index: 1; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border-subtle); padding: 8px;">
                    <input type="text" id="desktop-balance-type" placeholder="Type" style="width: 100%; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; font-size: 0.9em;" autocomplete="off">
                </td>
                <td colspan="${uniqueDates.length}" style="padding: 8px; border-bottom: 1px solid var(--border-subtle);">
                    <div style="display: flex; gap: 8px; align-items: center; justify-content: flex-start; max-width: 400px;">
                        <input type="date" id="desktop-balance-date" value="${getLocalDateString()}" style="width: 130px; flex-shrink: 0; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; font-size: 0.9em;">
                        <input type="text" id="desktop-balance-amount" placeholder="Amount (e.g. 500)" style="width: 140px; flex-shrink: 0; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; font-size: 0.9em;">
                        <button id="btn-desktop-balance-submit" class="btn btn-primary btn-sm" style="padding: 6px 12px; font-size: 0.9em; flex-shrink: 0;">Save</button>
                        <button id="btn-desktop-balance-cancel" class="btn btn-ghost btn-sm" style="padding: 6px 12px; font-size: 0.9em; flex-shrink: 0; background: transparent; color: var(--text-muted); border: 1px solid var(--border);">Cancel</button>
                    </div>
                </td>
            </tr>
        `);

        tbody.innerHTML = allRowsHtml.join('');
    }

        function renderSingleRow(u, accountTd, typeTd, uniqueDates) {
            return `
                <tr class="balance-row">
                    ${accountTd}
                    ${typeTd}
                    ${uniqueDates.map(date => {
                        const match = state.balanceData.find(b => b.account === u.account && (b.type || '') === u.type && b.date === date);
                        if (match) {
                            return `
                            <td style="text-align: right; cursor: text; ${date === newColumnDate ? 'background: var(--bg-hover);' : ''}"
                                title="Click to edit"
                                class="editable-balance-cell" 
                                data-label="${formatPivotDate(date)}"
                                data-account="${escHtml(u.account)}" 
                                data-type="${escHtml(u.type || '')}" 
                                data-date="${date}" 
                                data-val="${match.amount}"
                                data-expr="${escHtml(match.amountExpression || '')}">
                                <div style="position: relative; display: inline-flex; align-items: center; justify-content: flex-end; padding-left: 28px;" class="balance-cell-wrap">
                                    <div class="balance-actions" style="position: absolute; left: 0; display: flex; gap: 8px; opacity: 0; transition: opacity 0.2s;">
                                        <button class="delete-balance-btn" data-id="${escHtml(match.id)}" title="Delete" style="padding: 2px; font-size: 0.8rem; border: none; background: transparent; cursor: pointer; color: var(--amount-negative);">🗑️</button>
                                    </div>
                                    <span style="color: ${match.amount > 0 ? '#8cebc8' : match.amount < 0 ? 'var(--red)' : 'inherit'}; opacity: 0.85;">₹${amountToStr(match.amount)}</span>
                                </div>
                            </td>`;
                        }
                        
                        const carry = state.balanceData.find(b => b.account === u.account && (b.type || '') === u.type && b.date < date);
                        const cellValue = carry ? carry.amount : '';
                        const cellLabel = carry ? `₹${amountToStr(carry.amount)}` : '-';
                        const cellTitle = carry ? `Carried over from ${formatPivotDate(carry.date)} (Click to edit)` : 'Click to add entry';
                        const colorStyle = carry ? (carry.amount > 0 ? '#85c3ac' : carry.amount < 0 ? 'var(--red)' : 'var(--text-muted)') : 'var(--text-muted)';
                        
                        return `<td style="text-align: right; color: ${colorStyle}; font-style: ${carry ? 'italic' : 'normal'}; cursor: text; ${date === newColumnDate ? 'background: var(--bg-hover);' : ''}" 
                                    title="${cellTitle}" 
                                    class="editable-balance-cell"
                                    data-label="${formatPivotDate(date)}" 
                                    data-account="${escHtml(u.account)}" 
                                    data-type="${escHtml(u.type || '')}" 
                                    data-date="${date}" 
                                    data-val="${cellValue}"
                                    data-expr="${escHtml(carry ? (carry.amountExpression || '') : '')}">
                                    <span style="opacity: ${carry ? '0.35' : '0.85'};">${cellLabel}</span>
                                </td>`;
                    }).join('')}
                </tr>
            `;
        }

    // Attach delete listeners
    $$('.delete-balance-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm("Are you sure you want to delete this balance record?")) return;
            const id = e.currentTarget.dataset.id;
            const idx = state.balanceData.findIndex(d => d.id === id);
            if (idx !== -1) {
                state.balanceData.splice(idx, 1);
                renderBalanceTracker();
                try {
                    await saveBalanceCSV();
                    toast("Deleted balance record.", "success");
                } catch (err) {
                    console.error(err);
                    toast("Failed to delete record from cloud.", "error");
                }
            }
        });
    });

    // Simple hover effect for rows and cells
    $$('.balance-row').forEach(row => {
        row.addEventListener('mouseenter', () => {
            row.querySelectorAll('.edit-account-btn, .edit-type-btn').forEach(btn => {
                if (btn) btn.style.opacity = '1';
            });
        });
        row.addEventListener('mouseleave', () => {
            row.querySelectorAll('.edit-account-btn, .edit-type-btn').forEach(btn => {
                if (btn) btn.style.opacity = '0';
            });
        });
    });

    $$('.balance-cell-wrap').forEach(wrap => {
        wrap.addEventListener('mouseenter', () => {
            const actions = wrap.querySelector('.balance-actions');
            if (actions) actions.style.opacity = '1';
        });
        wrap.addEventListener('mouseleave', () => {
            const actions = wrap.querySelector('.balance-actions');
            if (actions) actions.style.opacity = '0';
        });
    });

    // Handle editable cells
    $$('.editable-balance-cell').forEach(cell => {
        cell.addEventListener('click', function() {
            if (this.querySelector('input')) return;
            
            const acc = this.dataset.account;
            const typ = this.dataset.type;
            const dt = this.dataset.date;
            const val = this.dataset.val;
            const expr = this.dataset.expr || '';

            const input = document.createElement('input');
            input.type = 'text';
            input.value = expr || val;
            input.style.cssText = 'width: 100%; text-align: right; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 6px 8px; font-size: 1em; line-height: 1.5; min-height: 32px; margin-bottom: 6px; box-sizing: border-box;';
            
            const evalPreview = document.createElement('div');
            evalPreview.style.cssText = 'text-align: right; font-size: 0.85em; color: var(--text-muted); font-weight: 500; min-height: 1.2em; line-height: 1.2;';
            
            const updatePreview = () => {
                const raw = input.value.trim();
                const amtRegex = /^(-?)(\d+\.?\d*)([+\-*](\d+\.?\d*))*$/;
                if (!raw) {
                    evalPreview.textContent = '';
                } else if (amtRegex.test(raw)) {
                    const amt = evaluateExpression(raw);
                    evalPreview.textContent = isNaN(amt) ? 'Error' : '= ₹' + amountToStr(amt);
                    if (amt > 0) {
                        evalPreview.style.color = 'var(--green)';
                    } else if (amt < 0) {
                        evalPreview.style.color = 'var(--red)';
                    } else {
                        evalPreview.style.color = 'var(--text-main)';
                    }
                } else {
                    evalPreview.textContent = 'Invalid expression';
                    evalPreview.style.color = 'var(--red)';
                }
            };
            
            input.addEventListener('input', updatePreview);
            
            const form = document.createElement('form');
            form.style.margin = '0';
            form.style.padding = '0';
            form.appendChild(input);
            
            const popup = document.createElement('div');
            popup.className = 'balance-edit-popup';
            popup.style.cssText = 'position: absolute; top: calc(100% + 4px); right: 0; z-index: 1000; background: #161b28; border: 1px solid var(--accent); padding: 10px; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); width: 260px; display: flex; flex-direction: column; cursor: default;';
            
            popup.addEventListener('mousedown', e => {
                if (e.target !== input) e.preventDefault();
            });
            
            popup.appendChild(form);
            popup.appendChild(evalPreview);
            
            this.style.position = 'relative';
            this.style.zIndex = '9999'; // Fix for iOS table stacking context overlap
            this.appendChild(popup);
            
            input.focus();
            input.select();
            updatePreview();
            
            let isSaving = false;
            const save = (e) => {
                if (e) e.preventDefault();
                if (isSaving) return;
                isSaving = true;
                
                const raw = input.value.trim();
                if (raw === '' || raw === String(val).trim()) {
                    renderBalanceTracker();
                    return;
                }
                
                const amtRegex = /^(-?)(\d+\.?\d*)([+\-*](\d+\.?\d*))*$/;
                if (!amtRegex.test(raw)) {
                    toast('Please enter a valid amount or mathematical expression (e.g. 500, 100+50*2)', 'error');
                    input.style.borderColor = 'var(--amount-negative)';
                    input.focus();
                    isSaving = false;
                    return;
                }
                
                const amt = evaluateExpression(raw);
                if (isNaN(amt)) {
                    toast('Invalid amount or math expression.', 'error');
                    input.style.borderColor = 'var(--amount-negative)';
                    input.focus();
                    isSaving = false;
                    return;
                }
                
                const existingEntry = state.balanceData.find(d => d.account === acc && (d.type || '') === typ && d.date === dt);
                if (existingEntry) {
                    existingEntry.amount = amt;
                    existingEntry.amountExpression = raw === String(amt) ? '' : raw;
                } else {
                    const id = Date.now().toString() + Math.random().toString(36).substring(2);
                    state.balanceData.push({ id, date: dt, account: acc, type: typ, amount: amt, amountExpression: raw === String(amt) ? '' : raw });
                }
                
                if (dt === newColumnDate) newColumnDate = null;

                state.balanceData.sort((a, b) => b.date.localeCompare(a.date));
                saveBalanceCSV();
                renderBalanceTracker();
            };
            
            form.addEventListener('submit', save);
            input.addEventListener('blur', () => { if (!isSaving) save(); });
            input.addEventListener('keydown', e => {
                if (e.key === 'Escape') {
                    isSaving = true;
                    renderBalanceTracker();
                }
            });
        });
    });

    // Handle inline rename for account
    $$('.editable-account-cell').forEach(cell => {
        cell.addEventListener('click', function(e) {
            e.stopPropagation();
            const span = this.querySelector('.account-name-span');
            if (!span || span.querySelector('input')) return;

            const oldAcc = this.dataset.old;
            const singleId = this.dataset.id;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = oldAcc;
            input.style.cssText = 'width: 100%; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--accent); border-radius: 4px; padding: 2px 4px; font-size: 0.9em; min-width: 120px;';
            
            const form = document.createElement('form');
            form.style.margin = '0';
            form.style.padding = '0';
            form.appendChild(input);
            
            span.innerHTML = '';
            span.appendChild(form);
            input.focus();
            input.select();
            
            let isSaving = false;
            const save = (e) => {
                if (e) e.preventDefault();
                if (isSaving) return;
                isSaving = true;
                
                const newAcc = input.value.trim();
                if (!newAcc) {
                    toast('Account name cannot be empty.', 'error');
                    input.style.borderColor = 'var(--amount-negative)';
                    input.focus();
                    isSaving = false;
                    return;
                }
                
                if (newAcc !== oldAcc) {
                    let hasCollision = false;
                    if (singleId) {
                        const rec = state.balanceData.find(d => d.id === singleId);
                        if (rec) {
                            hasCollision = state.balanceData.some(d => d.id !== singleId && d.date === rec.date && d.account === newAcc && (d.type || '') === (rec.type || ''));
                        }
                    } else {
                        const entriesToRename = state.balanceData.filter(d => d.account === oldAcc);
                        for (const rec of entriesToRename) {
                            if (state.balanceData.some(d => d.account === newAcc && d.date === rec.date && (d.type || '') === (rec.type || ''))) {
                                hasCollision = true;
                                break;
                            }
                        }
                    }
                    
                    if (hasCollision) {
                        toast(`Cannot rename to '${newAcc}' because it would create duplicate entries on the same date.`, 'error');
                        input.style.borderColor = 'var(--amount-negative)';
                        input.focus();
                        isSaving = false;
                        return;
                    }
                    
                    let updated = false;
                    if (singleId) {
                        const rec = state.balanceData.find(d => d.id === singleId);
                        if (rec) { rec.account = newAcc; updated = true; }
                    } else {
                        state.balanceData.forEach(b => {
                            if (b.account === oldAcc) {
                                b.account = newAcc;
                                updated = true;
                            }
                        });
                    }
                    if (updated) {
                        saveBalanceCSV();
                        renderBalanceTracker();
                        toast('Account renamed successfully.', 'success');
                    }
                } else {
                    renderBalanceTracker();
                }
            };
            
            form.addEventListener('submit', save);
            input.addEventListener('blur', () => { if (!isSaving) save(); });
            input.addEventListener('keydown', ev => {
                if (ev.key === 'Escape') {
                    isSaving = true;
                    renderBalanceTracker();
                }
            });
        });
    });

    // Handle inline rename for type
    $$('.editable-type-cell').forEach(cell => {
        cell.addEventListener('click', function(e) {
            e.stopPropagation();
            const span = this.querySelector('.account-type-span');
            if (!span || span.querySelector('input')) return;

            const oldTyp = this.dataset.old || '';
            const acc = this.dataset.account;
            const singleId = this.dataset.id;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = oldTyp;
            input.placeholder = 'Type...';
            input.style.cssText = 'width: 100%; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--accent); border-radius: 4px; padding: 2px 4px; font-size: 0.9em; min-width: 100px;';
            
            const form = document.createElement('form');
            form.style.margin = '0';
            form.style.padding = '0';
            form.appendChild(input);
            
            span.innerHTML = '';
            span.appendChild(form);
            input.focus();
            input.select();
            
            let isSaving = false;
            const save = (e) => {
                if (e) e.preventDefault();
                if (isSaving) return;
                isSaving = true;
                
                const newTyp = input.value.trim();
                if (!newTyp) {
                    toast('Account type cannot be empty.', 'error');
                    input.style.borderColor = 'var(--amount-negative)';
                    input.focus();
                    isSaving = false;
                    return;
                }
                
                if (newTyp !== oldTyp) {
                    let hasCollision = false;
                    if (singleId) {
                        const rec = state.balanceData.find(d => d.id === singleId);
                        if (rec) {
                            hasCollision = state.balanceData.some(d => d.id !== singleId && d.date === rec.date && d.account === rec.account && (d.type || '') === newTyp);
                        }
                    } else {
                        const entriesToRename = state.balanceData.filter(d => d.account === acc && (d.type || '') === oldTyp);
                        for (const rec of entriesToRename) {
                            if (state.balanceData.some(d => d.account === rec.account && d.date === rec.date && (d.type || '') === newTyp)) {
                                hasCollision = true;
                                break;
                            }
                        }
                    }
                    
                    if (hasCollision) {
                        toast(`Cannot rename type to '${newTyp}' as it would create duplicate entries on the same date.`, 'error');
                        input.style.borderColor = 'var(--amount-negative)';
                        input.focus();
                        isSaving = false;
                        return;
                    }
                    
                    let updated = false;
                    if (singleId) {
                        const rec = state.balanceData.find(d => d.id === singleId);
                        if (rec) { rec.type = newTyp; updated = true; }
                    } else {
                        state.balanceData.forEach(b => {
                            if (b.account === acc && (b.type || '') === oldTyp) {
                                b.type = newTyp;
                                updated = true;
                            }
                        });
                    }
                    if (updated) {
                        saveBalanceCSV();
                        renderBalanceTracker();
                        toast('Account type renamed successfully.', 'success');
                    }
                } else {
                    renderBalanceTracker();
                }
            };
            
            form.addEventListener('submit', save);
            input.addEventListener('blur', () => { if (!isSaving) save(); });
            input.addEventListener('keydown', ev => {
                if (ev.key === 'Escape') {
                    isSaving = true;
                    renderBalanceTracker();
                }
            });
        });
    });

    const btnAddColumn = $('#btn-add-column');
    if (btnAddColumn) {
        btnAddColumn.addEventListener('click', () => {
            if (!newColumnDate) {
                newColumnDate = getLocalDateString();
                renderBalanceTracker();
            }
        });
    }

    const newColumnInput = $('#new-column-date-input');
    if (newColumnInput) {
        newColumnInput.addEventListener('change', (e) => {
            if (e.target.value) {
                newColumnDate = e.target.value;
                renderBalanceTracker();
            }
        });
    }

    const btnCloseColumn = $('#btn-close-column');
    if (btnCloseColumn) {
        btnCloseColumn.addEventListener('click', () => {
            newColumnDate = null;
            renderBalanceTracker();
        });
    }

    const btnShowRow = $('#btn-show-desktop-add-row');
    if (btnShowRow) {
        btnShowRow.addEventListener('click', () => {
            const formRow = $('#desktop-add-form-row');
            if (formRow) {
                formRow.style.display = 'table-row';
                btnShowRow.parentElement.style.display = 'none';
            }
        });
    }

    const btnCancelInline = $('#btn-desktop-balance-cancel');
    if (btnCancelInline) {
        btnCancelInline.addEventListener('click', () => {
            const formRow = $('#desktop-add-form-row');
            if (formRow && btnShowRow) {
                formRow.style.display = 'none';
                btnShowRow.parentElement.style.display = 'table-row';
            }
        });
    }

    // Toggle row visibility
    document.querySelectorAll('.row-visibility-toggle').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const key = e.target.dataset.key;
            if (e.target.checked) {
                window.balanceIgnoredRows.delete(key);
            } else {
                window.balanceIgnoredRows.add(key);
            }
            renderBalanceTracker();
        });
    });

    // Toggle group visibility
    document.querySelectorAll('.group-visibility-toggle').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const groupType = e.target.dataset.groupType;
            const groupVal = e.target.dataset.groupVal;
            
            document.querySelectorAll('.row-visibility-toggle').forEach(rowChk => {
                if (rowChk.dataset[groupType] === groupVal) {
                    rowChk.checked = isChecked;
                    const key = rowChk.dataset.key;
                    if (isChecked) {
                        window.balanceIgnoredRows.delete(key);
                    } else {
                        window.balanceIgnoredRows.add(key);
                    }
                }
            });
            renderBalanceTracker();
        });
    });

    const toggleAll = $('#toggle-all-rows');
    if (toggleAll) {
        toggleAll.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.row-visibility-toggle').forEach(chk => {
                chk.checked = isChecked;
                const key = chk.dataset.key;
                if (isChecked) {
                    window.balanceIgnoredRows.delete(key);
                } else {
                    window.balanceIgnoredRows.add(key);
                }
            });
            renderBalanceTracker();
        });
    }

    const btnSubmitInline = $('#btn-desktop-balance-submit');
    if (btnSubmitInline) {
        btnSubmitInline.addEventListener('click', async () => {
            const date = $('#desktop-balance-date').value;
            const account = $('#desktop-balance-account').value.trim();
            const type = $('#desktop-balance-type').value.trim();
            const rawAmount = $('#desktop-balance-amount').value.trim();
            
            const amtRegex = /^(-?)(\d+\.?\d*)([+\-*](\d+\.?\d*))*$/;
            if (!amtRegex.test(rawAmount)) {
                toast('Please enter a valid amount or mathematical expression (e.g. 500, 100+50*2)', 'error');
                $('#desktop-balance-amount').style.borderColor = 'var(--amount-negative)';
                return;
            }
            
            const amount = evaluateExpression(rawAmount);

            if (!date || !account || isNaN(amount)) {
                toast("Please fill in all fields correctly.", "error");
                return;
            }
            
            const id = Date.now().toString() + Math.random().toString(36).substring(2);
            state.balanceData.push({ id, date, account, type, amount, amountExpression: rawAmount === String(amount) ? '' : rawAmount });
            
            if (date === newColumnDate) newColumnDate = null;

            state.balanceData.sort((a, b) => b.date.localeCompare(a.date));

            renderBalanceTracker();

            try {
                await saveBalanceCSV();
                toast("Balance saved.", "success");
            } catch (err) {
                console.error(err);
                toast("Failed to save balance to cloud.", "error");
            }
        });
    }

    // Render totals
    if (tfoot) {
        if (window.innerWidth <= 768) {
            tfoot.innerHTML = '';
        } else {
            const totals = uniqueDates.map(date => {
                let pos = 0;
                let neg = 0;
                uniqueAccounts.forEach(u => {
                    if (window.balanceIgnoredRows.has(u.account + '::' + (u.type || ''))) return;
                    const carry = state.balanceData.find(b => b.account === u.account && (b.type || '') === u.type && b.date <= date);
                    if (carry) {
                        if (carry.amount > 0) pos += carry.amount;
                        else if (carry.amount < 0) neg += carry.amount;
                    }
                });
                return { pos, neg, net: pos + neg };
            });

            tfoot.innerHTML = `
                <tr style="background: rgba(34, 197, 94, 0.15);">
                    <td style="position: sticky; left: 0; background: #143029; color: rgb(74, 222, 128); z-index: 2; font-weight: bold; border-top: 2px solid var(--border); min-width: 160px; max-width: 160px; width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Assets (+)</td>
                    <td style="position: sticky; left: 160px; background: #143029; border-top: 2px solid var(--border); border-right: 1px solid var(--border);"></td>
                    ${totals.map(t => `<td style="text-align: right; color: rgb(74, 222, 128); border-top: 2px solid var(--border); font-weight: bold;">₹${amountToStr(t.pos)}</td>`).join('')}
                </tr>
                <tr style="background: rgba(239, 68, 68, 0.15);">
                    <td style="position: sticky; left: 0; background: #331d25; color: var(--amount-negative); z-index: 2; font-weight: bold; border-bottom: 2px solid var(--border); min-width: 160px; max-width: 160px; width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Liabilities (-)</td>
                    <td style="position: sticky; left: 160px; background: #331d25; border-right: 1px solid var(--border); border-bottom: 2px solid var(--border);"></td>
                    ${totals.map(t => `<td style="text-align: right; color: var(--amount-negative); border-bottom: 2px solid var(--border); font-weight: bold;">₹${amountToStr(Math.abs(t.neg))}</td>`).join('')}
                </tr>
                <tr style="background: var(--accent);">
                    <td style="position: sticky; left: 0; background: var(--accent); color: white; z-index: 2; font-weight: bold; border-top: none; min-width: 160px; max-width: 160px; width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Net Balance</td>
                    <td style="position: sticky; left: 160px; background: var(--accent); color: white; z-index: 2; font-weight: bold; border-top: none; border-right: 1px solid var(--border);"></td>
                    ${totals.map(t => `<td style="text-align: right; font-weight: bold; border-top: none; color: white;">₹${amountToStr(t.net)}</td>`).join('')}
                </tr>
            `;
        }
    }

    // Render the chart
    renderBalanceChart(uniqueAccounts, uniqueDates);
}

let balanceChartInstance = null;

function renderBalanceChart(uniqueAccounts, uniqueDatesDesc) {
    const canvas = document.getElementById('balance-chart');
    if (!canvas) return;

    if (balanceChartInstance) {
        balanceChartInstance.destroy();
    }

    if (!uniqueAccounts || uniqueAccounts.length === 0 || !uniqueDatesDesc || uniqueDatesDesc.length === 0) {
        return;
    }

    // Chart expects dates left-to-right (ascending)
    const datesAsc = [...uniqueDatesDesc].reverse();

    // Generate colors
    const colors = [
        '#638aff', '#34d399', '#f87171', '#a78bfa', '#fbbf24', 
        '#60a5fa', '#f472b6', '#38bdf8', '#fb923c', '#c084fc'
    ];

    const uniqueTypes = [...new Set(uniqueAccounts.map(u => u.type || '-'))];

    let datasets = uniqueTypes.flatMap((type, i) => {
        const color = colors[i % colors.length];
        const data = [];
        const pointRadii = [];
        const pointHoverRadii = [];

        // Find all accounts that belong to this type
        const accountsOfType = uniqueAccounts.filter(u => (u.type || '-') === type && !window.balanceIgnoredRows.has(u.account + '::' + (u.type || '')));
        const lastKnownBalances = {};

        datesAsc.forEach(date => {
            let totalForDate = 0;
            let hasActualDataPoint = false;
            accountsOfType.forEach(u => {
                const entry = state.balanceData.find(d => d.account === u.account && (d.type || '-') === type && d.date === date);
                if (entry) {
                    lastKnownBalances[u.account] = entry.amount; // Allow negative values for stacking
                    hasActualDataPoint = true;
                }
                totalForDate += (lastKnownBalances[u.account] || 0);
            });
            
            const [y, m, d_] = date.split('-');
            const timestamp = new Date(y, m - 1, d_).getTime();
            data.push({ x: timestamp, y: totalForDate });
            pointRadii.push(hasActualDataPoint ? 3 : 0);
            pointHoverRadii.push(hasActualDataPoint ? 5 : 0);
        });

        const hasPositive = data.some(val => val.y > 0);
        const hasNegative = data.some(val => val.y < 0);
        
        const result = [];
        
        if (hasPositive) {
            result.push({
                label: type,
                data: data.map(val => ({ x: val.x, y: Math.max(0, val.y) })),
                backgroundColor: color + '66',
                borderColor: color,
                borderWidth: 2,
                tension: 0.2,
                pointRadius: pointRadii,
                pointHoverRadius: pointHoverRadii,
                _isPositive: true
            });
        }
        
        if (hasNegative) {
            result.push({
                label: type,
                data: data.map(val => ({ x: val.x, y: Math.min(0, val.y) })),
                backgroundColor: color + '66',
                borderColor: color,
                borderWidth: 2,
                tension: 0.2,
                pointRadius: pointRadii,
                pointHoverRadius: pointHoverRadii,
                _isPositive: false
            });
        }

        return result;
    });

    const posDatasets = datasets.filter(d => d._isPositive);
    const negDatasets = datasets.filter(d => !d._isPositive);

    posDatasets.forEach((d, index) => {
        d.stack = 'pos';
        d.fill = index === 0 ? 'origin' : '-1';
    });
    
    negDatasets.forEach((d, index) => {
        d.stack = 'neg';
        d.fill = index === 0 ? 'origin' : '-1';
    });

    datasets = [...posDatasets, ...negDatasets];

    const bodyStyle = getComputedStyle(document.body);
    const textColor = bodyStyle.getPropertyValue('--text-main').trim() || '#e2e8f0';
    const textMuted = bodyStyle.getPropertyValue('--text-muted').trim() || '#94a3b8';
    const borderColor = bodyStyle.getPropertyValue('--border-subtle').trim() || '#1e293b';

    const [minY, minM, minD] = datesAsc[0].split('-');
    const minTime = new Date(minY, minM - 1, minD).getTime();
    
    const [maxY, maxM, maxD] = datesAsc[datesAsc.length - 1].split('-');
    const maxTime = new Date(maxY, maxM - 1, maxD).getTime();

    const ctx = canvas.getContext('2d');
    balanceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textColor, padding: 16, font: { size: 12, family: 'Inter, sans-serif' } }
                },
                tooltip: {
                    enabled: window.innerWidth > 768,
                    mode: 'index',
                    intersect: false,
                    filter: function(item, index) {
                        return index === 0;
                    },
                    callbacks: {
                        title: function(context) {
                            if (!context.length) return '';
                            const date = new Date(context[0].parsed.x);
                            const day = String(date.getDate()).padStart(2, '0');
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const year = date.getFullYear();
                            return `${day}/${month}/${year}`;
                        },
                        label: function(context) {
                            let totalPos = 0;
                            let totalNeg = 0;
                            const xValue = context.parsed.x;
                            context.chart.data.datasets.forEach(ds => {
                                const point = ds.data.find(p => p.x === xValue);
                                if (point) {
                                    if (point.y > 0) totalPos += point.y;
                                    else if (point.y < 0) totalNeg += point.y;
                                }
                            });
                            
                            const lines = [];
                            lines.push(`Assets (+): ₹${totalPos.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
                            if (totalNeg < 0) {
                                lines.push(`Liabilities (-): ₹${Math.abs(totalNeg).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
                            }
                            lines.push(`Net Balance: ₹${(totalPos + totalNeg).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
                            return lines;
                        },
                        labelColor: function() {
                            return { borderColor: 'transparent', backgroundColor: 'transparent' };
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    stacked: true,
                    min: minTime,
                    max: maxTime,
                    ticks: { 
                        color: textMuted, 
                        font: { family: 'Inter, sans-serif' },
                        maxRotation: 0,
                        callback: function(value) {
                            const date = new Date(value);
                            const day = String(date.getDate()).padStart(2, '0');
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const year = date.getFullYear();
                            return `${day}/${month}/${year}`;
                        }
                    },
                    grid: { color: borderColor, drawBorder: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { 
                        color: textMuted, 
                        font: { size: 10, family: 'Inter, sans-serif' },
                        callback: function(value) {
                            return Intl.NumberFormat('en-IN', { notation: "compact", maximumFractionDigits: 1 }).format(value);
                        }
                    },
                    grid: { color: borderColor, drawBorder: false }
                }
            }
        }
    });

    if (!canvas.dataset.fullscreenBound) {
        canvas.addEventListener('click', async () => {
            if (window.innerWidth <= 768 || window.Android) {
                try {
                    const wrap = canvas.closest('.chart-wrap');
                    if (wrap) {
                        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                            if (wrap.requestFullscreen) await wrap.requestFullscreen();
                            else if (wrap.webkitRequestFullscreen) await wrap.webkitRequestFullscreen();
                        } else {
                            if (document.exitFullscreen) await document.exitFullscreen();
                            else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
                        }
                    }
                } catch (e) {
                    console.error('Fullscreen error:', e);
                }
            }
        });
        canvas.dataset.fullscreenBound = 'true';
    }

    state.chartInstances['balance-chart'] = balanceChartInstance;
    const wrap = canvas.closest('.chart-wrap');
    if (wrap) {
        ensureChartFullscreenButton(wrap, 'balance-chart');
    }

    if (state.activePopupCanvasId === 'balance-chart') {
        openChartPopup('balance-chart');
    }
}
