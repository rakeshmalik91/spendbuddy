/* ══════════════ DATE HELPERS ══════════════
 * Pure date parsing/formatting utilities with zero dependencies.
 * Extracted to break circular import chains between helpers.js and its submodules.
 * ═══════════════════════════════════════════ */

export function parseLocalDate(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date(dateStr);
}

export function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatMonth(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[parseInt(m) - 1] + ' ' + y;
}

export function formatDate(d) {
    if (!d) return '';
    const dt = parseLocalDate(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
