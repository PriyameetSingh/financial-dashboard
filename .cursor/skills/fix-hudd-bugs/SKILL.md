---
name: fix-hudd-bugs
description: Systematic workflow for fixing HUDD bugs from Notion bug tracker with smart grouping, testing, and changelog updates.
---

# HUDD Bug Fixing Workflow

This skill provides a structured process for fixing HUDD Dashboard bugs tracked in Notion. It fetches bugs assigned to you, groups related bugs for efficient fixing, and ensures proper documentation and status updates.

## Usage

Invoke this skill when you want to fix HUDD bugs:

```
/fix-hudd-bugs
```

Optional parameters:
- `priority=P0,P1` - Filter bugs by priority
- `component="Create User"` - Filter bugs for specific component
- `dry-run` - Show plan without executing fixes
- `max=3` - Override default max bugs per session (default: 5)

## Workflow Phases

### Phase 1: Discovery

**Goal**: Fetch and filter HUDD bugs assigned to current user

**Steps**:
1. Get current user identity from Notion MCP (`notion-fetch` with `id: "self"`)
2. Query Bug Tracker database (collection://cda67a9f-afbc-4658-a8d6-6b33a30d7206) using SQL:
   ```sql
   SELECT 
     url, "Bug ID", "Bug Title", "Bug Status", "Severity", 
     "Priority", "Bug Type", "Page Name", "Feature Name",
     "Bug Description", "Steps to Reproduce", "Expected Result",
     "Actual Result", "Environment", "Created time"
   FROM "collection://cda67a9f-afbc-4658-a8d6-6b33a30d7206"
   WHERE Assignee LIKE ?
     AND "Bug ID" LIKE 'BUG-HUDD%'
     AND "Bug Status" IN ('Open', 'Reopen')
   ORDER BY 
     CASE "Priority" 
       WHEN 'P0' THEN 1 WHEN 'High' THEN 1
       WHEN 'P1' THEN 2 
       WHEN 'P2' THEN 3 WHEN 'Medium' THEN 3
       ELSE 4 
     END,
     CASE "Severity"
       WHEN 'Critical' THEN 1 WHEN 'Blocker' THEN 1
       WHEN 'High' THEN 2
       WHEN 'Medium' THEN 3
       ELSE 4
     END,
     "Created time" DESC
   LIMIT ?
   ```
   - Parameter 1: `%<user-id>%` (from user identity)
   - Parameter 2: `max` value (default 5)

3. Display summary table:
   ```
   Found X bugs assigned to you:
   
   | Bug ID | Title | Status | Priority | Severity | Component |
   |--------|-------|--------|----------|----------|-----------|
   ```

4. If no bugs found, inform user and exit gracefully

### Phase 2: Planning & Grouping

**Goal**: Group related bugs to optimize token usage and fix efficiency

**Grouping Strategy** (in order of priority):
1. **Same "Page Name"** - Bugs affecting the same UI page/screen
2. **Same "Feature Name"** - Bugs in related functionality
3. **Same "Bug Type"** - Similar type of issues (UI/UX, Functional, etc.)
4. **Standalone** - Bugs that don't fit into groups

**Steps**:
1. Analyze bugs and create groups
2. For each group, identify:
   - Likely affected files (based on component-to-file mapping below)
   - Common patterns across bugs
   - Estimated complexity (simple/medium/complex)

3. Present fixing plan:
   ```
   Fixing Plan:
   
   GROUP 1: Create User Page (3 bugs)
   - BUG-HUDD-001: Duplicate email validation not working
   - BUG-HUDD-002: Phone number accepts more than 10 digits
   - BUG-HUDD-004: Missing mandatory field indicators
   Affected files: app/admin/users/, components/users/CreateUserForm.tsx
   Complexity: Medium
   
   GROUP 2: Action Item Details (2 bugs)
   - BUG-HUDD-009: In Progress button remains active after completion
   - BUG-HUDD-010: Reject button not visible
   Affected files: app/tasks/, components/tasks/ActionItemDetail.tsx
   Complexity: Simple
   
   Proceed with this plan? (yes/no)
   ```

4. Wait for user confirmation before proceeding

### Phase 3: Execution (per group)

**Goal**: Fix all bugs in a group together

**Steps**:
1. **Read relevant files**:
   - Use component mapping to identify files
   - Search codebase for component names if needed
   - Read related API routes, actions, or utilities

2. **Understand current implementation**:
   - Analyze existing validation logic
   - Check form components and event handlers
   - Review related types/interfaces

3. **Apply fixes for all bugs in the group**:
   - Fix validation issues
   - Correct UI behavior
   - Update error messages to be user-friendly (plain language)
   - Ensure mobile responsiveness (per AGENTS.md guidelines)
   - Follow existing code patterns and conventions

4. **Run type checking**:
   ```bash
   npx tsc --noEmit
   ```
   - Fix any type errors introduced
   - DO NOT run `npm run build` (per AGENTS.md)

5. **Review changes**:
   - Show diff of changes made
   - Explain what was fixed for each bug
   - Ask: "Apply these fixes? (yes/no/modify)"

6. If user says "modify", ask for specific changes and iterate

### Phase 4: Completion

**Goal**: Document fixes and update bug status in Notion

**Steps**:

1. **Draft changelog entries** (per AGENTS.md requirements):
   - Write in plain language for non-technical government officers
   - Describe user/officer workflow impact (not technical details)
   - Group related fixes together
   
   Example format:
   ```markdown
   ## Bug Fixes
   - Fixed user creation form to properly validate duplicate email addresses and show clear error messages
   - Corrected phone number field to only accept 10-digit numbers
   - Added visual indicators (asterisk *) to show which fields are required
   ```

2. **Show changelog entry and ask for approval**:
   ```
   Changelog entry:
   [show entry]
   
   This will update X bugs in Notion to status "Fix":
   - BUG-HUDD-001
   - BUG-HUDD-002
   - BUG-HUDD-004
   
   Approve? (yes/no/edit)
   ```

3. **If approved, update Notion for each bug**:
   - Use `notion-update-page` to update bug status
   - Set "Bug Status" to "Fix"
   - Add to "Dev Comments": Brief technical note about the fix
   - Example dev comment: "Fixed validation in CreateUserForm component, added proper error handling"

4. **Update changelog file**:
   - Read existing CHANGELOG.md
   - Add new entries under "## Unreleased" section
   - If no "## Unreleased" section exists, create it at the top

5. **Final summary**:
   ```
   ✅ Fixed X bugs across Y groups
   ✅ Updated X bugs in Notion to "Fix" status
   ✅ Added changelog entries
   
   ⚠️ Next steps:
   - Test the changes manually
   - Have QA verify fixes and mark bugs as "Done" in Notion
   - Version bump will be done separately when releasing
   ```

## Component-to-File Mapping

Use this mapping to quickly locate relevant files for bug fixes:

| Component / Page Name | Likely File Locations |
|-----------------------|----------------------|
| Administration → Users, Create User | `app/admin/users/`, `components/users/` |
| My Tasks, Action Item Details | `app/tasks/`, `components/tasks/` |
| Financial Progress, IFMS Update | `app/financial/`, `components/financial/` |
| Overview Dashboard | `app/dashboard/`, `components/dashboard/` |
| Create Schemes, Programme Registry | `app/schemes/`, `components/schemes/` |
| KPI Monitoring, KPI Details | `app/kpi/`, `components/kpi/` |
| Decision Tracker | `app/decisions/`, `components/decisions/` |
| Login, Authentication | `app/auth/`, `auth.ts`, `lib/auth/` |
| Side Navigation, Top Header | `components/layout/` |
| Bulk Entry, Bulk PDF Generator | `app/bulk/`, `components/bulk/` |

**Search strategy** if component not in mapping:
1. Use Grep to search for component name in file contents
2. Search for "Page Name" value in JSX/TSX files
3. Check `app/` directory structure for route segments

## Important Rules

**DO:**
- ✅ Group related bugs to optimize token usage
- ✅ Run `npx tsc --noEmit` to verify type correctness
- ✅ Write changelog entries in plain language (no technical jargon)
- ✅ Ask for approval before updating Notion bug status
- ✅ Ensure fixes are mobile-responsive (< 768px screens)
- ✅ Follow existing code patterns and component structure
- ✅ Update bug status to "Fix" only (not "Done" - QA does that)

**DO NOT:**
- ❌ Run `npm run build` or production builds
- ❌ Start dev server unless explicitly requested
- ❌ Bump version numbers (only when explicitly instructed)
- ❌ Mark bugs as "Done" or "Review Completed" (only "Fix")
- ❌ Use technical terms in changelog (e.g., "mutation", "validation schema")
- ❌ Make database migrations without following Prisma workflow
- ❌ Use browser-native components (use custom components instead)

## Error Handling

**If SQL query fails:**
- Check if Notion MCP is authenticated (`notion-fetch` with `id: "self"`)
- Verify database collection URL is correct
- Retry with simpler query if needed

**If no bugs found:**
- Inform user gracefully: "No open or reopened HUDD bugs assigned to you."
- Suggest checking Notion manually or adjusting filters

**If type checking fails:**
- Fix type errors before proceeding
- Show errors to user if unable to fix
- Ask if user wants to proceed anyway (not recommended)

**If Notion update fails:**
- Show error message
- Ask if user wants to retry or skip Notion updates
- Changelog updates can still be applied independently

## Examples

### Example 1: Basic usage
```
User: /fix-hudd-bugs

Agent: 
Found 4 bugs assigned to you:
[shows table]

Fixing Plan:
GROUP 1: Create User (3 bugs)...
GROUP 2: Action Items (1 bug)...

Proceed? (yes/no)

[User confirms, agent fixes bugs, updates changelog, and Notion]
```

### Example 2: Filtered by priority
```
User: /fix-hudd-bugs priority=P0,P1

Agent:
Found 2 P0/P1 bugs assigned to you:
[shows high-priority bugs only]
```

### Example 3: Dry run
```
User: /fix-hudd-bugs dry-run

Agent:
[Shows plan but doesn't execute fixes]
This is a dry run. No changes will be made.
```

## Post-Fix Verification

After completing the workflow, remind the user to:
1. **Manually test** the fixed components in the browser
2. **Check mobile responsiveness** on narrow viewports
3. **Verify with QA team** before deploying
4. **Monitor** for related issues after deployment

The bugs will remain in "Fix" status until QA verifies and marks them as "Done" in Notion.
