<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Build and Run Commands Behavior
Do NOT automatically run the `npm run build` command or any production build script on the system unless the user explicitly requests it. You may perform type checking (e.g. `npx tsc --noEmit`) to verify correctness, but do not trigger full production builds without explicit user instructions.

