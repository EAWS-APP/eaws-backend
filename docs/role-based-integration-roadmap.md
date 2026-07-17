# EAWS Role-Based Integration Roadmap

## Purpose

This roadmap aligns the mobile citizen app, web dashboards, Express API, and Supabase/PostgreSQL schema so reports created by citizens flow into the correct operational dashboards for triage and response.

## Current Findings

### Mobile App

Masters has added the main citizen-facing workflows:

- Citizen authentication through Supabase Auth.
- SOS flow with emergency category selection:
  - Medical Aid
  - Police / Threat
  - Fire Rescue
  - Natural Disaster
- Community incident reporting with category, title, description, location, anonymity, media, reactions, and comments.
- Live/public alert reads from Supabase `alerts`.
- Safe-zone/shelter reads from Supabase `safe_zones`.
- Rich SOS UI with dispatch simulation, responder ETA, and response history.

The mobile app should remain the citizen entry point. Citizens create incidents, view public alerts, find safe zones, track their own reports, and interact with the community feed.

### Web Dashboard

Oko's dashboard currently has:

- Portal-style login UI for Dispatcher, Police, Fire, and Admin.
- Dispatcher live map page.
- Shared `PortalDashboard` component used by Police, Fire, and Admin.
- Static/mock stats, assignment queues, and actions.

The dashboard needs a real role resolver so users do not manually choose their destination. After login, the system should determine whether the user is a dispatcher, police officer, ambulance operator, fire operator, NADMO operator, admin, or citizen.

### Backend

The backend already protects API calls with Supabase JWT bearer tokens. It has routes for incidents, community interactions, responses, alerts, and agencies.

Important mismatches to fix:

- Mobile reaction helper sends `{ "type": "like" }`, while backend expects `{ "reaction_type": "like" }`.
- Mobile API client currently points to `http://localhost:3000/api`; backend should be `http://localhost:5000/api` for local Express.
- Some SOS/mobile fields use `category`, `title`, `location_name`, `user_id`; older backend paths still expect `emergency_type`, `address`, `reporter_id`.
- Web API helpers expect raw arrays in places, while backend often returns wrapped objects like `{ success, incidents }`.

## Role Model

Use a `public.profiles` table linked to `auth.users`, rather than adding columns directly to Supabase `auth.users`.

Recommended roles:

- `citizen`
- `dispatcher`
- `police`
- `ambulance`
- `fire`
- `nadmo`
- `admin`
- `super_admin`

Recommended profile fields:

- `user_id`
- `full_name`
- `phone_number`
- `ghana_card`
- `user_role`
- `operator_code`
- `agency_type`
- `agency_id`
- `unit_id`
- `is_approved`
- `is_active`

## Login And Routing Flow

1. User logs in through Supabase Auth.
2. Frontend extracts the Supabase session access token.
3. Frontend calls:

```http
GET /api/me
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

4. Backend returns profile and permissions:

```json
{
  "user": {
    "id": "auth-user-id",
    "email": "pol-0021@eaws.gov.gh"
  },
  "profile": {
    "user_role": "police",
    "operator_code": "POL-0021",
    "agency_type": "police",
    "is_approved": true,
    "is_active": true
  },
  "permissions": [
    "view_assigned_incidents",
    "acknowledge_assignment",
    "update_response_status"
  ]
}
```

5. Web dashboard redirects:

- `dispatcher` -> `/dashboard`
- `police` -> `/police`
- `ambulance` -> `/ambulance`
- `fire` -> `/fire`
- `nadmo` -> `/nadmo`
- `admin` or `super_admin` -> `/admin`

Citizens should generally use the mobile app, not the web operations dashboard.

## Citizen Report To Dashboard Flow

1. Citizen submits an incident or SOS from mobile.
2. Incident row is created with:
   - `category`
   - `title`
   - `description`
   - `latitude`
   - `longitude`
   - `location_name`
   - `reporter_id`
   - `is_anonymous`
   - `severity = PENDING TRIAGE`
   - `status = pending`
3. Dispatcher dashboard sees pending incidents.
4. Dispatcher triages:
   - verify or reject
   - set severity
   - merge duplicate if needed
   - assign one or more agencies
   - publish public alert if needed
5. Agency dashboards see only their assigned incidents.
6. Agency updates assignment status.
7. Citizen app can show report status updates.

## Dashboard Responsibilities

### Citizen Mobile App

- Register/login with Supabase Auth.
- Submit SOS.
- Submit incident reports.
- Upload incident media.
- View public/community feed.
- Comment and react.
- View public alerts.
- View safe zones.
- Track own reports and SOS history.

### Dispatcher / Control Room

- View all pending incidents.
- View live map.
- Verify/reject reports.
- Set severity and incident type.
- Detect and merge duplicates.
- Assign agencies.
- Publish public alerts.
- Monitor active agency response.

### Police Dashboard

- View police-assigned incidents only.
- Acknowledge assignment.
- Mark en route, arrived, scene secured, resolved.
- Request backup.
- Add operational notes.
- Handle threats, crime, crowd control, welfare checks, traffic incidents.

### Ambulance Dashboard

- View ambulance-assigned incidents only.
- Acknowledge medical dispatch.
- Mark en route, arrived, patient contacted, patient transported, hospital handoff, resolved.
- See permitted medical profile fields when authorized.
- Request police/fire backup when needed.
- Track ETA and ambulance readiness.

### Fire Dashboard

- View fire/rescue assignments only.
- Dispatch engine.
- Request water tender.
- Mark en route, arrived, contained, rescue complete, resolved.

### NADMO Dashboard

- View disaster and evacuation incidents.
- Manage shelters/safe zones.
- Coordinate multi-agency response.
- Publish regional public alerts.
- Track evacuation status.

### Admin Dashboard

- Manage users and operators.
- Approve agency accounts.
- Assign roles and agency units.
- Manage agencies and units.
- View audit logs.
- View analytics and exports.

## Implementation Sequence

### Phase 1: Role Foundation

- Run `sql/phase3_roles_dispatch_schema.sql` in Supabase.
- Add `/api/me` route to Express.
- Add `requireRole(...)` and `requireAnyRole(...)` middleware.
- Seed operator profiles for Dispatcher, Police, Ambulance, Fire, NADMO, and Admin.

### Phase 2: Contract Cleanup

- Standardize incident fields around:
  - `category`
  - `title`
  - `description`
  - `location_name`
  - `reporter_id`
  - `status`
  - `severity`
- Fix mobile reaction payload to send `reaction_type`.
- Fix mobile API base URL to use backend port `5000` or device-specific URL.
- Make web API helpers unwrap backend responses consistently.

### Phase 3: Dispatcher Assignment Flow

- Dispatcher verifies incident.
- Dispatcher creates `incident_assignments`.
- Assignment appears in agency dashboard.
- All assignment changes write to `response_status_events` and `audit_logs`.

### Phase 4: Police And Ambulance Dashboards

- Add `/ambulance` dashboard route.
- Upgrade `/police` dashboard to live assignments.
- Add status action buttons.
- Add notes, backup request, and ETA/readiness fields.

### Phase 5: Public Alerts And Safe Zones

- Admin/NADMO/Dispatcher can create alerts.
- Mobile reads active alerts from Supabase.
- Admin/NADMO manages safe zones.
- Mobile reads open safe zones from Supabase.

## Immediate Next Build Recommendation

Start with:

1. Run the SQL schema script.
2. Add `/api/me`.
3. Update web login to route by `profile.user_role`.
4. Add `/ambulance`.
5. Convert `/police` and `/ambulance` to read assigned incidents from the backend.

