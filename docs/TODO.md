# TODO list
---------------------
Pick feature, enhancements, fixes from here.
commit after each features or set of fixes/enhancements
---------------------

### 2026.10.19

Chore:
- [ ] Hook firebase deploy on commit
- [ ] squash whole repo changes to single commit.

Features:
- [ ] Ability to add/update/delete txn offline
- [ ] Split tool (store as json file)
   - add multiple people (option to resuse people from older bills)
   - configure total amount
   - configure how to split the bill: equally or using expressions for each people
   - configure total tax expression for each people. Option to choose how to split tax: equally or percentage wise
   - expressions should support for +-/* & brackets
   - store the end amount as well for each user
- [ ] add & manage bills, create txn from bill
- [ ] To check google drive backup implementation without using gcp api
- [ ] activity history: as new section under settings. Stored as json file. Stores txn or scheduled txn added/updated/deleted/restored with activity timestamp, type (schedule/quickadd/txn), source for non-scheduled txn (manual/schedule/sms/email/…), updated field name+from+to (only for amount, note, date). Clicking on an activity should move to the txn or scheduled txn
- [ ] trash: no new section on ui. Stored as new field in txn csvs. Any txn delete moves to trash. Activity history for any delete show restore option if the txn was not restored already. 
- [ ] activate a specific tag to be added to new txns. Configured in settings. To be shown on dashboard. To be added to any txn from sms/email/quick add. To be prefilled in add form, not update form. Not to be used by txn added from scheduled txn.

Bugs:
- [ ] keyword mapping  
   - [ ] support to update tags. support for enable/disable.
   - [ ] Layout is broken on ipad safari landscape mode, maybe broken everywhere, keyword column overlaps other columns
- [ ] any refund are getting added as income from dashboard sms suggestion
- [ ] visibility prefs > compact view toggle button layout broken. Compact view shouldnt be under hide data. Add hide amount config here too
- [ ] when a tag/note is selected on add or batch update form, focus on the textbox but for touch devices dont open keyboard, unless explicitly tapped on the textbox
- [ ] in dashboard, quick edit button for refunds dont work. Make it work and add the same button for normal txns too
- [ ] txn page > top most row > context menu going behind table header
- [ ] txn page (mobile only) > filters have a large gap at bottom when expanded
- [ ] add txn page (mobile only)
   - [ ] collapse tags, location, scheduler frequency under a section
   - [ ] only if scheduler is being edited make scheduler freq uncollapsed by default
   - [ ] make all the badge list (category, txn type, txn mode, note, tags, location etc) horizontally scrollable
   - [ ] disable swipe left/right on add page only

### Older

- [ ] BUG: to verify default txn type for -ve txn from sms/email (dashboard & add page suggestions) should be Refund, not Income. It should be Income only if it is inferred by any other mapping (auto/manual) logic
- [x] add an eye button beside "Add entry" button in dashboard to show/hide amount values on the cards on top of the dashboard. hide them with "✦✦✦✦.✦✦". save the state in user info to remember across sessions
- [x] only for desktop, clicking on Schedule badge in txn page should open the schedule list and highlight that specific schedule
- [x] for mobile, when in add txn page, + button background is transparent, make it opaque
- [x] map keywords like sweet, cake, bakery etc to food
- [x] handle uncommitted email test data