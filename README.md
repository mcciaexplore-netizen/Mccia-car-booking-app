# RideOps

Frontend-first prototype of a two-car ride operation. Three separate apps plus one small local API.

## Folder structure

```
Zoho-Car-Application/
├── admin-dashboard/   Fleet admin dashboard (operators)   http://localhost:5174
├── user-app/          Rider booking app + sign in/up      http://localhost:5175
├── driver-app/        Driver console: view & accept rides http://localhost:5180
├── backend/           Next.js API (auth + rides + fleet) http://localhost:4000/api
├── PROJECT_HISTORY.md Chronological change log
└── package.json       Root shortcuts that run the commands below
```

Each app is its own React + TypeScript + Vite project with its own `package.json` and `node_modules`.

## Run locally

```sh
npm run install:all   # once
npm run dev:api       # terminal 1: API (needed for rider <-> driver)
npm run dev:user      # terminal 2: rider app
npm run dev:driver    # terminal 3: driver app
npm run dev:admin     # terminal 4: admin dashboard
```

Also: `npm run build` and `npm run lint` check all three apps.

## How a ride flows

1. Rider books in `user-app` and picks a vehicle (Ertiga or Innova).
2. `backend` (Next.js) stores the request and serves all three apps.
3. The driver of that vehicle sees it in `driver-app` (route, trip time, Accept).
4. On Accept, `user-app` shows "<driver> accepted your ride".

## Prototype boundaries

- `backend` keeps data in `backend/data/*.json` locally, or in Postgres when `DATABASE_URL` is set (Vercel). Auth uses signed 7-day tokens (`AUTH_SECRET` required in production).
- The admin dashboard, rider app and driver app all read the same live data from `backend`.
- Trip times and vehicle wait times are illustrative estimates. No live maps, GPS, real-time dispatch or Google Sheets.

See [PROJECT_HISTORY.md](PROJECT_HISTORY.md) for details.
