/* ══════════════ SWIPE NAVIGATION & PULL-TO-REFRESH ══════════════ */

let switchViewHandler = null;
export function registerSwitchView(fn) {
    switchViewHandler = fn;
}

export let touchStartX = 0;
export let touchStartY = 0;
export let isSwiping1to1 = false;
export let isAnimatingSwipe = false;
export let swipeCurrentNode = null;
export let swipePrevNode = null;
export let swipeNextNode = null;
export let swipeTargetName = null;
export let swipeDeltaX = 0;
export let isPullingDown = false;
export let ptrDeltaY = 0;

/**
 * Helper function to check if any modal, bottom sheet, sidebar or fullscreen overlay is currently active.
 * When active, background 1:1 view swiping and pull-to-refresh gestures should be completely disabled.
 */
export function isModalActive(e) {
    if (document.body.classList.contains('sidebar-open')) return true;
    if (document.body.classList.contains('modal-open') || document.documentElement.classList.contains('modal-open')) return true;
    if (document.querySelector('.modal-overlay.open')) return true;

    const refundModal = document.getElementById('refund-linking-modal-overlay');
    if (refundModal && refundModal.style.display !== 'none' && refundModal.style.display !== '') return true;

    const mapPicker = document.getElementById('map-picker-backdrop');
    if (mapPicker && mapPicker.style.display !== 'none' && mapPicker.style.display !== '') return true;

    if (e && e.target && typeof e.target.closest === 'function') {
        if (e.target.closest('.modal-overlay, .bottom-sheet-overlay, .bottom-sheet, .modal, #refund-linking-modal-overlay, #map-picker-backdrop, [id*="modal"]')) {
            return true;
        }
    }
    return false;
}

// Track the initial touch coordinates and reset the swipe state
document.addEventListener('touchstart', e => {
    // Reset touch coordinates and swipe state unconditionally on touchstart
    touchStartX = e && e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0;
    touchStartY = e && e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0;
    isSwiping1to1 = false;
    swipeDeltaX = 0;
    swipeCurrentNode = null;
    swipePrevNode = null;
    swipeNextNode = null;
    isPullingDown = false;
    ptrDeltaY = 0;

    // Disable swiping on desktop screens
    if (window.innerWidth > 768) return;
    // Avoid interfering with modals, sidebar, or fullscreen views
    if (isModalActive(e)) return;
    if (isAnimatingSwipe) return;
    if (document.fullscreenElement || document.webkitFullscreenElement || document.querySelector('.chart-wrap.is-fullscreen')) return;
}, { passive: true });

// Monitor the touch movements to update page translation (1:1 swipe feel)
document.addEventListener('touchmove', e => {
    if (isAnimatingSwipe) return;
    if (window.innerWidth > 768) return;

    // Completely ignore swipe movements if any modal, bottom sheet, or sidebar is active
    if (isModalActive(e)) {
        if (isSwiping1to1 || isPullingDown) {
            cleanupSwipe();
        }
        return;
    }

    const currentX = e.changedTouches[0].clientX;
    const currentY = e.changedTouches[0].clientY;
    const diffX = currentX - touchStartX;
    const diffY = currentY - touchStartY;

    // Check if we are pulling down at the top of the page.
    const mainContent = document.getElementById('main-content');
    const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || (mainContent ? mainContent.scrollTop : 0);

    // Detect if the gesture is horizontal rather than vertical scroll
    if (!isSwiping1to1 && !isPullingDown) {
        if (Math.abs(diffX) > Math.abs(diffY) * 1.5 && Math.abs(diffX) > 10) {
            if (window.innerWidth <= 768) {
                isSwiping1to1 = true;

                // Define the tab sequence/order of views to transition between
                const allViewsOrder = Array.from(document.querySelectorAll('.bottom-nav .nav-btn')).map(btn => btn.dataset.view).filter(v => v && v !== 'add');
                const viewsOrder = allViewsOrder.slice(0, 4);
                const activeView = document.querySelector('.view.active');
                if (!activeView) return;

                const currentView = activeView.id.replace('view-', '');
                const currentIndex = viewsOrder.indexOf(currentView);

                swipeCurrentNode = activeView;

                // Locate previous and next sibling views for translation positioning
                if (currentIndex !== -1) {
                    swipePrevNode = currentIndex > 0 ? document.getElementById('view-' + viewsOrder[currentIndex - 1]) : null;
                    swipeNextNode = currentIndex < viewsOrder.length - 1 ? document.getElementById('view-' + viewsOrder[currentIndex + 1]) : null;
                } else {
                    if (currentView === 'add') {
                        swipePrevNode = document.getElementById('view-dashboard');
                    } else {
                        swipePrevNode = document.getElementById('view-settings');
                    }
                    swipeNextNode = null;
                }

                const cw = swipeCurrentNode ? (swipeCurrentNode.offsetWidth || window.innerWidth) : window.innerWidth;
                const gap = 40;
                const shiftWidth = cw + gap;

                // Temporarily disable standard CSS transition classes for real-time tracking
                if (swipeCurrentNode) {
                    swipeCurrentNode.style.transition = 'none';
                    swipeCurrentNode.classList.add('sliding');
                }
                if (swipePrevNode) {
                    swipePrevNode.style.transition = 'none';
                    swipePrevNode.classList.add('sliding');
                    swipePrevNode.style.transform = `translateX(-${shiftWidth}px)`;
                }
                if (swipeNextNode) {
                    swipeNextNode.style.transition = 'none';
                    swipeNextNode.classList.add('sliding');
                    swipeNextNode.style.transform = `translateX(${shiftWidth}px)`;
                }
            } else {
                // On iPad/Desktop, ignore horizontal gestures (don't trigger pull-to-refresh)
                cleanupSwipe();
                return;
            }
        } else if (diffY > 15 && !isPullingDown && Math.abs(diffY) > Math.abs(diffX)) {
            if (window.innerWidth > 768) {
                cleanupSwipe();
                return;
            }
            
            const mainContent = document.getElementById('main-content');
            const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || (mainContent ? mainContent.scrollTop : 0);
            if (scrollTop <= 0) {
                isPullingDown = true;
            } else {
                cleanupSwipe();
                return;
            }
        } else if (Math.abs(diffY) > 10 && !isPullingDown) {
            cleanupSwipe();
            return;
        }
    }

    if (isSwiping1to1 && swipeCurrentNode) {
        // Prevent default browser behavior (e.g. back navigation or page scrolling)
        if (e.cancelable) e.preventDefault();

        swipeDeltaX = diffX;

        // Apply a rubber-band/resistance effect if swiping past the boundaries
        if ((diffX > 0 && !swipePrevNode) || (diffX < 0 && !swipeNextNode)) {
            swipeDeltaX = diffX * 0.3;
        }

        const containerWidth = swipeCurrentNode.offsetWidth || window.innerWidth;
        const gap = 40;
        const shiftWidth = containerWidth + gap;

        // Shift the views based on delta drag
        swipeCurrentNode.style.transform = `translateX(${swipeDeltaX}px)`;

        if (swipePrevNode && swipeDeltaX > 0) {
            swipePrevNode.style.transform = `translateX(${swipeDeltaX - shiftWidth}px)`;
        }
        if (swipeNextNode && swipeDeltaX < 0) {
            swipeNextNode.style.transform = `translateX(${swipeDeltaX + shiftWidth}px)`;
        }
    } else if (isPullingDown) {
        if (e.cancelable) e.preventDefault();
        ptrDeltaY = diffY;

        const pullDistance = Math.pow(Math.max(0, ptrDeltaY), 0.85);
        const mainContent = document.getElementById('main-content');
        const spinnerContainer = document.getElementById('ptr-spinner-container');
        if (spinnerContainer) {
            spinnerContainer.style.transform = `translateY(${pullDistance / 2 + 18}px)`;
        }

        if (mainContent) {
            mainContent.style.transition = 'none';
            mainContent.style.transform = `translateY(${pullDistance}px)`;
        }

        const spinner = document.getElementById('ptr-spinner');
        if (spinner) {
            spinner.style.transition = 'none';
            const scale = Math.min(1, 0.5 + (pullDistance / 120));
            const rotate = pullDistance * 4;
            const opacity = Math.min(1, pullDistance / 40);

            spinner.style.opacity = opacity;
            spinner.style.transform = `scale(${scale}) rotate(${rotate}deg)`;
        }
    }
}, { passive: false });

// Handle touch releases and determine whether to complete or snap back
export function handleSwipeEnd(e) {
    if (isModalActive(e)) {
        cleanupSwipe();
        return;
    }

    if (isPullingDown) {
        isPullingDown = false;
        const mainContent = document.getElementById('main-content');
        const spinner = document.getElementById('ptr-spinner');
        const spinnerContainer = document.getElementById('ptr-spinner-container');
        const pullDistance = Math.pow(Math.max(0, ptrDeltaY), 0.85);

        if (pullDistance > 60) {
            if (mainContent) {
                mainContent.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
                mainContent.style.transform = `translateY(60px)`;
            }

            if (spinnerContainer) {
                spinnerContainer.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
                spinnerContainer.style.transform = `translateY(48px)`; // 60 / 2 + 18 = 48
            }

            if (spinner) {
                spinner.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                spinner.style.transform = `scale(1) rotate(0deg)`;
                spinner.classList.add('ptr-spinning');
            }

            const startTime = Date.now();
            
            // Trigger native SMS/Email scan on Android
            if (window.Android && window.Android.onWebAppReady) {
                window.Android.onWebAppReady();
            }
            
            import("../services/storage.js").then(({ syncCloudDataInBackground }) => {
                syncCloudDataInBackground().finally(() => {
                    const elapsed = Date.now() - startTime;
                    const delay = Math.max(0, 800 - elapsed);
                    
                    setTimeout(() => {
                        if (mainContent) {
                            mainContent.style.transform = '';
                        }
                        if (spinnerContainer) {
                            spinnerContainer.style.transform = '';
                            spinnerContainer.style.transition = 'none';
                        }
                        if (spinner) {
                            spinner.classList.remove('ptr-spinning');
                            spinner.style.opacity = '0';
                            spinner.style.transform = '';
                        }
                        if (window.renderAll) window.renderAll();
                    }, delay);
                });
            });
        } else {
            if (mainContent) {
                mainContent.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
                mainContent.style.transform = '';
            }
            if (spinnerContainer) {
                spinnerContainer.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
                spinnerContainer.style.transform = '';
            }
            if (spinner) {
                spinner.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                spinner.style.opacity = '0';
                spinner.style.transform = '';
            }
        }
        return;
    }

    if (!isSwiping1to1 || !swipeCurrentNode || isAnimatingSwipe) {
        cleanupSwipe();
        return;
    }

    isAnimatingSwipe = true;

    // Minimum drag threshold (10% of window width) to register a view change
    const threshold = window.innerWidth * 0.10;
    let targetNode = null;
    let targetX = 0;
    const containerWidth = swipeCurrentNode.offsetWidth || window.innerWidth;
    const gap = 40;
    const shiftWidth = containerWidth + gap;

    const allViewsOrder = Array.from(document.querySelectorAll('.bottom-nav .nav-btn')).map(btn => btn.dataset.view).filter(v => v && v !== 'add');
    const viewsOrder = allViewsOrder.slice(0, 4);
    const activeView = document.querySelector('.view.active');
    const currentView = activeView ? activeView.id.replace('view-', '') : null;
    const currentIndex = viewsOrder.indexOf(currentView);

    if (swipeDeltaX > threshold && swipePrevNode) {
        // Snap forward to the previous view
        targetNode = swipePrevNode;
        targetX = shiftWidth;
        if (currentIndex > 0) {
            swipeTargetName = viewsOrder[currentIndex - 1];
        } else if (currentIndex === -1) {
            swipeTargetName = currentView === 'add' ? 'dashboard' : 'settings';
        } else {
            swipeTargetName = 'dashboard';
        }
    } else if (swipeDeltaX < -threshold && swipeNextNode) {
        // Snap forward to the next view
        targetNode = swipeNextNode;
        targetX = -shiftWidth;
        if (currentIndex !== -1 && currentIndex < viewsOrder.length - 1) {
            swipeTargetName = viewsOrder[currentIndex + 1];
        }
    }

    // Re-enable CSS transitions for the snap animation
    swipeCurrentNode.style.transition = '';
    if (swipePrevNode) swipePrevNode.style.transition = '';
    if (swipeNextNode) swipeNextNode.style.transition = '';

    swipeCurrentNode.classList.add('slide-snap');
    if (swipePrevNode) swipePrevNode.classList.add('slide-snap');
    if (swipeNextNode) swipeNextNode.classList.add('slide-snap');

    if (targetNode) {
        // Perform standard transition and trigger navigation router switch
        swipeCurrentNode.style.transform = `translateX(${targetX}px)`;
        targetNode.style.transform = `translateX(0)`;

        const targetName = swipeTargetName;
        setTimeout(() => {
            if (targetName && switchViewHandler) {
                switchViewHandler(targetName);
            }
            cleanupSwipe();
        }, 200);
    } else {
        // Bounce back to original position
        swipeCurrentNode.style.transform = `translateX(0)`;
        if (swipePrevNode) swipePrevNode.style.transform = `translateX(-${shiftWidth}px)`;
        if (swipeNextNode) swipeNextNode.style.transform = `translateX(${shiftWidth}px)`;

        setTimeout(() => {
            cleanupSwipe();
        }, 200);
    }
}

document.addEventListener('touchend', handleSwipeEnd, { passive: true });
document.addEventListener('touchcancel', handleSwipeEnd, { passive: true });

// Clear swipe styles, transforms, and reset tracking references
export function cleanupSwipe() {
    isSwiping1to1 = false;
    isAnimatingSwipe = false;
    swipeTargetName = null;
    [swipeCurrentNode, swipePrevNode, swipeNextNode].forEach(node => {
        if (node) {
            node.classList.add('no-fade');
            node.classList.remove('sliding', 'slide-snap');
            node.style.transform = '';
            node.style.transition = '';
        }
    });
    swipeCurrentNode = null;
    swipePrevNode = null;
    swipeNextNode = null;
}

// Prevent scrolling on number inputs from changing value
document.addEventListener('wheel', function (e) {
    if (document.activeElement.type === 'number') {
        document.activeElement.blur();
    }
}, { passive: false });

// Prevent double-tap to zoom gesture on touch devices (especially iOS Safari)
let lastTouchEndTime = 0;
document.addEventListener('touchend', function (e) {
    const now = Date.now();
    if (now - lastTouchEndTime <= 300) {
        // Prevent zoom trigger on rapid double taps except inside text input fields and clickable elements
        if (!e.target.closest('input, textarea, select, button, a, [role="button"], .btn, .btn-quick-add, .nav-btn, .touchable-row, .row-btn, .action-dropdown-item')) {
            if (e.cancelable) e.preventDefault();
        }
    }
    lastTouchEndTime = now;
}, { passive: false });
