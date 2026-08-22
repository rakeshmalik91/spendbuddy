import { startInlineEdit, saveInlineEdit, cancelInlineEdit } from "./transactions.js";

/**
 * Desktop Quick Edit
 * Directly delegates to inline editing inside table rows.
 */
export function openQuickEditModal(txnIdx) {
    return startInlineEdit(txnIdx);
}

export { startInlineEdit, saveInlineEdit, cancelInlineEdit };

if (typeof window !== 'undefined') {
    window.startInlineEdit = startInlineEdit;
    window.saveInlineEdit = saveInlineEdit;
    window.cancelInlineEdit = cancelInlineEdit;
    window.openQuickEditModal = startInlineEdit;
}
