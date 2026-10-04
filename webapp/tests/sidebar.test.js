import { setupSidebar } from '../js/ui/sidebar.js';

describe('Collapsible Sidebar UI', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        document.body.className = '';
        document.body.innerHTML = `
            <aside class="sidebar" id="sidebar">
                <div class="sidebar-header">
                    <div class="sidebar-brand">
                        <span class="brand-icon"><img src="assets/logo.svg" alt="logo"></span>
                        <span class="brand-text">SpendBuddy</span>
                    </div>
                    <button type="button" class="sidebar-collapse-btn" id="sidebar-collapse-btn" title="Collapse sidebar" aria-label="Collapse sidebar" aria-expanded="true">
                        <svg class="icon-collapse"></svg>
                        <svg class="icon-expand"></svg>
                    </button>
                </div>
                <div id="sidebar-user-id">test@example.com</div>
                <nav class="sidebar-nav">
                    <button class="nav-btn active" data-view="dashboard" id="nav-dashboard" title="Dashboard">
                        <span class="nav-icon">📊</span>
                        <span class="nav-text">Dashboard</span>
                    </button>
                    <button class="nav-btn" data-view="transactions" id="nav-transactions" title="Transactions">
                        <span class="nav-icon">📋</span>
                        <span class="nav-text">Transactions</span>
                    </button>
                </nav>
            </aside>
            <main class="main-content" id="main-content"></main>
        `;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('initializes as expanded by default when localStorage is empty', () => {
        setupSidebar();
        expect(document.body.classList.contains('sidebar-collapsed')).toBe(false);
        const btn = document.getElementById('sidebar-collapse-btn');
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        expect(btn.getAttribute('title')).toBe('Collapse sidebar');
    });

    test('initializes as collapsed when localStorage has expman_sidebar_collapsed = "true"', () => {
        localStorage.setItem('expman_sidebar_collapsed', 'true');
        setupSidebar();
        expect(document.body.classList.contains('sidebar-collapsed')).toBe(true);
        const btn = document.getElementById('sidebar-collapse-btn');
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        expect(btn.getAttribute('title')).toBe('Expand sidebar');
    });

    test('toggles collapsed state on button click and persists to localStorage', () => {
        setupSidebar();
        const btn = document.getElementById('sidebar-collapse-btn');

        // Click to collapse
        btn.click();
        expect(document.body.classList.contains('sidebar-collapsed')).toBe(true);
        expect(localStorage.getItem('expman_sidebar_collapsed')).toBe('true');
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        expect(btn.getAttribute('title')).toBe('Expand sidebar');

        // Click to expand again
        btn.click();
        expect(document.body.classList.contains('sidebar-collapsed')).toBe(false);
        expect(localStorage.getItem('expman_sidebar_collapsed')).toBe('false');
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        expect(btn.getAttribute('title')).toBe('Collapse sidebar');
    });

    test('dispatches window resize event after collapse transition', () => {
        setupSidebar();
        const btn = document.getElementById('sidebar-collapse-btn');
        const resizeSpy = jest.fn();
        window.addEventListener('resize', resizeSpy);

        btn.click();
        expect(resizeSpy).not.toHaveBeenCalled();

        jest.advanceTimersByTime(300);
        expect(resizeSpy).toHaveBeenCalled();

        window.removeEventListener('resize', resizeSpy);
    });

    test('adds sidebar-animating class during animation and removes it after transition', () => {
        setupSidebar();
        const btn = document.getElementById('sidebar-collapse-btn');

        btn.click();
        expect(document.body.classList.contains('sidebar-animating')).toBe(true);

        jest.advanceTimersByTime(300);
        expect(document.body.classList.contains('sidebar-animating')).toBe(false);
    });
});
