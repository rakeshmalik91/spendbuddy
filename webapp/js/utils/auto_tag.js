import { state } from '../core/state.js';

/** Apply the configured dashboard tag to a newly created non-scheduled transaction. */
export function applyAutoTag(entry, { scheduled = false, isUpdate = false } = {}) {
    if (!entry || scheduled || isUpdate || !state.autoTagEnabled || !state.autoTag) return entry;
    const existing = String(entry.tag || '').split(',').map(t => t.trim()).filter(Boolean);
    if (!existing.some(t => t.toLowerCase() === state.autoTag.toLowerCase())) existing.push(state.autoTag);
    entry.tag = existing.join(', ');
    return entry;
}
