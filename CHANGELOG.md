# Changelog

All notable changes to the HUDD Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Notification Center**: Officers now have access to a real-time notification dropdown in the top-right corner of their screen, providing instant updates on newly assigned tasks, KPI data reviews, and custom alerts.
- **Global Control & Sleep Mode**: Administrators can now toggle the notification service globally or pause alerts during system updates. A quiet-hours schedule can be defined to prevent notifications outside of standard office hours (with critical alerts bypassing sleep mode).
- **Manual Alert Dispatcher**: Allowed administrators to send manual custom alerts directly to individual officers with relative action links.
- **Automated Workflow Alerts**: Automatically notify concerned officers whenever a task update is posted, a task assignment changes, or KPI review decisions are resolved.
- **KPI Completion Workflow**: Officers can now mark a KPI as complete directly from the KPI tracker. For KPIs that have a reviewer, the completion request is sent for the reviewer's approval; for self-approved KPIs the KPI is completed immediately. A visible warning is shown next to the action when a KPI's progress is below 100%, but officers can still confirm completion. Completed KPIs are clearly badged in the list, can be filtered through a new "Completed" tab, and the dashboard summary now shows a completed count.
- **Meeting report Excel export**: Officers can now download a meeting report pack as an Excel (.xlsx) file in addition to the existing PDF. A new "Download Excel" button appears next to "Download PDF" on the meeting report page, and the active filters (monitoring level, priority, status) are applied to the export just like the PDF. The workbook contains one worksheet per report section — cover details, discussion topics, proposed presentations, financial progress, scheme-wise financial progress (one sheet per sponsorship type), key decisions, KPIs, and meeting notes — so each segment can be reviewed or shared separately.

### Fixed
- **Mobile sidebar layout**: On phones, the navigation sidebar no longer loads in an open state overlapping the page content. It now always starts closed as a slide-in drawer, and a previously saved desktop preference no longer forces it open on a phone. The dim backdrop now correctly covers the page when the drawer is open, and the drawer slides cleanly above the content instead of being hidden behind it. Shrinking a desktop window down to a phone width also automatically closes the drawer.

### Changed
- Meeting report packs now show the assigned reviewer (vertical head or supervising officer) as the owner for KPIs and action items, instead of the nodal officer who enters updates. When a task has no separate reviewer, the report still shows the officer who performs the work.
- **Safer Meeting Deletion**: Officers can no longer delete a meeting that still has active action items tied to it. A clear warning first lists the pending action items and asks the officer to delete or archive them before the meeting can be removed. Once those are cleared, a second caution screen warns that KPI measurements and finance figures recorded during the meeting will remain but will lose their link back to the meeting, and that the meeting's discussion topics and uploaded presentation files will be permanently erased. The officer must tick an acknowledgement box before deletion can proceed. Uploaded presentation files are now also removed from storage when a meeting is deleted, instead of being left behind as orphan files.
- **Roles screen redesign**: The Administration > Roles screen now organizes each role's permissions into clear groups (such as Data Entry, Approvals, and Scheme Management) with simple on/off toggles, instead of one long row of tags. A summary bar at the top shows the total number of roles, the average permissions granted, and a security alert for any role that cannot manage permissions. A "Role Update History" panel below the roles lists every permission change with the time, role, action, and the administrator who made it, so officers can review who changed what and when.
- **"System Settings" renamed to "Masters Data"**: The Administration page that holds reference directories (organisations, verticals, sections, ULBs and designations) has been renamed from "System Settings" to "Masters Data" since it only contains master directories and no system-wide configuration. The sidebar entry and the Administration index card now both point to the new "Masters data" location.

### Removed
- **Permissions shortcut**: The unused "Permissions" shortcut in the Administration area (which only redirected to the user directory) has been removed. Permission management now lives entirely on the Roles screen.

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
- Evidence upload and approval actions (uploading proof, viewing the uploads list, approving an upload, and triggering upload processing) now require a signed-in officer with the appropriate permission. Previously these actions were reachable without any sign-in, so anyone with the dashboard URL could call them. Approving and processing an upload now require an officer who can approve action items; viewing the uploads list requires an officer who can view scheme data.
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
