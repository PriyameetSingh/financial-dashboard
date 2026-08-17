# Changelog

All notable changes to the HUDD Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Dashboard could report figures for the wrong financial year**: When an office had two financial years recorded that finish on the same date — which happens when a year is re-entered to correct a mistake, leaving the original in place — the dashboard had no settled rule for deciding which of the two was the current one. Budget and expenditure totals, the year shown on the financial screens, KPI targets and report packs could each land on a different one of the two, and the same screen could answer differently from one visit to the next. The dashboard now always treats the most recently entered of the tied years as the current one, on every screen, so the figures agree with each other and stay put. Offices with no duplicated year — which is nearly all of them — see no change at all.

### Changed
- Officers can now open the dashboard at the website's front door (for example `http://odisha.airawat.test:3000/`) instead of only under the old `/hudd-dashboard` path. Administrators who still host the dashboard under `/hudd-dashboard` keep that address by setting one configuration value before starting the application.

## [1.6.0] - 2026-08-16

### Added
- **Notification Center**: Officers now have access to a real-time notification dropdown in the top-right corner of their screen, providing instant updates on newly assigned tasks, KPI data reviews, and custom alerts.
- **Global Control & Sleep Mode**: Administrators can now toggle the notification service globally or pause alerts during system updates. A quiet-hours schedule can be defined to prevent notifications outside of standard office hours (with critical alerts bypassing sleep mode).
- **Manual Alert Dispatcher**: Allowed administrators to send manual custom alerts directly to individual officers with relative action links.
- **Automated Workflow Alerts**: Automatically notify concerned officers whenever a task update is posted, a task assignment changes, or KPI review decisions are resolved.
- **KPI Completion Workflow**: Officers can now mark a KPI as complete directly from the KPI tracker. For KPIs that have a reviewer, the completion request is sent for the reviewer's approval; for self-approved KPIs the KPI is completed immediately. A visible warning is shown next to the action when a KPI's progress is below 100%, but officers can still confirm completion. Completed KPIs are clearly badged in the list, can be filtered through a new "Completed" tab, and the dashboard summary now shows a completed count.
- **Meeting report Excel export**: Officers can now download a meeting report pack as an Excel (.xlsx) file in addition to the existing PDF. A new "Download Excel" button appears next to "Download PDF" on the meeting report page, and the active filters (monitoring level, priority, status) are applied to the export just like the PDF. The workbook contains one worksheet per report section — cover details, discussion topics, proposed presentations, financial progress, scheme-wise financial progress (one sheet per sponsorship type), key decisions, KPIs, and meeting notes — so each segment can be reviewed or shared separately.

### Fixed
- **Bulk financial entry could not be opened by anyone**: The bulk financial entry screen — the one that lets an officer key expenditure figures for many schemes at once — required a "Manage financial data" permission that had never been given to any role. Every officer who opened it was sent back to the dashboard without explanation, so the screen had effectively never been usable. The Finance Advisor role now holds that permission, and the screen opens for the finance desk as intended. No other role gained it, and no officer can now see any scheme they could not see before.
- **Wrongly-entered expenditure figures could not be corrected**: The ability to correct or remove a mis-keyed expenditure figure was released earlier, along with an "Edit financial entries" permission to control it — but that permission was never given to any role, so the correction and removal buttons never appeared for anyone and mistakes still needed a database change to fix. The Finance Advisor role now holds it. Every correction and removal continues to be recorded in the audit trail with the officer who made it.
- **Wide report and data tables can now be scrolled without a mouse**: Several wide tables — the budget-head breakdown, the user directory, and seven tables in the meeting and pendency reports — could only be scrolled sideways with a mouse or trackpad. Officers working from a keyboard could not reach the columns beyond the right-hand edge at all. These tables can now be reached and scrolled using the keyboard, and screen-reader software announces what each one contains.
- **Unlabelled controls now announce what they do**: A number of buttons and switches gave screen-reader software nothing to read out — the on/off switches on the notification settings screen, the expand arrows on the scheme board cards, the role selector on each row of the user directory, and the filter buttons on the decision tracker and the scheme board. Each now states what it controls and, where relevant, whether it is currently on or off.
- **"Read Only" notice is now announced properly**: Officers with view-only access see a faint "Read Only" watermark across the page. Screen-reader software used to read those two words out from the middle of the page with no explanation of what they referred to. It now reads a full sentence explaining that the officer has read-only access and that actions which change data are unavailable.
- **Text that was too faint to read**: A number of labels, figures and badges across the dashboard were too faint against their background to be comfortably readable — worst on the navigation panel, the KPI table, and the decision-tracker badges. All have been corrected and are now checked automatically before each release, on both the light and dark screen settings.
- **Sign-in problem page never appeared**: When something went wrong while signing in — access denied, an expired sign-in attempt, a misconfigured single sign-on service — the dashboard was supposed to show a page explaining what happened and what to do about it, along with a reference code to quote to the IT administrator. That page could never actually be seen: because the officer was not signed in at that moment, the dashboard sent them straight back to the sign-in screen with no explanation. The explanation page now opens as intended for anyone who has just failed to sign in.
- **Nodal officers not seeing their assigned KPIs and decision-tracker items**: Officers with "View assigned data" access could no longer see the KPIs and action items directly assigned to them, or enter scheme-wise financial data, because a recent security fix required a separate scheme-level assignment that was never set up for most officers. KPIs and action items now correctly show up for an officer whenever they are listed as the performer or reviewer on that item, regardless of any scheme-level assignment. Financial data entry (scheme-wise and summary) is restored for everyone who already has permission to enter financial data — it is no longer limited by scheme assignment.
- **Mobile sidebar layout**: On phones, the navigation sidebar no longer loads in an open state overlapping the page content. It now always starts closed as a slide-in drawer, and a previously saved desktop preference no longer forces it open on a phone. The dim backdrop now correctly covers the page when the drawer is open, and the drawer slides cleanly above the content instead of being hidden behind it. Shrinking a desktop window down to a phone width also automatically closes the drawer.

### Changed
- **New look for the whole dashboard**: Every screen has been redesigned onto a single, consistent visual system — the same cards, buttons, tables, badges and spacing everywhere, instead of each screen having its own. Nothing about how the dashboard works has changed: the same figures, the same lists in the same order, the same buttons doing the same things. What changed is how it looks.
- **Choose a light or dark screen**: Officers can now switch the dashboard between a dark and a light appearance using the control in the top bar, and the dashboard remembers the choice on that device. Both have been checked for readability, so text and figures are legible either way. The navigation panel stays dark in both, so the shape of the screen is familiar whichever is chosen.
- **Clearer priority and status markings**: Priority markers on decision-tracker items now carry a distinct shape as well as a colour — a triangle for Critical, a star for High, a rounded square for Medium and a circle for Low. Previously Medium and Low were shown in the same colour and could not be told apart at a glance, and colour alone is not visible to officers with colour blindness or on a black-and-white printout. Status labels across decision items, KPIs and meetings now use one consistent badge style.
- **Charts are readable for colour-blind officers**: The colours used in charts and progress bars across the financial, KPI and scheme screens were reviewed and adjusted so that every pair of series can be told apart by officers with the common forms of colour blindness. Two chart colours were previously close enough to be indistinguishable. Figures and labels beside each chart continue to carry the same information in words.
- **Report printouts unchanged**: The meeting and pendency reports still print exactly as before, on white paper with the same coloured section bands and highlight rows, regardless of whether the officer is using the light or dark screen setting.
- Meeting report packs now show the assigned reviewer (vertical head or supervising officer) as the owner for KPIs and action items, instead of the nodal officer who enters updates. When a task has no separate reviewer, the report still shows the officer who performs the work.
- **Safer Meeting Deletion**: Officers can no longer delete a meeting that still has active action items tied to it. A clear warning first lists the pending action items and asks the officer to delete or archive them before the meeting can be removed. Once those are cleared, a second caution screen warns that KPI measurements and finance figures recorded during the meeting will remain but will lose their link back to the meeting, and that the meeting's discussion topics and uploaded presentation files will be permanently erased. The officer must tick an acknowledgement box before deletion can proceed. Uploaded presentation files are now also removed from storage when a meeting is deleted, instead of being left behind as orphan files.
- **Roles screen redesign**: The Administration > Roles screen now organizes each role's permissions into clear groups (such as Data Entry, Approvals, and Scheme Management) with simple on/off toggles, instead of one long row of tags. A summary bar at the top shows the total number of roles, the average permissions granted, and a security alert for any role that cannot manage permissions. A "Role Update History" panel below the roles lists every permission change with the time, role, action, and the administrator who made it, so officers can review who changed what and when.
- **"System Settings" renamed to "Masters Data"**: The Administration page that holds reference directories (organisations, verticals, sections, ULBs and designations) has been renamed from "System Settings" to "Masters Data" since it only contains master directories and no system-wide configuration. The sidebar entry and the Administration index card now both point to the new "Masters data" location.

### Removed
- **Permissions shortcut**: The unused "Permissions" shortcut in the Administration area (which only redirected to the user directory) has been removed. Permission management now lives entirely on the Roles screen.
- **Unused upload-service scaffolding**: Removed a set of half-built code that was never reachable from any screen — the FastAPI upload proxy routes (`/api/v1/uploads/*`), the matching proxy client, an unused draft-data context, and six orphan dashboard components that no page imported. None of this affected any officer workflow; the actual file-upload features (action-item proof upload and meeting material upload) work directly through the dashboard's own database and are unchanged. The public health-check endpoint no longer reports the status of the external upload service, since that service is not part of this application.

### Fixed
- Meeting report PDF downloads no longer show overlapping, clipped, or garbled text in finance tables, action items, and KPI sections when rows span multiple lines or pages.
- Fixed scheme re-ordering page to properly show a warning dialog when users try to navigate away with unsaved changes, preventing accidental loss of reordering work
- The navigation panel now remembers whether you collapsed or expanded it when you move between pages. Previously, if you collapsed the sidebar and then opened another page, the sidebar would automatically expand again, forcing you to collapse it repeatedly on every page

### Security
- When an administrator resets a user's password, the user is now immediately
  logged out from all devices and must sign in again with the new password.
  Previously, the user could continue using the application with their old
  session until it naturally expired.
- Fixed session validation to properly log out users when browser cookies and site data are cleared, ensuring unauthorized access is prevented immediately
- Four dashboard API actions that proxied to an external upload service (uploading a file, listing uploads, approving an upload, and triggering upload processing) were live without any sign-in check, so anyone with the dashboard URL could call them directly. No screen in the dashboard used these actions — they were half-built scaffolding — but the endpoints were still reachable over the network. They have been removed entirely rather than guarded, so there is no longer anything to authorise. The file-upload features the dashboard actually uses (action-item proof upload and meeting material upload) were never affected and continue to work through the dashboard's own database.
- The list of financial years used to populate on-screen selectors now requires a signed-in officer. Previously it was reachable without any sign-in.
- Removed a leftover test page that returned made-up dashboard statistics and was reachable without sign-in.
- Added a server-side sign-in check at the entry point for all dashboard API actions, so a newly added API action that forgets to require a permission is no longer reachable without sign-in. A continuous-integration check now also fails the build if any dashboard API action is added without an authorization check, so the gap is caught before release rather than discovered later.
- When an administrator resets a user's password, the user is now immediately blocked from reading dashboard data on all protected actions — not only the ones that reload the officer's profile, but also the read-only views (uploads list, releases, schemes, meetings, KPIs, financial data, and the RBAC/admin pages). Previously, a user whose password had been reset could keep reading data on those read-only views until their old sign-in token naturally expired, because only some actions re-checked the password reset. The check now applies uniformly across every protected action.

---

## [1.4.6] - 2026-07-24

### Added
- **Financial Entry Corrections**: Administrators can now grant a new "Edit financial entries" permission to specific officers, who can then correct or remove a wrongly-entered financial expenditure figure (for example, an incorrect IFMS amount added to a sub-scheme) directly from the financial data entry screen's update history. This removes the need for a database change to fix data-entry mistakes; every correction or removal is recorded in the audit trail.

---

## [0.1.0] - Initial Release

### Features
- Initial HUDD Dashboard implementation
- User authentication and role-based access control
- Scheme and programme registry management
- KPI monitoring and tracking
- Action item workflow
- Financial progress tracking
- Decision tracker
- Bulk data entry capabilities
- Mobile-responsive design

---

<!-- 
Changelog Entry Guidelines:
- Write in plain language for non-technical government officers
- Describe user/officer workflow impact, not technical implementation
- Group related changes under appropriate sections:
  - Added: New features
  - Changed: Changes to existing functionality
  - Fixed: Bug fixes
  - Removed: Removed features
  - Security: Security improvements
  - Performance: Performance improvements
-->
