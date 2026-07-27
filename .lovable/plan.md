## Goal

Bring the uploaded "Interactive Project Planning App" (Dutch planning tool: dashboard, projecten, agenda, personeelsplanning, beschikbaarheid, medewerkers, facturatie, instellingen) into this project so it runs at `/`, looking and behaving exactly like the Figma Make export. Data stays in-memory demo data (resets on refresh).

## What I'll do

1. **Extract the archive** and copy in the app source (no `.git`, no binaries):
   - `src/app/App.tsx` (the full single-file app) → `src/components/planning-app.tsx`
   - all shadcn UI components from `src/app/components/ui/` → merge into the project's `src/components/ui/`
   - `src/app/components/figma/ImageWithFallback.tsx` → `src/components/ImageWithFallback.tsx`
   - fix import paths (the export uses versioned imports like `@radix-ui/react-slot@1.1.2` and `./ui/utils`; these get rewritten to normal package names and `@/lib/utils`)

2. **Install the dependencies** the app actually uses: lucide-react, xlsx, radix-ui packages, class-variance-authority, clsx, tailwind-merge, sonner, recharts, date-fns, react-day-picker, embla-carousel-react, vaul, cmdk, motion, next-themes, react-resizable-panels, input-otp, canvas-confetti, react-hook-form. (Not react-router — this project uses TanStack Router; the app does its own internal tab navigation anyway, so no router change is needed.)

3. **Apply the design system**: port the export's `theme.css` tokens (navy `#1A2744`, teal accent `#0ABFB8`, coral `#FF6B5B`, light blue-grey background) into `src/styles.css`, and load the Inter + Plus Jakarta Sans fonts via a `<link>` in `src/routes/__root.tsx` (Tailwind v4 here can't `@import` a remote URL).

4. **Mount it at `/`**: replace the placeholder `src/routes/index.tsx` with a route that renders the app. The app uses browser-only state and drag/drop, so it renders client-side to avoid hydration mismatches.

5. **Set page metadata** on the index route (title/description/og/twitter) for the planning app instead of the default Lovable placeholder.

6. **Verify**: typecheck, then load the preview in a headless browser, click through the main sections (dashboard, projecten, agenda, personeelsplanning, medewerkers, facturatie) and screenshot to confirm it renders without console errors.

## Technical notes

- The app is one ~183KB component file with all state in React `useState` and hardcoded demo records — kept as-is per your choice, so no backend, no persistence, no auth.
- `xlsx` (Excel export) is browser-side only; it will be loaded in the client bundle.
- Any Figma-hosted placeholder images referenced in the export keep their remote URLs.
- Known trade-off: because everything lives in one file, later feature edits will be slower than in a split codebase. Easy to refactor later if you want.
