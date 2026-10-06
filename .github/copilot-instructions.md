# Project guidance

- Keep the RideOps prototype frontend-first and preserve its responsive operations-dashboard design.
- Keep three separate apps: `admin-dashboard/` (fleet admin), `user-app/` (rider, mobile-ready) and `driver-app/`; `mock-api/` is the local demo API between rider and driver.
- Do not re-embed rider or driver screens into the admin dashboard; connect the apps only through a future backend/API.
- Keep demo authentication and in-memory booking behavior clearly labeled as non-production.
- Do not claim Google Sheets, live maps, or real-time dispatch are connected until backend integration exists.
- Validate UI changes with `npm run build` and `npm run lint`.
- After every dashboard feature change, run the app locally and verify the updated UI in the browser; keep the development server available for preview.