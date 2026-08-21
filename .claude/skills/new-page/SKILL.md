---
name: new-page
description: Use when adding a new top-level page/route to this app (a new file in src/pages that a user should be able to navigate to), to avoid registering the route but forgetting the nav link or vice versa.
---

# Add a new page

## Overview
A page in this app only becomes reachable once it exists in **two** places at
once: the route table in `src/App.jsx` and the nav list in
`src/components/Sidebar.jsx`. Missing either one leaves the page orphaned
(unreachable from the UI, or a 404 on direct navigation).

## Steps

1. **Create the page component** in `src/pages/` (e.g. `src/pages/FooPage.jsx`).
   It will render inside `MainLayout`'s `<Outlet />`, so it doesn't need to
   render its own header/sidebar — just the page content. Match the styling
   convention of nearby pages (Tailwind utilities in newer files, inline
   `style={{...}}` objects with the shared indigo/red/orange/blue/green
   palette in older data-heavy pages like `DailyEntryPage.jsx`).

2. **Register the route** in `src/App.jsx`:
   - Import the component at the top alongside the other page imports.
   - Add `<Route path="/foo" element={<FooPage />} />` inside the
     `<Route element={<MainLayout />}>` block (the non-admin branch — admin
     routes are a separate `<Route element={<AdminLayout />}>` block above
     it, don't confuse the two).

3. **Add the nav link** in `src/components/Sidebar.jsx`:
   - Add a `<NavLink to="/foo" className={...} onClick={() => setIsOpen(false)}>`
     using the same `linkClass`/`activeLinkClass` pattern as the existing
     links, placed wherever fits the existing nav ordering.
   - Keep the `onClick={() => setIsOpen(false)}` — it closes the mobile
     sidebar overlay on navigation; omitting it leaves the overlay open after
     tapping a link on mobile.

4. If the page needs list/detail data that a hook already covers (batches,
   workshops, tasks, employees), reuse `src/hooks/useBatchData.js` or
   `src/hooks/useTasks.js` rather than calling `supabase.from(...)` directly
   in the component. If it needs new data with no existing hook, write one
   following the same `load()`-on-mount + CRUD-functions-that-reload shape.

## Common mistakes
- Adding the `<Route>` but forgetting the `<NavLink>` — page works if you type
  the URL, but users can't find it.
- Adding the `<NavLink>` but forgetting the `<Route>` — clicking the link
  renders nothing (falls through to `App.jsx`'s admin `*` catch-all only
  applies to the admin branch; the non-admin branch has no catch-all, so it
  renders blank).
- Registering the route under the admin `<Route element={<AdminLayout />}>`
  block instead of the main one (or vice versa) — check `isAdmin` branching
  in `App.jsx` before picking a spot.
