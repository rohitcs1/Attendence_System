# API overview

All application endpoints are under `/api/v1`. Browser requests use a Supabase
access token as `Authorization: Bearer ...`. Device requests use
`X-Device-Id` and `X-Device-Credential`; the server resolves the registered
classroom and ignores any classroom identity supplied by the device.

- `GET /dashboard/summary` - role-authorized operational counters
- `GET /classrooms?page=1&pageSize=50` - paginated monitoring cards
- `POST /device/scans` - authenticated, idempotent RFID transition
- `POST /device/heartbeat` - authenticated health update

The scan RPC records invalid, duplicate, conflicting, and successful events.
A different teacher cannot close an active session. Offline devices do not
close sessions or create absence decisions.
