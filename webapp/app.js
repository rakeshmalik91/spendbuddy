import { showLoader, hideLoader, receiveSmsTransactions, showSmsSpinner, hideSmsSpinner, showEmailSpinner, hideEmailSpinner } from './js/core/init.js';
import { openRefundLinkingModal } from './js/ui/refund_linking_modal.js';
import { openQuickEditModal } from './js/ui/quick_edit_modal.js';
import { showSmsApprovalModal } from './js/ui/sms_approval.js';
import { showScheduledApprovalModal } from './js/ui/scheduled_approval.js';
import './js/ui/keyword_mappings.js';

// Re-attach globals required by Android WebView & inline HTML handlers
window.showLoader = showLoader;
window.hideLoader = hideLoader;
window.receiveSmsTransactions = receiveSmsTransactions;
window.showSmsSpinner = showSmsSpinner;
window.hideSmsSpinner = hideSmsSpinner;
window.showEmailSpinner = showEmailSpinner;
window.hideEmailSpinner = hideEmailSpinner;
window.openRefundLinkingModal = openRefundLinkingModal;
window.openQuickEditModal = openQuickEditModal;
window.showSmsApprovalModal = showSmsApprovalModal;
window.showScheduledApprovalModal = showScheduledApprovalModal;

console.log("ExpenseIQ Modular App Loaded");

