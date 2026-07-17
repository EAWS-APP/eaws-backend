# EAWS Backend API

This repository contains the Node.js/Express backend for the Emergency Alert and Warning System (EAWS).

## Architecture

This backend serves as a protected API layer in front of our Supabase PostgreSQL database. 

**Authentication:** 
The Mobile App and Web Dashboard must handle user authentication directly using the `supabase-js` or Flutter Supabase SDKs. 
For every request made to this Express API, you must attach the Supabase user's JWT token in the Authorization header:
`Authorization: Bearer <SUPABASE_ACCESS_TOKEN>`

## API Endpoints

### Incidents (`/api/incidents`)
*   `GET /feed` - Fetch verified incidents (accepts query params: `category`, `severity`, `sort`)
*   `GET /live` - Fetch all active/verified incidents (for Live Map)
*   `GET /my-reports` - Fetch incidents reported by the authenticated user
*   `POST /` - General incident reporting
*   `PATCH /:id` - Generic incident update
*   `DELETE /:id` - Delete a user's own incident
*   `PATCH /:id/triage` - (Admin/Dispatcher) Triage an incident
*   `POST /:id/dispatch` - (Admin/Dispatcher) Dispatch an agency to an incident

### SOS (`/api/incidents/sos`)
*   `POST /` - Trigger an immediate SOS alert
*   `POST /:id/cancel` - Cancel a triggered SOS (within 10-second window)

### Community (`/api/community/incidents`)
*   `POST /:id/comments` - Add a comment to an incident (`content` required)
*   `POST /:id/reactions` - React to an incident (`reaction_type`: like, alarmed, concerned)

### Agencies & Dispatch (`/api/`)
*   `GET /units/live` - Fetch active agency units (patrol cars, ambulances)
*   `GET /agencies/:agencyType/assignments` - Fetch dispatch assignments for an agency
*   `POST /responses/:id/acknowledge` - Acknowledge a dispatch response
*   `PATCH /responses/:id/status` - Update dispatch status (arrived, contained, etc.)

## Database Note
The backend relies heavily on Supabase PostGIS for distance calculations. Make sure `database_setup.sql` has been executed in the Supabase SQL editor to enable these features.

## Phase 3 Role-Based Integration

The current dashboard/mobile integration roadmap is documented in:

`docs/role-based-integration-roadmap.md`

Run this SQL in Supabase before implementing role-based routing and agency dashboards:

`sql/phase3_roles_dispatch_schema.sql`
