# Security Specification: GatherGrid Virtual Office (Milestone 2)

## 1. Data Invariants

1. **Identity & RBAC Non-Escalation**:
   - Newly created user profiles default to `role: "employee"` and `status: "active"`.
   - Regular employees can NEVER modify their own `role` or `status` field, nor another user's profile.
   - Admin rights are verified through presence in the `/databases/$(database)/documents/admins/$(request.auth.uid)` collection or the bootstrapped runtime admin email (`landverseauto@gmail.com`).
2. **Office Map Publishing & Integrity**:
   - Only verified Admins can create, modify, delete, or publish documents in `officeMaps/{mapId}`.
   - Non-admin employees can ONLY read maps that have `status == 'published'`.
   - Map drafts are accessible only to Admins.
   - Map documents must contain valid schema fields (`id`, `name`, `schemaVersion`, `mapVersion`, `status`, `mapData`).
3. **Platform & HQ Weather Configuration**:
   - `platformConfig/general` and `platformConfig/hqWeather` can be read by all authenticated employees.
   - Only verified Admins can create or update platform configuration and HQ weather parameters.
   - Latitude must be between -90 and 90, Longitude between -180 and 180, and refresh interval must be positive.
4. **Default Deny**:
   - All unspecified collections and paths are strictly blocked from read and write.

---

## 2. The "Dirty Dozen" Threat Payloads

| Payload ID | Target Path | Attempted Attack | Expected Result |
| :--- | :--- | :--- | :--- |
| `DD-01` | `/users/victim_123` | Unauthenticated write attempting to create user profile without auth token | `PERMISSION_DENIED` |
| `DD-02` | `/users/emp_456` | Self-Privilege Escalation: Employee attempts to set `role: "admin"` on registration | `PERMISSION_DENIED` |
| `DD-03` | `/users/emp_456` | Profile Hijack: Employee attempts to update existing user profile `role` from `"employee"` to `"admin"` | `PERMISSION_DENIED` |
| `DD-04` | `/users/other_user` | Impersonation: Employee `emp_456` attempts to overwrite `other_user`'s profile | `PERMISSION_DENIED` |
| `DD-05` | `/admins/emp_456` | Self-Promotion: Employee attempts to write self into `/admins/` whitelist | `PERMISSION_DENIED` |
| `DD-06` | `/officeMaps/map_secret_draft` | Draft Snooping: Employee attempts to `get` an unpublished draft map | `PERMISSION_DENIED` |
| `DD-07` | `/officeMaps/main_office` | Unauthorized Map Publish: Employee attempts to update `status` to `'published'` or edit tiles | `PERMISSION_DENIED` |
| `DD-08` | `/officeMaps/main_office` | Map Vandalism: Unauthenticated visitor attempts to delete an office map | `PERMISSION_DENIED` |
| `DD-09` | `/platformConfig/general` | Config Tampering: Employee attempts to switch `activeMapId` to a corrupted map ID | `PERMISSION_DENIED` |
| `DD-10` | `/platformConfig/hqWeather` | Weather Spoofing: Employee attempts to change HQ coordinates or disable weather | `PERMISSION_DENIED` |
| `DD-11` | `/platformConfig/hqWeather` | Value Poisoning: Admin attempts to input invalid coordinates (lat: 999.0) | `PERMISSION_DENIED` |
| `DD-12` | `/unknownCollection/payload` | Ghost Collection Attack: Attempting write to undeclared collection | `PERMISSION_DENIED` |

---

## 3. Test Runner Design

Unit tests verify that every dirty dozen payload is blocked with `PERMISSION_DENIED` while authorized operations (Admin saving maps, Employee reading published maps, User updating own avatar) succeed.
