import { applyAutoTag } from '../js/utils/auto_tag.js';
import { state } from '../js/core/state.js';

describe('automatic transaction tagging', () => {
    beforeEach(() => {
        state.autoTag = 'Travel';
        state.autoTagEnabled = true;
    });

    it('adds the configured tag when the user leaves the tag field unchanged', () => {
        const entry = { tag: '' };
        expect(applyAutoTag(entry).tag).toBe('Travel');
    });

    it('does not add the configured tag when the user manually selects another tag', () => {
        const entry = { tag: 'Food' };
        expect(applyAutoTag(entry, { respectManualTag: true }).tag).toBe('Food');
    });

    it('respects a manually cleared tag', () => {
        const entry = { tag: '' };
        expect(applyAutoTag(entry, { respectManualTag: true }).tag).toBe('');
    });

    it('does not change the existing scheduled and update behavior', () => {
        expect(applyAutoTag({ tag: '' }, { scheduled: true }).tag).toBe('');
        expect(applyAutoTag({ tag: '' }, { isUpdate: true }).tag).toBe('');
    });
});
