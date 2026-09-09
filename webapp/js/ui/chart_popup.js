import { state } from "../core/state.js";

/**
 * Checks whether the current device is desktop (not small screen and not Android app).
 * @returns {boolean}
 */
export function isDesktopDevice() {
    if (typeof window === 'undefined') return true;
    if (window.Android) return false;
    if (typeof document !== 'undefined' && document.body && document.body.classList.contains('is-android')) return false;
    return window.innerWidth > 768;
}

/**
 * Ensures a chart-wrap container has the fullscreen button for desktop view.
 * @param {HTMLElement} wrap 
 * @param {string} canvasId 
 */
export function ensureChartFullscreenButton(wrap, canvasId) {
    if (!wrap || wrap.querySelector('.chart-fullscreen-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chart-fullscreen-btn';
    btn.title = 'View Fullscreen';
    btn.setAttribute('aria-label', 'View Fullscreen');
    btn.setAttribute('data-canvas-id', canvasId);
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
    wrap.appendChild(btn);
}

/**
 * Opens a high-definition popup modal displaying the chart on desktop.
 * @param {string|HTMLCanvasElement} canvasOrId 
 * @returns {boolean} Whether popup was opened
 */
export function openChartPopup(canvasOrId) {
    if (!isDesktopDevice()) {
        // Leave mobile to its existing click-to-fullscreen handler
        return false;
    }

    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    if (!canvas) return false;

    const sourceChart = (typeof Chart !== 'undefined' && Chart.getChart ? Chart.getChart(canvas) : null) || state.chartInstances[canvas.id];
    if (!sourceChart || !sourceChart.config) {
        console.warn('No active chart instance found for', canvas.id);
        return false;
    }

    const overlay = document.getElementById('chart-popup-overlay');
    const titleEl = document.getElementById('chart-popup-title');
    const popupCanvas = document.getElementById('chart-popup-canvas');
    if (!overlay || !popupCanvas) return false;

    // Find chart title from nearest card header
    const card = canvas.closest('.card') || canvas.closest('.chart-card');
    const headerTitle = card ? card.querySelector('.chart-title') : null;
    const titleText = headerTitle ? headerTitle.textContent.replace(/\s+/g, ' ').trim() : 'Chart Details';

    if (titleEl) {
        titleEl.textContent = titleText;
    }

    // Destroy existing popup chart instance if open
    if (state.chartPopupInstance) {
        state.chartPopupInstance.destroy();
        state.chartPopupInstance = null;
    }

    overlay.classList.add('open');
    if (document.body) document.body.classList.add('modal-open');
    if (document.documentElement) document.documentElement.classList.add('modal-open');
    state.activePopupCanvasId = canvas.id;

    // Build configuration cloned from source chart
    const config = sourceChart.config;
    const datasets = Array.isArray(config.data?.datasets)
        ? config.data.datasets.map(ds => ({ ...ds }))
        : [];

    const popupOptions = {
        ...config.options,
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 350 }
    };

    if (typeof Chart !== 'undefined') {
        const ctx = popupCanvas.getContext('2d');
        state.chartPopupInstance = new Chart(ctx, {
            type: config.type,
            data: {
                labels: config.data?.labels ? [...config.data.labels] : undefined,
                datasets: datasets
            },
            options: popupOptions,
            plugins: config.plugins || []
        });
    }

    return true;
}

/**
 * Closes the chart popup modal and tears down the popup chart instance.
 */
export function closeChartPopup() {
    const overlay = document.getElementById('chart-popup-overlay');
    if (overlay) overlay.classList.remove('open');
    if (document.body) document.body.classList.remove('modal-open');
    if (document.documentElement) document.documentElement.classList.remove('modal-open');
    state.activePopupCanvasId = null;

    if (state.chartPopupInstance) {
        state.chartPopupInstance.destroy();
        state.chartPopupInstance = null;
    }
}

/**
 * Initializes global event listeners for opening and closing the chart popup.
 */
export function setupChartPopupListeners() {
    if (typeof document === 'undefined') return;

    // Ensure all existing chart wraps have the fullscreen button
    document.querySelectorAll('.chart-wrap').forEach(wrap => {
        const canvas = wrap.querySelector('canvas');
        if (canvas) {
            ensureChartFullscreenButton(wrap, canvas.id);
        }
    });

    // Delegated click listener for fullscreen buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.chart-fullscreen-btn');
        if (!btn) return;
        e.stopPropagation();

        const canvasId = btn.getAttribute('data-canvas-id');
        let canvas = canvasId ? document.getElementById(canvasId) : null;
        if (!canvas) {
            const wrap = btn.closest('.chart-wrap');
            canvas = wrap ? wrap.querySelector('canvas') : null;
        }

        if (canvas) {
            openChartPopup(canvas);
        }
    });

    // Close button click
    const closeBtn = document.getElementById('chart-popup-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeChartPopup();
        });
    }

    // Backdrop click on overlay (outside the modal dialog)
    const overlay = document.getElementById('chart-popup-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (!e.target.closest('.chart-popup-modal')) {
                closeChartPopup();
            }
        });
    }

    // Escape key listener
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const currentOverlay = document.getElementById('chart-popup-overlay');
            if (currentOverlay && currentOverlay.classList.contains('open')) {
                closeChartPopup();
            }
        }
    });
}
