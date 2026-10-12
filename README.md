# CivicPulse

CivicPulse is a responsive civic issue reporting and prioritization application built with React, TypeScript, Tailwind CSS, Leaflet/OpenStreetMap, and Supabase.

## Run the frontend

Requirements: Node.js 20.19+ or 22.12+.

```powershell
npm install
npm run dev
```

Without Supabase credentials, CivicPulse opens in **DEMO DATA** mode. The dashboard and map show clearly identified, illustrative sample reports around Indore, Madhya Pradesh. Reports created in this mode exist only in the current browser session; they are not saved, shared with a city, or real civic records. Authentication and admin changes are unavailable in demo mode.

## Connect Supabase

1. Create a Supabase project.
2. Open the project's **SQL Editor** and run [`supabase/migrations/20261012000000_civicpulse.sql`](./supabase/migrations/20261012000000_civicpulse.sql).
3. Copy [`.env.example`](./.env.example) to `.env.local`. Set `VITE_SUPABASE_URL` to the project URL and `VITE_SUPABASE_ANON_KEY` to the project's publishable/anon key.
4. Restart the Vite dev server after changing environment variables.
5. In Supabase Authentication settings, configure the site URL and allowed redirect URLs for the environments you use. Configure email confirmation to match your deployment's sign-in flow.
6. Register through CivicPulse. The database trigger creates each profile with the `citizen` role.
7. To grant administrator access, use the Supabase SQL Editor as a trusted project operator, replacing the email with the verified account you intend to promote:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (
     select id
     from auth.users
     where email = 'trusted-admin@example.com'
   );
   ```

   Verify that exactly one profile was updated. Never add role selection to public registration; only a trusted project operator should grant admin access.

Only the Supabase project URL and publishable/anon key belong in the Vite client configuration. **Never put a Supabase service-role key or other secret in a `VITE_*` variable or browser code.** The client uses the authenticated user's session and Row Level Security; administrator mutations are additionally checked by the database RPC.

## Features

- Citizen registration and sign-in through Supabase Auth, with a database-created citizen profile.
- Report submission with a title, description, category, severity, street/location label, map-picked coordinates, and an optional image.
- Complaint status, report details, resolution notes, and an activity timeline.
- Admin-only status changes, resolution recording, and duplicate linking.
- Responsive dashboard, OpenStreetMap map, category/status/severity filters, location search, geographic hotspots, and accessible dialogs/forms.
- Publicly visible report feed; row-level policies require ownership for a citizen's private activity and an administrator role for all mutation workflows.
- Photos are stored in a public-read bucket and may be uploaded/deleted only under the authenticated user's own storage folder. The database validates file size and MIME type.

## Transparent triage assistance

Priority scores are an explainable triage aid, not an automated decision or a claim of generative-AI analysis. The base score is 20 for Low, 42 for Medium, 68 for High, and 88 for Critical severity. Two points are added per full waiting day, capped at 32 additional points; the final score is capped at 100. City staff remain responsible for decisions.

Possible duplicates are suggested when open reports in the same category are within 250 metres, or when their titles share at least 45% of their distinct significant words. This is a lightweight similarity heuristic, not a definitive determination. An administrator must review and explicitly link a duplicate.

## Validation

```powershell
npm run build
npm run lint
```

`npm run build` performs the TypeScript project check and production Vite build. After configuring Supabase, also verify registration/email confirmation, sign-in/sign-out, photo upload, complaint submission, per-user report tracking, admin promotion and denial for a citizen, status/resolution updates, and duplicate linking in the Supabase project used for testing.
