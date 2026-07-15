# HUDD Bug Fixing Skill

Systematic workflow for fixing bugs from the Notion bug tracker.

## Quick Start

```bash
# Fix up to 5 bugs assigned to you
/fix-hudd-bugs

# Filter by priority
/fix-hudd-bugs priority=P0,P1

# See the plan without making changes
/fix-hudd-bugs dry-run

# Fix bugs for a specific component
/fix-hudd-bugs component="Create User"
```

## What This Skill Does

1. **Fetches bugs** from Notion Bug Tracker assigned to you
2. **Filters** for HUDD bugs with status "Open" or "Reopen"
3. **Groups** related bugs by component/page for efficient fixing
4. **Fixes** bugs with proper validation, error handling, and mobile responsiveness
5. **Tests** changes with TypeScript type checking
6. **Updates** bug status in Notion to "Fix"
7. **Documents** changes in CHANGELOG.md with plain language

## Key Features

- **Smart Grouping**: Related bugs are fixed together to save tokens
- **Approval Gates**: You approve the plan and Notion updates
- **Plain Language**: Changelog entries are written for non-technical officers
- **Type Safe**: Runs `npx tsc --noEmit` to verify correctness
- **Mobile First**: Ensures all fixes work on narrow screens

## Bug Status Flow

```
Open/Reopen → Fix (agent) → Review Completed (QA) → Done (QA)
```

The agent only marks bugs as "Fix". QA team verifies and marks as "Done".

## Limits

- Max 5 bugs per session (configurable)
- Only HUDD bugs (BUG-HUDD-xxx)
- Only bugs assigned to you
- Only "Open" or "Reopen" status

## Portability

This skill is fully portable via git. When you clone on a new machine:
- ✅ Skill files work immediately
- ❌ Need to re-authenticate Notion MCP (one-time OAuth)

## See Also

- Full documentation: `SKILL.md`
- Agent rules: `/AGENTS.md` (Bug Fixing Workflow section)
- Changelog: `/CHANGELOG.md`
