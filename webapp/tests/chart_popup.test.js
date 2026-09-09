import {
    isDesktopDevice,
    ensureChartFullscreenButton,
    openChartPopup,
    closeChartPopup,
    setupChartPopupListeners
} from '../js/ui/chart_popup.js';
import { state } from '../js/core/state.js';

describe('Desktop Chart Fullscreen Popup', () => {
    let originalInnerWidth;
    let originalAndroid;

    beforeEach(() => {
        jest.clearAllMocks();
        originalInnerWidth = window.innerWidth;
        originalAndroid = window.Android;
        delete window.Android;
        document.body.className = '';
        document.documentElement.className = '';

        // Default to desktop width
        window.innerWidth = 1200;

        state.chartInstances = {};
        state.chartPopupInstance = null;
        state.activePopupCanvasId = null;

        document.body.innerHTML = `
            <div class="card chart-card">
                <h2 class="chart-title">Monthly Expense Trend</h2>
                <div class="chart-wrap" id="wrap-monthly">
                    <canvas id="dash-monthly-chart"></canvas>
                </div>
            </div>

            <div class="modal-overlay chart-popup-overlay" id="chart-popup-overlay">
                <div class="chart-popup-modal card">
                    <div class="chart-popup-header">
                        <h2 class="chart-popup-title" id="chart-popup-title">Chart Details</h2>
                        <button type="button" class="chart-popup-close-btn" id="chart-popup-close-btn">✕</button>
                    </div>
                    <div class="chart-popup-body">
                        <canvas id="chart-popup-canvas"></canvas>
                    </div>
                </div>
            </div>
        `;
    });

    afterEach(() => {
        window.innerWidth = originalInnerWidth;
        if (originalAndroid !== undefined) {
            window.Android = originalAndroid;
        } else {
            delete window.Android;
        }
        closeChartPopup();
    });

    describe('isDesktopDevice', () => {
        test('returns true on large viewport without Android flag', () => {
            window.innerWidth = 1024;
            expect(isDesktopDevice()).toBe(true);
        });

        test('returns false when viewport <= 768px (mobile/tablet)', () => {
            window.innerWidth = 768;
            expect(isDesktopDevice()).toBe(false);

            window.innerWidth = 375;
            expect(isDesktopDevice()).toBe(false);
        });

        test('returns false when window.Android is defined', () => {
            window.innerWidth = 1200;
            window.Android = {};
            expect(isDesktopDevice()).toBe(false);
        });

        test('returns false when body has is-android class', () => {
            window.innerWidth = 1200;
            document.body.classList.add('is-android');
            expect(isDesktopDevice()).toBe(false);
        });
    });

    describe('ensureChartFullscreenButton', () => {
        test('appends button with correct attributes and does not duplicate', () => {
            const wrap = document.getElementById('wrap-monthly');
            expect(wrap.querySelector('.chart-fullscreen-btn')).toBeNull();

            ensureChartFullscreenButton(wrap, 'dash-monthly-chart');
            const btn = wrap.querySelector('.chart-fullscreen-btn');
            expect(btn).not.toBeNull();
            expect(btn.getAttribute('title')).toBe('View Fullscreen');
            expect(btn.getAttribute('data-canvas-id')).toBe('dash-monthly-chart');

            // Second call should not duplicate
            ensureChartFullscreenButton(wrap, 'dash-monthly-chart');
            expect(wrap.querySelectorAll('.chart-fullscreen-btn').length).toBe(1);
        });
    });

    describe('openChartPopup and closeChartPopup', () => {
        test('does nothing when device is mobile or Android', () => {
            window.innerWidth = 480;
            const res = openChartPopup('dash-monthly-chart');
            expect(res).toBe(false);

            const overlay = document.getElementById('chart-popup-overlay');
            expect(overlay.classList.contains('open')).toBe(false);
        });

        test('opens popup modal with chart title, sets modal-open and instantiates popup Chart', () => {
            window.innerWidth = 1200;

            // Mock Chart constructor and source chart instance
            const mockDestroy = jest.fn();
            const mockChart = {
                destroy: mockDestroy,
                config: {
                    type: 'line',
                    data: {
                        labels: ['Jan', 'Feb'],
                        datasets: [{ label: 'Expenses', data: [100, 200] }]
                    },
                    options: { responsive: true }
                }
            };
            state.chartInstances['dash-monthly-chart'] = mockChart;

            const originalChart = global.Chart;
            const mockChartConstructor = jest.fn().mockImplementation(() => ({
                destroy: jest.fn()
            }));
            global.Chart = mockChartConstructor;

            const res = openChartPopup('dash-monthly-chart');
            expect(res).toBe(true);

            const overlay = document.getElementById('chart-popup-overlay');
            const titleEl = document.getElementById('chart-popup-title');

            expect(overlay.classList.contains('open')).toBe(true);
            expect(document.body.classList.contains('modal-open')).toBe(true);
            expect(document.documentElement.classList.contains('modal-open')).toBe(true);
            expect(titleEl.textContent).toBe('Monthly Expense Trend');
            expect(state.activePopupCanvasId).toBe('dash-monthly-chart');
            expect(mockChartConstructor).toHaveBeenCalledTimes(1);

            // Close popup
            closeChartPopup();
            expect(overlay.classList.contains('open')).toBe(false);
            expect(document.body.classList.contains('modal-open')).toBe(false);
            expect(document.documentElement.classList.contains('modal-open')).toBe(false);
            expect(state.activePopupCanvasId).toBeNull();

            global.Chart = originalChart;
        });
    });

    describe('setupChartPopupListeners UI Interactions', () => {
        beforeEach(() => {
            setupChartPopupListeners();
        });

        test('clicking chart-fullscreen-btn opens the popup modal', () => {
            window.innerWidth = 1200;

            const wrap = document.getElementById('wrap-monthly');
            ensureChartFullscreenButton(wrap, 'dash-monthly-chart');
            const btn = wrap.querySelector('.chart-fullscreen-btn');

            state.chartInstances['dash-monthly-chart'] = {
                destroy: jest.fn(),
                config: {
                    type: 'bar',
                    data: { datasets: [] },
                    options: {}
                }
            };

            const originalChart = global.Chart;
            global.Chart = jest.fn().mockImplementation(() => ({ destroy: jest.fn() }));

            btn.click();

            const overlay = document.getElementById('chart-popup-overlay');
            expect(overlay.classList.contains('open')).toBe(true);

            global.Chart = originalChart;
        });

        test('clicking close button closes the popup', () => {
            window.innerWidth = 1200;
            const overlay = document.getElementById('chart-popup-overlay');
            overlay.classList.add('open');
            document.body.classList.add('modal-open');

            const closeBtn = document.getElementById('chart-popup-close-btn');
            closeBtn.click();

            expect(overlay.classList.contains('open')).toBe(false);
            expect(document.body.classList.contains('modal-open')).toBe(false);
        });

        test('clicking overlay backdrop closes the popup', () => {
            window.innerWidth = 1200;
            const overlay = document.getElementById('chart-popup-overlay');
            overlay.classList.add('open');
            document.body.classList.add('modal-open');

            // Click on overlay directly (not modal card)
            overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(overlay.classList.contains('open')).toBe(false);
            expect(document.body.classList.contains('modal-open')).toBe(false);
        });

        test('pressing Escape closes the popup', () => {
            window.innerWidth = 1200;
            const overlay = document.getElementById('chart-popup-overlay');
            overlay.classList.add('open');
            document.body.classList.add('modal-open');

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

            expect(overlay.classList.contains('open')).toBe(false);
            expect(document.body.classList.contains('modal-open')).toBe(false);
        });
    });
});
