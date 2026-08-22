import { showLoader, hideLoader, receiveSmsTransactions, showSmsSpinner, hideSmsSpinner, showEmailSpinner, hideEmailSpinner } from './js/core/init.js';
import { openRefundLinkingModal } from './js/ui/refund_linking_modal.js';

// Re-attach globals required by Android WebView & inline HTML handlers
window.showLoader = showLoader;
window.hideLoader = hideLoader;
window.receiveSmsTransactions = receiveSmsTransactions;
window.showSmsSpinner = showSmsSpinner;
window.hideSmsSpinner = hideSmsSpinner;
window.showEmailSpinner = showEmailSpinner;
window.hideEmailSpinner = hideEmailSpinner;
window.openRefundLinkingModal = openRefundLinkingModal;

console.log("ExpenseIQ Modular App Loaded");
