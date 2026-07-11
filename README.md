# Online Attendance Management System

A full-stack MERN application for college attendance tracking with role-based
access (admin / faculty / student), **QR-code + geolocation** attendance marking,
realtime updates via Socket.io, and reporting dashboards.

> Attendance is verified by **QR token + geofence (GPS)** only.

## Stack

- **Backend**: Node.js (ES modules), Express, MongoDB (Mongoose), Socket.io, JWT auth (access + refresh), Zod validation
- **Frontend**: React 18 + Vite + Tailwind CSS, React Router v6, TanStack Query, React Hook Form, Socket.io client, html5-qrcode, Recharts
- **Realtime**: faculty see live attendance as students scan QR codes

## Project layout

```
attendance-system/
├── backend/      Express API + Socket.io + scripts (seed, smoke, integration tests)
├── frontend/     React SPA (Vite)
├── docker-compose.yml
└── README.md
```

## Features

- Role-based auth (access + refresh JWT), RBAC on every route
- Admin: manage users, courses, sessions, view reports & audit logs
- Faculty: create/start/end sessions, fetch class GPS location, show QR for students to scan, live attendance feed, reports
- Student: tap **"Get My Location"** to capture GPS, then scan the session QR (camera); attendance is recorded only if inside the geofence
- Geofence enforcement (attendance rejected if the student is outside the classroom radius)
- Realtime `attendance:marked` events pushed to the faculty's session room

### How a student marks attendance
1. Open **Mark Attendance** → tap **Get My Location** (grants GPS; coords auto-fill, with a manual fallback).
2. The QR scanner unlocks. Scan the faculty's on-screen QR.
3. Backend verifies: valid QR token **AND** device within `geofenceRadius` of the class location **AND** within the attendance window → marked `present` (or `late` if past `lateThreshold`).

## Quick start (local dev)

### 1. MongoDB
Have a MongoDB instance running on `mongodb://127.0.0.1:27017/attendance-system`
(or set `MONGODB_URI` in `backend/.env`).

### 2. Backend
```bash
cd backend
cp .env.example .env      # then edit secrets
npm install
npm run db:seed           # load demo data (admin/faculty/student accounts)
npm run dev               # http://localhost:5000
```
Demo accounts after seeding:

| Role    | Email                 | Password    |
|---------|-----------------------|-------------|
| Admin   | admin@college.edu     | Admin@1234  |
| Faculty | faculty1@college.edu  | Faculty@123 |
| Student | student1@college.edu  | Student@123 |

### 3. Frontend
```bash
cd frontend
npm install
npm run dev               # http://localhost:5173 (proxies /api -> :5000)
```

## Scripts

Backend (`backend/`):
```bash
npm run dev               # start with --watch
npm run test              # full test runner
npm run test:integration # QR + geofence + socket.io attendance flow (needs MongoDB)
npm run test:smoke       # smoke check against a running server
npm run lint             # eslint src/
npm run lint:fix         # eslint --fix
npm run format           # prettier --write src/
npm run db:seed          # load demo data
npm run db:reset         # drop + reseed
```

Frontend (`frontend/`):
```bash
npm run dev              # vite dev server (:5173)
npm run build            # production build
npm run lint             # eslint src/
npm run test             # vitest run
```

## Docker (one-command deploy)
```bash
cp .env.example .env     # set real secrets
docker compose up --build
```
- Frontend: http://localhost:8080 (nginx serves the SPA + proxies `/api` and `/socket.io` to the backend)
- Backend API: http://localhost:5000
- Mongo: included as a service (data persisted in the `mongo-data` volume)

Seed demo data inside the container:
```bash
docker compose exec backend npm run db:seed
```

## Environment variables (backend)
See `backend/.env.example`. Key ones: `MONGODB_URI`, `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `QR_CODE_SECRET`, `CLIENT_URL`. In Docker these are
supplied by `docker-compose.yml`.

## Known limitations
- Email sending (forgot/reset password) is stubbed.
- Avatar/file upload endpoint not wired.
- `npm run test:jest` uses an in-memory MongoDB and requires a local `mongod` binary.
