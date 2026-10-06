# RideOps Project History

This document records the frontend work completed from the initial empty workspace through the current admin dashboard and standalone rider booking app.

## Project Structure

- The repository root contains the fleet admin dashboard.
- `user-app/` contains the independent rider booking application. It is isolated so it can later be adapted into a mobile app without embedding rider screens in the admin UI.
- Both frontends use React, TypeScript, Vite, and Lucide icons. They have separate dependencies, build output, and local development servers.

## Changes, In Order

### 1. Initial Admin Dashboard

- Replaced the Vite starter page with a fleet operations dashboard for two demo vehicles.
- Added admin sign-in and sign-up screens, clearly labeled as mock frontend authentication.
- Added an operations navigation rail, fleet summary metrics, active trips, a request queue, and an Austin map illustration.
- Seeded two active rides and two waiting requests so the dashboard has an example operating state when opened.

### 2. Queue, Availability, and Dispatch

- Added a request form to add riders to the admin demo queue.
- Added each queued rider's selected vehicle and a vehicle availability label derived from active trip state.
- Preserved FIFO ordering among requests for the same vehicle. Completing a trip dispatches the oldest queued rider who selected that vehicle.
- Added three estimated pickup windows when vehicles are occupied. These are illustrative frontend estimates, not traffic-based predictions.
- Consolidated duplicate queue presentations into a single full-width Trips/Queue panel. Queue rows include rider, route, chosen vehicle, wait duration, and current occupancy.

### 3. Export and Admin Layout Refinements

- Added an Export data control that downloads the current admin trips and requests as a CSV file.
- Extended CSV fields to include booking details where present.
- Tightened the operations layout, removed redundant callouts and unused blank panel height, and extended Active trips to the right edge of the content area.
- Matched the panel's edge behavior to responsive page gutters to avoid horizontal overflow on mobile.
- Kept the map as an illustration and labeled integration boundaries; it is not connected to a mapping or vehicle-location service.

### 4. Rider Booking Form Prototype

- First added a rider booking form inside the admin app to explore the booking fields and submission flow.
- Based on the requested app separation, moved the rider experience to the independent `user-app/` subfolder and removed its route and component from the admin app.
- The early rider form mirrored a detailed visit-request form, including corporate-purpose fields and simulated email verification. Those fields were subsequently removed because they made a normal cab booking unnecessarily long.

### 5. Current Rider Quick-Book Interface

- Replaced the long form with a compact ride flow that asks for:
  - Rider name and phone number
  - Pickup and destination
  - Vehicle choice
  - Passenger count
  - Optional pickup date and time
- Added a location swap action and vehicle selection cards with passenger capacity and illustrative wait estimates.
- Added a `Ride now` / schedule control and two suggested pickup times. Selecting a suggestion selects that vehicle and fills the scheduled pickup time.
- Added a booking receipt showing the request ID, chosen vehicle, pickup time, and route. With the seeded vehicles occupied, requests are shown as queued.
- Removed the rider OTP, assigned-driver selection, manual assigned/pending status, corporate visit details, map-link inputs, and return-journey questions from the quick-book flow.
- Designed the rider page to stack on mobile and verified it at a phone-sized viewport without horizontal overflow.

## Running the Apps

Install root dependencies once with `npm install`. The rider app has its own dependencies; install them with `npm install --prefix user-app` if they are not present.

Run the frontends separately:

```sh
npm run dev:admin
npm run dev:user
```

The admin app runs at `http://localhost:5174`; the rider app runs at `http://localhost:5175`.

Build and lint commands:

```sh
npm run build
npm run lint
npm run build:user
npm run lint --prefix user-app
```

## Current Prototype Boundaries

- Admin authentication and both apps' booking data are local frontend demo state. Data is not persistent across reloads.
- The rider app is independent of the admin app. Rider submissions currently create a local receipt and do not appear in the admin queue.
- Connecting rider bookings to the admin queue requires a shared backend/API and persistent storage.
- Admin CSV export is a browser download. Google Sheets synchronization is not connected.
- Vehicle availability, car wait times, and suggested pickup windows are seeded demo values, not live dispatch or traffic calculations.
- The map is a visual preview; real maps, GPS locations, and real-time dispatch are not connected.
- The rider app has no production account or phone verification flow.

## Validation Completed

- Root admin: production build and Oxlint pass.
- Rider app: production build and Oxlint pass.
- Browser checks covered admin queue rendering, adding and dispatching demo requests, rider quick booking and receipt, suggested vehicle/time selection, and mobile-width overflow.
## Later Updates

- **Rider auth (`user-app/`):** sign up, sign in, forgot/change password, account page and sign out. Demo-only, stored in browser localStorage. Passwords need just 4+ characters for now.
- **Driver app (`driver-app/`) and `mock-api/`:** riders' bookings go to a local in-memory API; the driver for the chosen vehicle sees route, trip time and an Accept button, and the rider is notified on accept (polling every 2 seconds).
- **Folder restructure:** the admin dashboard moved from the repository root to `admin-dashboard/`; `user-frontend/` is now `user-app/` and `driver-frontend/` is `driver-app/`. Ports: admin 5174, rider 5175, driver 5180, API 4000. Run commands are in README.md; the older "Running the Apps" section above is superseded.
