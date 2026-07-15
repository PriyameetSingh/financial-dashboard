# Changelog

All notable changes to the HUDD Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- New changes go here. Do not manually edit this section - use the bug-fixing workflow -->

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
