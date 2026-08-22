# SpendBuddy - AI Agent Sanity Test Cases

This file contains natural language End-to-End (E2E) testing instructions designed for LLM-based coding assistants (like Antigravity, Cursor, or general browser agents).

You can pass these instructions to an agent and ask it to verify the application's stability.

## Prerequisites
- The local server must be running (e.g., `npx http-server -p 8080 -c-1`).
- The agent should have access to a browser subagent or equivalent web interaction capabilities.
- Test Account: `freespirit.2016.app@gmail.com` / `Test123*`

---

## Test Suite: Basic Navigation & Sanity

### Test Case 1: Login functionality
1. Navigate to `http://localhost:8080/`.
2. Wait for the UI to load and locate the email and password input fields.
3. Enter `freespirit.2016.app@gmail.com` into the email field.
4. Enter `Test123*` into the password field.
5. Click the "Login" button.
6. **Expected Result**: The login modal disappears, no console errors are thrown, and the main application Dashboard is visible. 

### Test Case 2: Dashboard Rendering
1. After logging in, verify that the active view is the Dashboard.
2. Ensure the four summary cards (Total Expense, Total Refunds, Net Spend, Transactions) are present and contain valid numerical values.
3. Check the browser console for any uncaught exceptions or import errors.
4. **Expected Result**: Dashboard renders correctly without JS errors.

### Test Case 3: Sidebar Navigation
1. Open the sidebar (click the hamburger menu if on mobile viewport).
2. Click the "Transactions" tab. 
   - **Verify**: The view changes to "All Transactions" and a data table is visible.
3. Click the "Charts" tab.
   - **Verify**: The view changes to "Analytics & Charts" and the Donut/Bar charts render within the canvas elements.
4. Click the "Scheduled" tab.
   - **Verify**: The view changes to "Scheduled Transactions" and the scheduled table is visible.
5. Click the "Settings" tab.
   - **Verify**: The view changes to "Settings" and the Categories / Transaction Modes configuration tables are visible.
6. **Expected Result**: Smooth transitions between all tabs, with no "Cannot find module" or undefined variable errors in the console.

### Test Case 4: Adding a Transaction
1. Click the "+ Add Entry" button (from the Dashboard or sidebar).
2. Wait for the "Add New Entry" form to appear.
3. Enter `150` into the Amount field.
4. Select any Category and Transaction Mode from the available chips/dropdowns.
5. Add a generic note like "AI Agent Test Transaction".
6. Click "Add Entry".
7. **Expected Result**: A success toast should appear, the form should clear/close, and the new transaction should be immediately reflected in the Dashboard statistics. No console errors should be thrown.

---

**End of Test Suite**
*If an agent completes all tasks above and reports "No errors", the application is structurally sound.*
