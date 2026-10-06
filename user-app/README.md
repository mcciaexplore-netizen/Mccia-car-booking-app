# RideOps Rider Frontend

Independent React frontend for riders. This subapp is intentionally separate from the fleet admin dashboard so it can later be adapted into a mobile application.

## Run locally

From the repository root:

```sh
npm run dev:user
```

Or from this folder:

```sh
npm install
npm run dev -- --port 5175
```

The rider app opens at `http://localhost:5175` by default when using the repository script.

## Prototype boundary

The quick-book form and booking receipt run locally in browser state. It asks only for rider name and phone, pickup, destination, vehicle, passenger count, and an optional pickup time. Vehicle availability is seeded demo data. Requests do not sync to the admin dashboard until a backend/API is implemented.
