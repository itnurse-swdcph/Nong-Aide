# Supabase Edge Functions — Nong-Aide

Production project: `aqhrfwqbroezrrcenyyb`

| Function | Status | Purpose |
|---|---|---|
| `cloth-stock` | ACTIVE | Cloth Stock master, count logs, tracking |
| `cloth-exchange` | ACTIVE | Cloth request/exchange workflow and stock requests |
| `sterile-exchange` | ACTIVE | Sterile material request/exchange workflow |
| `sterile-cancel` | ACTIVE | Sterile request cancellation |
| `equipment` | ACTIVE | Equipment operations |
| `equipment-api` | ACTIVE (v12) | Equipment API; automatic monthly 1–10 windows plus independent admin extra rounds |
| `ward-directory` | ACTIVE | Ward directory / admin authentication |

## Migration note

`cloth-stock` is now backed by Supabase tables `cloth_master`, `cloth_count_logs`, and `cloth_tracking`. The GitHub frontend `cloth-stock.html` now calls the Supabase Edge Function instead of the legacy Google Apps Script endpoint.

The legacy GAS files are intentionally retained as historical/rollback source until historical spreadsheet data is explicitly exported and verified against Supabase. They are no longer the frontend runtime backend for Cloth Stock.

## Security follow-up

The current legacy-compatible Edge Functions use `verify_jwt=false` so the existing GitHub Pages frontend can continue operating without an authentication migration. Before treating the system as security-complete, migrate user/admin authentication to Supabase Auth/JWT and enforce role/ward authorization server-side. Do not expose the service-role key in frontend code.


## Equipment inspection windows (2026-11-09)

- Automatic inspection window remains the 1st–10th of each month (Asia/Bangkok).
- Admin-created extra windows are stored separately in `equipment_inspection_extra_windows` and never replace the automatic schedule.
- Extra windows can be independently closed; existing monthly overrides were copied into the extra-window table.
- The equipment API defaults to the current Thai fiscal year (October–September).
