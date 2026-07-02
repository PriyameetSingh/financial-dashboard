<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Build and Run Commands Behavior
Do NOT automatically run the `npm run build` command or any production build script on the system unless the user explicitly requests it. You may perform type checking (e.g. `npx tsc --noEmit`) to verify correctness, but do not trigger full production builds without explicit user instructions.

# Prisma Database Migration Behaviour
- Do not directly make any changes or migrations on production DB.
- Database migrations and seeding MUST be applied to the test database first (using `npm run prisma:migrate:test` and `npm run db:seed:test`) and then to the development database (`npm run prisma:migrate` and `npm run db:seed`). Ensure changes are applied in both environments to prevent build or test suite failures.

# Changelog and Versioning Policy
- Every change affecting user-facing behavior MUST come with a corresponding changelog entry.
- Changelog entries must be written in plain language that a non-technical government officer would easily understand (e.g. describe user/officer workflow impact, not database schema, function names, or internal code structure).
- Version bumps and marking a release as "current" (active) MUST only happen when explicitly instructed with a specific version number. Never perform these changes automatically.