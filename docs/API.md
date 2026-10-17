# API overview

All application endpoints are under `/api/v1`. The browser communicates only
with the Node.js backend. The backend performs Supabase Auth operations and
returns a short-lived access token; browser requests then use that token as
`Authorization: Bearer ...`. Device requests use
`X-Device-Id` and `X-Device-Credential`; the server resolves the registered 
classroom and ignores any classroom identity supplied by the device.

- `POST /auth/login` - backend-mediated administrator login
- `POST /auth/forgot-password` - backend-mediated password reset request
- `GET /auth/me` - current administrator profile
- `GET /dashboard/summary` - role-authorized operational counters
- `GET /classrooms?page=1&pageSize=50` - paginated monitoring cards
- `POST /device/scans` - authenticated, idempotent RFID transition
- `POST /device/heartbeat` - authenticated health update

The scan RPC records invalid, duplicate, conflicting, and successful events.
A different teacher cannot close an active session. Offline devices do not
close sessions or create absence decisions.
