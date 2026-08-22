/**
 * Unit tests for swipe navigation and modal interaction guards
 */
import { isModalActive, isSwiping1to1, cleanupSwipe } from '../js/utils/swipe_navigation.js';

describe('swipe_navigation modal guards', () => {
    beforeEach(() => {
        document.body.className = '';
        document.documentElement.className = '';
        document.body.innerHTML = `
            <div id="main-content">
                <div id="view-dashboard" class="view active">Dashboard</div>
                <div id="view-transactions" class="view">Transactions</div>
            </div>
            <div class="modal-overlay" id="mobile-txn-menu-overlay">
                <div class="bottom-sheet">
                    <button id="btn-mobile-edit">Edit</button>
                </div>
            </div>
            <div id="refund-linking-modal-overlay" style="display: none;"></div>
            <div id="map-picker-backdrop" style="display: none;"></div>
        `;
        cleanupSwipe();
    });

    test('isModalActive returns false when no modal or overlay is open', () => {
        const dummyEvent = { target: document.getElementById('view-dashboard') };
        expect(isModalActive(dummyEvent)).toBe(false);
    });

    test('isModalActive returns true when body or html has modal-open class', () => {
        document.body.classList.add('modal-open');
        const dummyEvent = { target: document.getElementById('view-dashboard') };
        expect(isModalActive(dummyEvent)).toBe(true);

        document.body.classList.remove('modal-open');
        document.documentElement.classList.add('modal-open');
        expect(isModalActive(dummyEvent)).toBe(true);
    });

    test('isModalActive returns true when modal-overlay has open class', () => {
        const overlay = document.getElementById('mobile-txn-menu-overlay');
        overlay.classList.add('open');
        const dummyEvent = { target: document.getElementById('view-dashboard') };
        expect(isModalActive(dummyEvent)).toBe(true);
    });

    test('isModalActive returns true when event target is inside a modal or bottom-sheet', () => {
        const btn = document.getElementById('btn-mobile-edit');
        const dummyEvent = { target: btn };
        expect(isModalActive(dummyEvent)).toBe(true);
    });

    test('isModalActive returns true when refund linking or map picker modal is visible', () => {
        const refundModal = document.getElementById('refund-linking-modal-overlay');
        refundModal.style.display = 'flex';
        const dummyEvent = { target: document.getElementById('view-dashboard') };
        expect(isModalActive(dummyEvent)).toBe(true);
    });

    test('touchmove on modal does not activate 1to1 view swiping', () => {
        document.body.classList.add('modal-open');
        const overlay = document.getElementById('mobile-txn-menu-overlay');
        overlay.classList.add('open');

        // Simulate touchstart on modal element
        const touchStartEvt = new Event('touchstart', { bubbles: true });
        touchStartEvt.changedTouches = [{ clientX: 200, clientY: 300 }];
        overlay.dispatchEvent(touchStartEvt);

        // Simulate horizontal touchmove on modal element
        const touchMoveEvt = new Event('touchmove', { bubbles: true, cancelable: true });
        touchMoveEvt.changedTouches = [{ clientX: 50, clientY: 300 }];
        overlay.dispatchEvent(touchMoveEvt);

        expect(isSwiping1to1).toBe(false);

        const activeView = document.querySelector('.view.active');
        expect(activeView.style.transform).not.toContain('translateX');
    });
});
