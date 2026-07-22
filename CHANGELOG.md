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

### Fixed
- Fixed scheme re-ordering page to show a warning dialog when users try to navigate away with unsaved changes, preventing accidental loss of work

### Security
- When an administrator resets a user's password, the user is now immediately
  logged out from all devices and must sign in again with the new password.
  Previously, the user could continue using the application with their old
  session until it naturally expired.

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
