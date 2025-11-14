## Route: admin

- Base path: `/api/admin`
- Purpose: Protected endpoints for super admins and garage admins.
- Key behaviors:
  - `GET /api/admin/my-garages` – garages managed by the authenticated user (garage_admin or super_admin).
  - `GET /api/admin/garages/:id/dashboard` – dashboard for a specific garage (admin only).
  - `GET /api/admin/garages/:id/reports/pl` – P&L report (admin only).
  - `POST /api/admin/garage-admins` – assign a user as garage admin (super_admin only).
  - `GET /api/admin/garage-admins` – list assignments.
  - `GET /api/admin/garage-admins/:userId` – admin details and assignments.
  - `PUT /api/admin/garage-admins/:userId` – update admin user profile.
  - `PUT /api/admin/garage-admins/:userId/assignments/:garageId` – update permissions for an assignment.
- Auth:
  - Requires `x-user-id` header; role validation via `auth` helpers.
  - Super-admin can manage all; garage-admin limited to managed garages.
- Guidance:
  - Use `getManagedGarages`, `isGarageAdmin` for scoping data access.
  - Include `capacity` in garage responses when relevant.


