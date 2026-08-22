# TODO list
---------------------
Pick feature, enhancements, fixes from here.
commit after each features or set of fixes/enhancements
run full test & update docs for new changes
do not make changes to this file except mark/unmark todo items
---------------------

### 2026.10.19

Chores:
- [x] Hook firebase auto deploy on commit
- [x] disable netlify deploy on commit
- [x] add netlify auto deploy as github workflow

Bugs:
- [ ] to check android app caching, it doesnt reflect changes completely when new deployement is done, at least startup should completely refresh whole website if possible
- [x] keyword mapping  
   - [x] support to update tags. support for enable/disable.
   - [x] Layout is broken on ipad safari landscape mode, maybe broken everywhere, keyword column overlaps other columns
- [x] visibility prefs > compact view toggle button layout broken. Compact view shouldnt be under hide data. Add hide amount config here too
- [x] when a tag/note is selected on add or batch update form, focus on the textbox but for touch devices dont open keyboard, unless explicitly tapped on the textbox
- [x] in dashboard, quick edit button for refunds dont work. Make it work and add the same button for normal txns too
- [x] txn page > top most row > context menu going behind table header
- [x] txn page (mobile only) > filters have a large gap at bottom when expanded
- [x] add txn page (mobile only)
   - [x] collapse tags, location, scheduler frequency under a section
   - [x] only if scheduler is being edited make scheduler freq uncollapsed by default
   - [x] make all the badge list (category, txn type, txn mode, note, tags, location etc) horizontally scrollable
   - [x] disable swipe left/right on add page only
   - [x] rows of txns on selected date has a gap on the right side (looks like gap for action buttons)
- [x] settings > about missing for mobile

Features:
- [ ] Ability to add/update/delete/restore txn offline (only for android app)
  - website needs to cached for full offline use. should never logically redirect to offline page unless it is installed in offline or cache is manually cleared
  - any offline txn activity etc should be stored in local as diff, so that when app is online, etag doesnt reject local change or replace remote change
  - no need to support anything other than txn and scheduled txn for offline use. show error toast on update.
- [x] add & manage bills
- [ ] create txn from bill
- [ ] To check feasibility of google drive backup implementation without using gcp
- [x] activate a specific tag to be added to new txns. Configured in settings.
  - To be shown on dashboard as a tool
  - To be added to any txn from sms/email/quick add.
  - To be prefilled in add form, not update form.
  - Not to be used by txn added from scheduled txn.
- [x] Split tool (store as json file)
   - add multiple people (option to resuse people from older bills)
   - configure total amount
   - configure how to split the bill: equally or using expressions for each people
   - configure total tax expression for each people. Option to choose how to split tax: equally or percentage wise
   - expressions should support for +-/* & brackets
   - store the end amount as well for each x] activity history
  - as new section under settings.
  - Stored as json file. Stores txn or scheduled txn added/updated/deleted/restored with activity timestamp, type (schedule/quickadd/txn), source for non-scheduled txn (manual/schedule/sms/email/…), updated field name+from+to (only for amount, note, date).
  - Clicking on an activity should move to the txn or scheduled txn
- [x] trash
  - no new section on ui.
  - Stored as new field in txn csvs.
  - Any txn delete moves to trash.
  - Activity history for any delete should show restore option if the txn was not restored already. 
- [x] only for mobile, in dashboard, below cards add a row of tools, with round icons with text below it.
  - tools to show (whichever is implemented): balance tracker, split tool, bill tracker, activity history. (divide setting menu in 3 sections: settings, tools, about)
  - for mobile only: these same tools shoud available inside settings menu as well
  - for non mobile only: these same tools should be available in left side panel


### Older

- [ ] BUG: to verify default txn type for -ve txn from sms/email (dashboard & add page suggestions) should be Refund, not Income. It should be Income only if it is inferred by any other mapping (auto/manual) logic
- [x] add an eye button beside "Add entry" button in dashboard to show/hide amount values on the cards on top of the dashboard. hide them with "✦✦✦✦.✦✦". save the state in user info to remember across sessions
- [x] only for desktop, clicking on Schedule badge in txn page should open the schedule list and highlight that specific schedule
- [x] for mobile, when in add txn page, + button background is transparent, make it opaque
- [x] map keywords like sweet, cake, bakery etc to food
- [x] handle uncommitted email test data
