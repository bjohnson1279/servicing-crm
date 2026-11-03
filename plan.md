1. **Explore `apps/tech-portal/src/components` for bare `<details>` elements**
2. **Replace bare `<details>` elements with `LazyDetails` in:**
   - `apps/tech-portal/src/components/catalog/CatalogWorkspace.tsx`
   - `apps/tech-portal/src/components/callbacks/CallbackWorkspace.tsx`
   - `apps/tech-portal/src/components/devices/DeviceWorkspace.tsx`
   - `apps/tech-portal/src/components/inspections/InspectionWorkspace.tsx`
3. **Verify the change.**
   - Run tests `npm ci`, `npm test` and `npx tsc --noEmit` inside `apps/tech-portal` directory.
   - Using `frontend_verification_instructions` visual test.
4. **Append the learning to `.jules/bolt.md`** if it's not already there.
5. **Complete pre commit steps to ensure proper testing, verification, review, and reflection are done.**
   - Call `pre_commit_instructions` tool to get the instructions on the pre commit checks.
6. **Submit PR.**
   - Call `submit` tool to submit the changes.
