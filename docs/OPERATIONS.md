# Operations and security

Create Supabase Auth users, then create matching `profiles` rows with the
smallest required role. Apply migrations in order. Keep the service-role key
only in the backend secret store. Restrict `ALLOWED_ORIGINS` to deployed UI
origins and put the API behind HTTPS.

## First administrator

Apply all migrations, then run the one-time provisioning command from
`backend/` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, and `ADMIN_NAME` supplied in the process environment:

```powershell
$env:ADMIN_EMAIL="admin@example.edu"
$env:ADMIN_PASSWORD="<unique generated password>"
$env:ADMIN_NAME="SmartClass Administrator"
npm run provision-admin
```

The command creates or locates the Supabase Auth user and upserts its `profiles`
row with the `admin` role. There is no public administrator registration route.
Remove the provisioning-only variables after completion.

Device heartbeats are authoritative only for connectivity. A device is
considered online by the monitoring view when its last heartbeat is within
three minutes. A stale device displays its last successful update and does not
change the green/red classroom session state.

UID-only RFID identification is suitable for this prototype but is clonable.
For production, consider cryptographic cards and a secure element/device
credential store. CSV exports and audit logs must remain role-protected.
