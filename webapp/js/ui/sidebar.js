import { $ } from "../core/init.js";

const STORAGE_KEY = 'expman_sidebar_collapsed';

/**
 * Updates button aria and title attributes based on collapsed state.
 */
function updateCollapseButton(btn, isCollapsed) {
    if (!btn) return;
    btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    btn.setAttribute('title', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    btn.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
}

/**
 * Initializes sidebar collapse state from localStorage and attaches toggle listener.
 */
export function setupSidebar() {
    const collapseBtn = $('#sidebar-collapse-btn');
    if (!collapseBtn) return;

    // Synchronize initial state
    const isSavedCollapsed = localStorage.getItem(STORAGE_KEY) === 'true';
    if (isSavedCollapsed) {
        document.body.classList.add('sidebar-collapsed');
        updateCollapseButton(collapseBtn, true);
    } else {
        updateCollapseButton(collapseBtn, false);
    }

    collapseBtn.addEventListener('click', () => {
        const willCollapse = !document.body.classList.contains('sidebar-collapsed');
        document.body.classList.add('sidebar-animating');
        document.body.classList.toggle('sidebar-collapsed', willCollapse);
        localStorage.setItem(STORAGE_KEY, willCollapse ? 'true' : 'false');
        updateCollapseButton(collapseBtn, willCollapse);

        // Dispatch window resize after CSS transition completes to re-fit charts
        setTimeout(() => {
            document.body.classList.remove('sidebar-animating');
            window.dispatchEvent(new Event('resize'));
        }, 280);
    });
}
