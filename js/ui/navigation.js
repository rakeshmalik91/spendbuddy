import { renderDashboard } from "./dashboard.js";
import { renderSettings } from "./settings.js";
import { renderChartsPage } from "./charts.js";
import { $$, $ } from "../core/init.js";
import { renderScheduledTransactions } from "./chart_builders.js";
import { renderTransactions } from "./transactions.js";
import { state } from "../core/state.js";
import { updateTimeFilterUI } from "./time_filter.js";
import { resetForm } from "./form.js";
import { registerSwitchView } from "../utils/swipe_navigation.js";

const lastNavSync = {};
const NAV_SYNC_COOLDOWN = 5 * 60 * 1000; // 5 minutes

function shouldSyncOnNav(key) {
    const now = Date.now();
    if (!lastNavSync[key] || now - lastNavSync[key] > NAV_SYNC_COOLDOWN) {
        lastNavSync[key] = now;
        return true;
    }
    return false;
}

/* ══════════════ NAVIGATION ══════════════ */

export function setupNavigation() {
    registerSwitchView(switchView);
    const dashAddBtn = $('#dash-add-btn');
    if (dashAddBtn) {
        dashAddBtn.addEventListener('click', () => switchView('add'));
    }

    if (!window.Android) {
        const syncCard = $('#android-sync-card');
        if (syncCard) {
            syncCard.style.display = 'none';
        }
        const syncNavCard = $('#sync-nav-card');
        if (syncNavCard) {
            syncNavCard.style.display = 'none';
        }
    }

    $$('.nav-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            document.body.classList.remove('swipe-anim-left', 'swipe-anim-right');
            $$('.view').forEach(v => v.classList.remove('no-fade'));
            const view = e.currentTarget.dataset.view;
            if (!view) return;
            // UI toggle
            switchView(view);
        });
    });

    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.view) {
            switchView(e.state.view, false);
        } else {
            const hashView = window.location.hash.replace('#', '') || 'dashboard';
            switchView(hashView, false);
        }
    });

    const initialView = window.location.hash.replace('#', '') || 'dashboard';
    window.history.replaceState({ view: initialView }, '', `#${initialView}`);
    if (initialView !== 'dashboard') {
        setTimeout(() => switchView(initialView, false), 0);
    }
}

export function switchView(viewName, pushStateToHistory = true) {

    const activeViewEl = document.querySelector('.view.active');
    const previousViewId = activeViewEl ? activeViewEl.id.replace('view-', '') : null;
    
    if (previousViewId === viewName) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    if (previousViewId) {
        state.scrollPositions = state.scrollPositions || {};
        state.scrollPositions[previousViewId] = window.scrollY || document.documentElement.scrollTop;
    }

    const leavingAdd = previousViewId === 'add' && viewName !== 'add';

    if (leavingAdd) {
        const editIdx = document.getElementById('edit-index') ? parseInt(document.getElementById('edit-index').value) : -1;
        const editSchedIdx = document.getElementById('edit-scheduled-index') ? parseInt(document.getElementById('edit-scheduled-index').value) : -1;
        if (editIdx >= 0 || editSchedIdx >= 0) {
            if (typeof resetForm === 'function') resetForm();
        }
    }

    if (pushStateToHistory) {
        const currentPath = window.location.hash.replace('#', '') || 'dashboard';
        if (currentPath !== viewName) {
            window.history.pushState({ view: viewName }, '', `#${viewName}`);
        }
    }

    if (viewName !== 'add') state.previousView = viewName;
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    $$(`.nav-btn[data-view="${viewName}"]`).forEach(b => b.classList.add('active'));
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${viewName}`).classList.add('active');



    // Update global timeline header based on view
    const globalTimeFilter = document.getElementById('global-time-filter');
    const globalTimeTabs = document.getElementById('global-time-tabs');
    const timePrevYear = document.getElementById('time-prev-year');
    const timeNextYear = document.getElementById('time-next-year');
    const globalTimeNav = document.getElementById('global-time-nav');

    if (globalTimeFilter) {
        // Clear any old inline displays
        globalTimeFilter.style.display = '';
        if (globalTimeTabs) globalTimeTabs.style.display = '';
        if (timePrevYear) timePrevYear.style.display = '';
        if (timeNextYear) timeNextYear.style.display = '';

        if (viewName === 'add') {
            globalTimeFilter.classList.remove('collapsed');
            if (globalTimeTabs) globalTimeTabs.classList.add('collapsed');
            if (globalTimeNav) globalTimeNav.style.visibility = 'visible';
            if (timePrevYear) timePrevYear.classList.remove('collapsed');
            if (timeNextYear) timeNextYear.classList.remove('collapsed');
            updateTimeFilterUI();
        } else if (['dashboard', 'transactions', 'charts'].includes(viewName)) {
            globalTimeFilter.classList.remove('collapsed');
            if (globalTimeTabs) globalTimeTabs.classList.remove('collapsed');
            if (timePrevYear) timePrevYear.classList.add('collapsed');
            if (timeNextYear) timeNextYear.classList.add('collapsed');
            updateTimeFilterUI();
        } else {
            globalTimeFilter.classList.add('collapsed');
        }
    }
    // Close mobile sidebar
    $('#sidebar').classList.remove('open');

    // Rebuild charts / tables when entering views
    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'charts') renderChartsPage();
    if (viewName === 'transactions') renderTransactions();
    if (['settings', 'categories', 'txnmodes', 'locations'].includes(viewName)) {
        renderSettings();
        if (typeof window.syncCloudDataInBackground === 'function') {
            if (viewName === 'settings' && previousViewId !== 'settings') {
                if (shouldSyncOnNav('user_settings.json')) {
                    window.syncCloudDataInBackground(['user_settings.json']);
                }
            } else if (['categories', 'txnmodes'].includes(viewName) && previousViewId !== viewName) {
                if (shouldSyncOnNav('metadata.csv')) {
                    window.syncCloudDataInBackground(['metadata.csv']);
                }
            }
        }
    }
    if (viewName === 'scheduled') {
        renderScheduledTransactions();
        if (previousViewId !== 'scheduled' && typeof window.syncCloudDataInBackground === 'function') {
            if (shouldSyncOnNav('scheduled_transaction.csv')) {
                window.syncCloudDataInBackground(['scheduled_transaction.csv']);
            }
        }
    }
    if (viewName === 'balance') {
        if (!state.balanceLoaded) {
            import('../services/storage.js').then(async (s) => {
                const loader = document.getElementById('loader');
                const loaderText = document.getElementById('loader-text');
                if (loader && loaderText) {
                    loaderText.textContent = 'Loading balance data...';
                    loader.style.display = 'flex';
                }
                await s.loadBalanceCSV();
                if (loader) loader.style.display = 'none';
                import('./balance.js?v=4').then(m => m.renderBalanceTracker());
                
                // Now that it's loaded, trigger a background sync so it fetches updates from the cloud if any
                s.syncCloudDataInBackground(['balance.csv']);
            });
        } else {
            import('./balance.js?v=4').then(m => m.renderBalanceTracker());
            if (previousViewId !== 'balance' && typeof window.syncCloudDataInBackground === 'function') {
                if (shouldSyncOnNav('balance.csv')) {
                    window.syncCloudDataInBackground(['balance.csv']);
                }
            }
        }
    }

    setTimeout(() => {
        if (state.scrollPositions && state.scrollPositions[viewName] !== undefined && previousViewId !== null) {
            window.scrollTo(0, state.scrollPositions[viewName]);
        } else {
            window.scrollTo(0, 0);
        }
    }, 10);
}

window.switchView = switchView;

