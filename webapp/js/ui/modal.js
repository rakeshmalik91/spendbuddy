import { toast, escHtml } from "../utils/helpers.js";
import { $$, $ } from "../core/init.js";
import { renderAll } from "./render_all.js";
import { state } from "../core/state.js";
import { saveYearCSV } from "./form.js";

let modalInitialized = false;
let confirmInProgress = false;

/* ══════════════ GENERIC MODAL ══════════════ */

export function setupModal() {
    if (modalInitialized) return;
    modalInitialized = true;

    $('#modal-cancel').addEventListener('click', closeModal);
    $('#modal-overlay').addEventListener('click', (e) => {
        if (e.target === $('#modal-overlay')) closeModal();
    });
    $('#modal-confirm').addEventListener('click', async () => {
        if (confirmInProgress) return;
        confirmInProgress = true;

        const btn = $('#modal-confirm');
        const origText = btn.textContent;
        btn.textContent = 'Wait...';
        btn.disabled = true;
        try {
            if (state.modalAction) {
                const result = await state.modalAction();
                if (result === false) {
                    btn.textContent = origText;
                    btn.disabled = false;
                    confirmInProgress = false;
                    return; // Prevent modal close
                }
            }
        } catch (e) {
            console.error(e);
        }
        btn.textContent = origText;
        btn.disabled = false;
        confirmInProgress = false;
        closeModal();
    });
}

export function openModal({ title, message, confirmLabel, confirmClass, showInput, inputValue, showPasswordInput, showNewPasswordInput, showSelect, selectOptions, customHtml, onConfirm }) {
    $('#modal-title').textContent = title || 'Confirm';
    $('#modal-msg').textContent = message || 'Are you sure?';
    const confirmBtn = $('#modal-confirm');
    confirmBtn.textContent = confirmLabel || 'Confirm';
    confirmBtn.className = `btn ${confirmClass || 'btn-danger'}`;

    const editInput = $('#modal-edit-input');
    if (showInput) {
        editInput.style.display = 'block';
        editInput.value = inputValue || '';
        setTimeout(() => editInput.focus(), 50);
    } else {
        editInput.style.display = 'none';
    }

    const passInput = $('#modal-password-input');
    if (showPasswordInput) {
        passInput.style.display = 'block';
        passInput.value = '';
        setTimeout(() => passInput.focus(), 50);
    } else {
        passInput.style.display = 'none';
    }

    const newPassInput = $('#modal-new-password-input');
    if (showNewPasswordInput) {
        newPassInput.style.display = 'block';
        newPassInput.value = '';
    } else {
        newPassInput.style.display = 'none';
    }

    const selectInput = $('#modal-select-input');
    if (showSelect && selectOptions && selectOptions.length > 0) {
        selectInput.style.display = 'block';
        selectInput.innerHTML = selectOptions.map(opt => `<option value="${escHtml(opt)}">${escHtml(opt)}</option>`).join('');
    } else {
        selectInput.style.display = 'none';
    }

    const customHtmlContainer = $('#modal-custom-html');
    if (customHtml) {
        customHtmlContainer.style.display = 'block';
        customHtmlContainer.innerHTML = customHtml;
    } else {
        customHtmlContainer.style.display = 'none';
        customHtmlContainer.innerHTML = '';
    }

    state.modalAction = onConfirm;
    $('#modal-overlay').classList.add('open');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
}

export function closeModal() {
    state.modalAction = null;
    $('#modal-overlay').classList.remove('open');
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    $('#modal-edit-input').style.display = 'none';
    $('#modal-password-input').style.display = 'none';
    $('#modal-new-password-input').style.display = 'none';
    $('#modal-select-input').style.display = 'none';
    $('#modal-custom-html').style.display = 'none';
    $('#modal-custom-html').innerHTML = '';
}

export function openDeleteModal(idx) {
    // Block deletes while background cloud sync is refreshing data
    if (state.cloudSyncInProgress) {
        toast('Please wait for cloud sync to complete...', 'error');
        return;
    }
    const e = state.expenses[idx];
    if (!e) return;
    const year = e.date.split('-')[0];
    openModal({
        title: 'Delete Transaction?',
        message: `Delete "${e.category}" — ₹${Math.abs(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} on ${e.date}?`,
        confirmLabel: 'Delete',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
            const deleted = state.expenses.splice(idx, 1)[0];
            deleted.deleted = true; deleted.txnId = deleted.txnId || `trash-${Date.now()}-${idx}`; state.trash = state.trash || []; state.trash.push(deleted);
            toast('Deleting from cloud...', 'info');
            try {
                await saveYearCSV(year);
                const { recordActivity } = await import("../services/activity.js");
                await recordActivity({action:"deleted",type:"txn",source:deleted.source || "manual",txn:deleted});
                toast('Transaction deleted', 'success');
            } catch (error) {
                state.expenses.splice(idx, 0, deleted); state.trash = (state.trash || []).filter(t => t !== deleted); deleted.deleted = false;
                toast('Error deleting from cloud', 'error');
                return false;
            }
            renderAll();
        }
    });
}

export function openDeleteMultipleModal(indices, customTitle, customMessage) {
    if (state.cloudSyncInProgress) {
        toast('Please wait for cloud sync to complete...', 'error');
        return;
    }
    if (!Array.isArray(indices) || indices.length === 0) return;

    const validIndices = indices.filter(idx => typeof idx === 'number' && idx >= 0 && idx < state.expenses.length);
    if (validIndices.length === 0) return;

    validIndices.sort((a, b) => b - a);
    const targets = validIndices.map(idx => state.expenses[idx]);
    const years = new Set(targets.map(e => (e.date ? e.date.split('-')[0] : new Date().getFullYear().toString())));
    const totalAmount = targets.reduce((sum, e) => sum + Math.abs(e.amount), 0);

    const title = customTitle || `Delete ${validIndices.length} Transactions?`;
    const message = customMessage || `Are you sure you want to delete ${validIndices.length} transaction${validIndices.length > 1 ? 's' : ''} (Total: ₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})?`;

    openModal({
        title: title,
        message: message,
        confirmLabel: 'Delete',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
            const removed = validIndices.map(idx => ({ idx, item: state.expenses.splice(idx, 1)[0] }));
            state.trash = state.trash || [];
            removed.forEach(({item,idx}) => { item.deleted = true; item.txnId = item.txnId || `trash-${Date.now()}-${idx}`; state.trash.push(item); });
            toast('Deleting from cloud...', 'info');
            try {
                for (const yr of years) { await saveYearCSV(yr); }
                const { recordActivity } = await import("../services/activity.js");
                for (const {item} of removed) await recordActivity({action:"deleted", type:"txn", source:item.source || "manual", txn:item});
                toast(`${validIndices.length} transaction${validIndices.length > 1 ? 's' : ''} deleted`, 'success');
            } catch (error) {
                removed.reverse().forEach(({ idx, item }) => { state.expenses.splice(idx, 0, item); state.trash = (state.trash || []).filter(t => t !== item); item.deleted = false; });
                toast('Error deleting from cloud', 'error');
                return false;
            }
            renderAll();
        }
    });
}



