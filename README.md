# RideOps

Frontend-first prototype of a two-car ride operation. Three separate apps plus one small local API.

## Folder structure

```
Zoho-Car-Application/
├── admin-dashboard/   Fleet admin dashboard (operators)   http://localhost:5174
├── user-app/          Rider booking app + sign in/up      http://localhost:5175
├── driver-app/        Driver console: view & accept rides http://localhost:5180
├── backend/           Next.js API (auth + rides + fleet) http://localhost:4000/api
├── realtime/          Socket.io server: live driver GPS to the rider  http://localhost:4100
├── loadbalancer/      Zero-dependency load balancer (API + WebSocket)
├── deploy/ + docker-compose.yml   nginx load balancer + Docker images for production
├── scripts/cluster.mjs  Runs 2 API + 2 realtime replicas behind the balancer locally
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

Maps: the apps use MapLibre + OpenFreeMap (no API key). Routing is the public OSRM server and address search is Photon.
Set `VITE_FREE_MAPS=false` plus `VITE_GEOAPIFY_API_KEY` to use Geoapify instead.

### Run as a load-balanced cluster (local)

```sh
npm run build:api     # once, and after backend changes
npm run cluster       # 2 API (:4001, :4002) + 2 realtime (:4101, :4102) behind the balancer on :4000 / :4100
```

The apps keep using `localhost:4000/api` and `localhost:4100`. `http://localhost:4000/__lb/status` shows replica health;
the `X-Instance` response header shows which replica answered. API replicas share state through Postgres (`DATABASE_URL`);
the local file store also works but can race on simultaneous writes. Realtime replicas are chosen by ride id so a ride's
driver and rider always meet on the same replica.

## Production

`docker compose up --build` (needs Docker running and a `.env` from `deploy/.env.example`) starts nginx as the load balancer
in front of 2 API replicas, 2 realtime replicas and the three web apps (`admin.localhost`, `app.localhost`, `driver.localhost`).
Checklist: set `AUTH_SECRET`, `DATABASE_URL` (Postgres on Neon), `ALLOWED_ORIGINS` (your real https origins), SMTP for PIN email, and
serve everything over https. Known gap: `npm audit` still reports a postcss advisory inside Next.js (build-time only; the fix is Next 16).

## How a ride flows

1. A rider sends a **request** in `user-app`: pickup, destination, optional layover stops, and when (now, one date and time, or a multi-day range). Riders do not choose a car or driver.
2. The request lands in the admin **Queue**. The admin can **Approve** (choosing the car and the driver), **Hold** or **Cancel**. A car or driver already booked for an overlapping time is refused.
3. On approval the rider gets an in-app pop-up ("Request approved, driver assigned" with a table of car, driver and PIN) and an e-mail (when SMTP is set). The driver gets the passenger assigned.
4. Reminders go to both the rider and the driver 30 minutes before a scheduled start.
5. The driver taps "Start heading to pickup" (from 30 minutes before the start), verifies the rider's PIN, and ends the trip.

## Prototype boundaries

- `backend` keeps data in `backend/data/*.json` locally, or in Postgres when `DATABASE_URL` is set (Vercel). Auth uses signed 7-day tokens (`AUTH_SECRET` required in production).
- The admin dashboard, rider app and driver app all read the same live data from `backend`.
- Trip times and vehicle wait times are illustrative estimates. No live maps, GPS, real-time dispatch or Google Sheets.

See [PROJECT_HISTORY.md](PROJECT_HISTORY.md) for details.

## Deploying to Vercel (four projects, one repo)
Create four Vercel projects from this repo, each with a different Root Directory:
- `backend` (Next.js API) - env: `DATABASE_URL` (Neon Postgres), `AUTH_SECRET`, `ALLOWED_ORIGINS` (the three app URLs, comma separated), optional `SMTP_*`.
- `admin-dashboard`, `user-app`, `driver-app` (Vite) - env: `VITE_API_URL` = `https://<backend-url>/api`.
The `realtime` socket server needs a long-lived host (Docker/Render/Fly), not Vercel; set `VITE_REALTIME_URL` on user-app/driver-app to its URL.
