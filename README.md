# SmartClass

SmartClass is an IoT-based smart classroom monitoring system for centralized
college operations. It combines a React/Vite administration console, a
TypeScript Express API, Supabase PostgreSQL, and ESP8266 classroom devices.

## Repository layout

- `frontend/` - React, TypeScript, Tailwind, Recharts administration console
- `backend/` - Express API and RFID/device services
- `database/` - Supabase migrations and seed data
- `firmware/smartclass_esp8266/` - Arduino ESP8266 firmware
- `firmware/docs/` - wiring and flashing guide
- `docs/` - API, security, and operations notes
- `scripts/` - local development helpers

## Quick start

1. Install Node.js 20+, npm, Arduino IDE 2.x, and a Supabase project.
2. Apply `database/migrations/001_initial_schema.sql`, then
   `database/migrations/002_security_and_rpc.sql`, `003_admin_teacher_rfid.sql`,
   `004_classroom_management.sql`, `005_rfid_timestamp_safety.sql`, and
   `006_rfid_timestamp_text_safety.sql`
   in Supabase SQL Editor.
3. Copy `backend/.env.example` to `backend/.env` and set the Supabase URL,
   anon key, service-role key, JWT secret, frontend URL, and allowed origins.
4. Copy `frontend/.env.example` to `frontend/.env` and set only the backend
   API URL. The frontend never receives Supabase credentials.
5. Run `npm install` in both `backend` and `frontend`.
6. Start the API with `npm run dev` in `backend`, and the UI with `npm run dev`
   in `frontend`.

The service-role key is server-only. It must never be placed in the frontend or
firmware. Device credentials are provisioned individually and are revocable.

## Classroom status rule

Classroom cards have exactly two status colors: green means a valid active
teacher session exists, and red means no valid active teacher session exists.
Device connectivity is displayed independently. An offline device never closes
an active session or proves teacher absence.

## Validation

Run `npm test`, `npm run typecheck`, and `npm run build` in each application.
Physical ESP8266, RC522, OLED, and network behavior must be validated on the
actual selected board; it is not claimed as tested by this repository.

See [docs/OPERATIONS.md](docs/OPERATIONS.md), [docs/API.md](docs/API.md), and
[firmware/docs/WIRING.md](firmware/docs/WIRING.md) for deployment details.
