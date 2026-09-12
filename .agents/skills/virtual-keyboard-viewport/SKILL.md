---
name: virtual-keyboard-viewport-knowledge
description: Core documentation, architecture, WebKit viewport pan prevention, sticky header clearance, form bottom headroom, and multi-device stabilization for touch and virtual keyboard interactions.
---

# Virtual Keyboard Viewport & Focus Architecture

## Overview
On touch devices (specifically iPadOS Safari, iOS WebKit, Android Chrome/WebView, and split-screen tablets), interacting with form inputs introduces complex virtual software keyboard behaviors. 

Without proactive viewport management, WebKit and mobile browsers introduce severe visual and functional regressions:
1. **Window-Level Viewport Pan & Blank Bottom Gap**: When an input sits in the lower part of the screen, the browser pans the entire window (`document.documentElement` / `window.visualViewport`) upward. Upon dismissing the keyboard (especially via iPad's native "Hide Keyboard" button), the window remains panned upward, creating an empty blank void at the bottom of the screen and cutting off the top of fixed/sticky headers.
2. **Sticky Header Occlusion**: When focused inputs are scrolled into view, native browser focus-scrolling or simplistic offset calculations scroll the input (and its `<label>`) underneath `position: sticky` headers (such as `.sticky-header-wrapper`).
3. **Keyboard Dismiss without Blur**: iPadOS Safari's "Hide Keyboard" accessory button hides the software keyboard **without** firing `blur` or `focusout` on the active input.

This skill documents the comprehensive architectural solution implemented across CSS and JavaScript to eliminate these issues permanently.

---

## 1. Core Architecture & Mechanisms

### 1.1 Architectural Pillar 1: Dedicated Form Bottom Headroom (`.form-bottom-spacer`)
- **Problem**: Lower form inputs (such as the *Tag* field or scheduled options) are located near the bottom of `#view-add`. When tapped, `.main-content` could not scroll them sufficiently high above the virtual keyboard because the content container hit `maxScroll`. Seeing the input clipped by the keyboard, WebKit panned the entire window.
- **Solution**: A dedicated spacer element `<div class="form-bottom-spacer" aria-hidden="true"></div>` is placed at the end of the form view before `</section>`.
- **CSS Definition**:
  - Desktop / iPad (`> 860px`): `height: 380px; pointer-events: none; visibility: hidden;` in [`main.css`](file:///d:/Projects/expense-manager/webapp/css/layout/main.css).
  - Mobile (`<= 860px`): `height: 120px;` in [`responsive.css`](file:///d:/Projects/expense-manager/webapp/css/layout/responsive.css).
- **Why this works**: Providing 380px of scrollable headroom allows `.main-content` to position even the very last field in the form well into the upper half of the screen, completely clearing the virtual keyboard so WebKit never initiates a window pan.

### 1.2 Architectural Pillar 2: CSS Scroll Padding & Scroll Margin
- **Problem**: Browser native `scrollIntoView()` and tab navigation do not intrinsically account for `position: sticky` headers. The engine treats `scrollTop = 0` as visible, happily scrolling inputs directly under `.sticky-header-wrapper`.
- **Solution**:
  1. **Container Scroll Padding**: In [`main.css`](file:///d:/Projects/expense-manager/webapp/css/layout/main.css), `.main-content` has `scroll-padding-top: 130px;` (and `scroll-padding-top: 100px;` in [`responsive.css`](file:///d:/Projects/expense-manager/webapp/css/layout/responsive.css)).
  2. **Form Group Scroll Margin**: In [`forms.css`](file:///d:/Projects/expense-manager/webapp/css/components/forms.css), `.form-group` has `scroll-margin-top: 130px;`.
- **Why this works**: This instructs the browser's native scroll engine to treat the top 130px of `.main-content` as occluded, ensuring all native and keyboard-tab scrolling maintains clean clearance below the sticky header.

### 1.3 Architectural Pillar 3: Enabling Window Un-Scroll in WebKit
- **Problem**: When `html` and `body` have `overflow: hidden;`, WebKit's internal CSSOM disables programmatic `window.scrollTo({ top: 0 })` calls. If WebKit panned the window, scripts could not reset `window.scrollY` back to 0.
- **Solution**: In [`reset.css`](file:///d:/Projects/expense-manager/webapp/css/base/reset.css):
  - Changed `html` and `body` from `overflow: hidden` to `overflow-x: hidden; overflow-y: clip;` (or `overflow-y: visible;`).
  - Allows programmatic `window.scrollTo({ top: 0, left: 0, behavior: 'instant' })` while preventing horizontal overflow.

### 1.4 Architectural Pillar 4: Visual Viewport Resize & Un-Blur Guardian
- **Problem**: On iPad, tapping the down-chevron "Hide Keyboard" button does not blur the input or fire `focusout`. The input remains focused, so blur handlers never fire, and the window remains panned.
- **Solution**: Listen to `window.visualViewport.addEventListener('resize')` in [`index.html`](file:///d:/Projects/expense-manager/webapp/index.html):
  ```javascript
  if (window.visualViewport) {
      var lastVPHeight = window.visualViewport.height;
      window.visualViewport.addEventListener('resize', function () {
          var currentHeight = window.visualViewport.height;
          // If viewport grew significantly, keyboard was closed
          if (currentHeight - lastVPHeight > 80) {
              var active = document.activeElement;
              if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
                  active.blur();
              }
              resetWindowScroll();
              setTimeout(resetWindowScroll, 50);
              setTimeout(resetWindowScroll, 200);
          }
          lastVPHeight = currentHeight;
      });
  }
  ```

### 1.5 Architectural Pillar 5: Dynamic Safe-Zone Focus Positioning (`positionFocusedInput`)
- **Problem**: Hardcoding target offsets (e.g. `desiredTop = 70`) failed because `.sticky-header-wrapper` height is dynamic (~94px–110px + mask fade gradient), and targeting `<input>` alone scrolled the field's `<label>` behind the header.
- **Solution**: The `positionFocusedInput(target)` engine dynamically measures boundaries and positions the entire `.form-group`:
  ```javascript
  function positionFocusedInput(target) {
      if (!target || document.activeElement !== target) return;
      var tag = target.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
      if (target.type === 'hidden' || target.type === 'checkbox' || target.type === 'radio') return;
      if (target.closest('.modal-overlay')) return;

      var c = getMainContent();
      if (!c) return;

      var mcRect = c.getBoundingClientRect();
      var scrollTarget = target.closest('.form-group, .filter-group') || target;
      var groupRect = scrollTarget.getBoundingClientRect();
      var targetRect = target.getBoundingClientRect();

      // Compute sticky header bottom dynamically
      var header = c.querySelector('.sticky-header-wrapper');
      var headerBottom = mcRect.top;
      if (header && header.offsetHeight > 0 && window.getComputedStyle(header).display !== 'none') {
          headerBottom = header.getBoundingClientRect().bottom;
      }
      var mobileHeader = document.getElementById('mobile-header');
      if (mobileHeader && mobileHeader.offsetHeight > 0 && window.getComputedStyle(mobileHeader).display !== 'none') {
          headerBottom = Math.max(headerBottom, mobileHeader.getBoundingClientRect().bottom);
      }
      // Generous 16px buffer below sticky header to clear mask gradient
      var safeTop = headerBottom + 16;

      // Account for touch virtual keyboard (~40-50% screen height)
      var isTouch = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);
      var effectiveVpHeight = window.visualViewport ? (window.visualViewport.offsetTop + window.visualViewport.height) : window.innerHeight;
      var estimatedKbHeight = isTouch ? Math.max(320, window.innerHeight * 0.42) : 0;
      var maxVisibleBottom = isTouch ? Math.min(effectiveVpHeight, window.innerHeight - estimatedKbHeight) : mcRect.bottom;
      var safeBottom = maxVisibleBottom - 16;

      // If behind header OR in keyboard zone: position group cleanly at safeTop
      if (groupRect.top < safeTop || targetRect.bottom > safeBottom) {
          var delta = groupRect.top - safeTop;
          if (Math.abs(delta) > 6) {
              if (window.innerWidth <= 860) {
                  window.scrollBy(0, delta);
              } else {
                  c.scrollTop += delta;
              }
          }
      }
  }
  ```
- **Multi-Tick Alignment**:
  - Tick 0 (immediate in `focusin`): Preempts WebKit's window panning by scrolling `.main-content` before the keyboard opens.
  - Tick 1 (60ms): Overrides any native WebKit focus-scrolling that attempted to scroll the input under the sticky header.
  - Tick 2 (250ms): Verifies final placement after virtual keyboard slide-in animation completes.

---

## 2. Key File Reference

| File | Purpose | Key Rules & Locations |
| :--- | :--- | :--- |
| [`webapp/index.html`](file:///d:/Projects/expense-manager/webapp/index.html) | Viewport handlers & spacer | Form bottom spacer (`#view-add`, L831); `positionFocusedInput`, `resetWindowScroll`, and viewport resize guardian (L2130–L2220). |
| [`webapp/css/layout/main.css`](file:///d:/Projects/expense-manager/webapp/css/layout/main.css) | Main layout & spacer CSS | `.main-content` (`scroll-padding-top: 130px;`); `.form-bottom-spacer` (`height: 380px;`). |
| [`webapp/css/layout/responsive.css`](file:///d:/Projects/expense-manager/webapp/css/layout/responsive.css) | Responsive & mobile layout | `@media (max-width: 860px)`: `.main-content` (`scroll-padding-top: 100px;`); `.form-bottom-spacer` (`height: 120px;`). |
| [`webapp/css/components/forms.css`](file:///d:/Projects/expense-manager/webapp/css/components/forms.css) | Form component styling | `.form-group` (`scroll-margin-top: 130px;`). |
| [`webapp/css/base/reset.css`](file:///d:/Projects/expense-manager/webapp/css/base/reset.css) | Root scroll permissions | `html, body` (`overflow-x: hidden;`, unblocking programmatic CSSOM window scrolling). |

---

## 3. Anti-Patterns & What NOT To Do

1. **DO NOT use dynamic `paddingBottom = '100vh'` hacks**:
   - Inflating container padding dynamically on `focusin` and resetting on `focusout` creates severe race conditions, intermittent blank voids below forms, and broken scroll positions.
   - Always use a static, predictable `.form-bottom-spacer` element.
2. **DO NOT hardcode scroll offsets (e.g. `desiredTop = 70`)**:
   - Header heights change depending on screen size, view mode, and whether time navigation buttons or tabs are visible. Always calculate `header.getBoundingClientRect().bottom + buffer`.
3. **DO NOT scroll only the `<input>` element**:
   - Always target the enclosing `.form-group` (`target.closest('.form-group') || target`). If only `<input>` is positioned below the header, the `<label>` and suggestion chips are clipped behind the sticky header.
4. **DO NOT set `overflow: hidden` on both axes of `html`/`body`**:
   - Setting `overflow: hidden` on `html` completely disables `window.scrollTo({ top: 0 })` on WebKit, making window pan recovery impossible.
5. **DO NOT use smooth scrolling (`behavior: 'smooth'`) during `focusin`**:
   - Smooth scrolling creates a race condition with WebKit's native keyboard animation. Instant adjustment (`c.scrollTop += delta`) places the element in the safe zone before WebKit checks whether to pan the window.

---

## 4. Verification Checklist

When making changes to form layouts, headers, or scrolling logic, verify on:
- [ ] **iPad Landscape (`> 860px`)**:
  - Focus *Amount*: Verify label, input, and hint sit cleanly below `.sticky-header-wrapper`.
  - Focus *Note*: Verify label, chips, and input are visible without jumping.
  - Focus *Tag* (bottom of form): Verify Tag scrolls into view above the keyboard with no window pan.
  - Tap iPad "Hide Keyboard" button: Verify keyboard closes cleanly with **zero blank gap** at the bottom of the screen.
- [ ] **iPad Portrait / Split-Screen (`<= 860px`)**:
  - Verify fields remain visible and window resets cleanly on dismiss.
- [ ] **Android App WebView (`expenseiq-android-app`)**:
  - Verify soft keyboard resize mode does not glitch header positions.
- [ ] **Desktop Browser**:
  - Verify mouse clicks into fields do not cause unnecessary scrolling if the field is already in view.
- [ ] **Cache Bursting**:
  - Bump version queries for all modified CSS (`main.css`, `forms.css`, `responsive.css`) and JS (`app.js`) in `index.html`.
