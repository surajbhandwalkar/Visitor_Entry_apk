# Visitor Gate System

Visitor approval system for a security gate:

- Watchman signs in and registers a visitor from the Android app.
- Company help-desk and configured approvers receive an email with Approve/Reject links.
- The dashboard shows pending requests and monthly entry records.
- Access is granted at the gate only after approval.

## Setup

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor.
3. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASSWORD`, `APPROVER_EMAILS` and `APPROVAL_BASE_URL` as
   Supabase Edge Function secrets.
4. Deploy `supabase/functions/visitor-notification` and
   `supabase/functions/visitor-decision`.
5. Put the project URL and anonymous key in the mobile and dashboard `.env` files.
6. Run `npm install`, then `npm run mobile` or `npm run dashboard`.

The database stores visitor name, phone, company, host, purpose, entry time,
decision time, approver and gate access time. Never put the Supabase service
role key in either client application.
