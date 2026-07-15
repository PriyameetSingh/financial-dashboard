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

# Mobile Responsiveness Guidelines
- All new pages, components, and user workflows MUST be designed to be mobile-friendly and fully functional on narrow screens (< 768px) since nodal officers often work from their phones.
- **Sidebar Drawer**: The navigation sidebar must auto-collapse on mobile viewports by default. Ensure it slides off-screen (`-translate-x-full`) with a proper overlay backdrop mask that closes the sidebar when clicked.
- **Master-Detail Layouts**: For entries and detailed workflows, show the list panel first on mobile. Only show the detail panel once an item is selected, and include a clear, prominent "Back to List" navigation control to return to the selection list.
- **Tables and Data Grids**: Do not use horizontal overflow scrolls for tables if possible; on mobile, transform table rows into readable card-like blocks with explicit small labels for each field.
- **Header and Footer Controls**: Wrap toolbars and actions using `flex-wrap` and stack them vertically (`flex-col md:flex-row`) with full-width buttons on mobile to avoid squeezing interactive elements.

# UI Component Guidelines
- **No Browser-Native Interactive Components**: Do NOT use browser-native interactive components (such as standard HTML `<select>` elements, native dropdowns, etc.) for filters, inputs, or control panels. Instead, design or reuse premium custom-styled components (such as `CustomSelect` or `SearchableUserSelector`) that match the dashboard's rich visual design and support custom menus and help tooltips.
- **Component Separation**: Whenever a new custom component is required, design it as a separate, reusable component file (e.g., inside `src/components/ui/`) rather than creating it inline in page files or parent components.