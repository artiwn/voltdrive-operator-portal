# VoltDrive Operator Portal — Step 11 Operator Settings

Static desktop prototype for the VoltDrive network operator role.

## Current implementation

1. Network Operations Dashboard
2. Sites
3. Chargers
4. Charging Sessions
5. Reservations
6. Maintenance Alerts
7. Energy Status
8. Revenue & Payment Operations
9. Customer Support
10. Emergency Controls
11. Operator Settings

## Operator Settings module

The Settings workspace includes:

- operator profile, role label, contact details, language and timezone;
- shift hours, on-call state, service region, escalation team and handoff note;
- notification preferences for safety, maintenance, energy, support SLA, payments and roaming;
- reservation defaults for grace period, extension step and cancellation cutoff;
- maintenance SLA defaults by severity and recurrence threshold;
- energy defaults for peak reduction, headroom, warning/critical thresholds and battery reserve;
- locked safety policies for critical confirmation, active-session restart protection and cable-release protection;
- interface density, landing page, live badges and device/session preferences;
- settings-only JSON export and safe reset without deleting operational state.

Several preferences are wired into existing prototype workflows: operator identity is used throughout the audit trail, new operator reservations use reservation defaults, new manual maintenance alerts use configured SLA values, and Energy Peak Protection uses the configured default reduction.

All prototype state persists in `localStorage` under `voltdrive_operator_v1`. Step 10 state migrates automatically; clearing browser storage is not required.

## Run

Open `index.html` or `dashboard.html` with a local static server. No build step is required.

## Stability rules preserved

- shared `.ui-pill` alignment guard remains active;
- square status/action icons use dedicated grid centering;
- drawer backdrops are non-interactive while closed;
- custom scrollbars remain scoped to actual scroll containers;
- old/incomplete state records are normalized before rendering;
- event binding uses safe element lookup patterns.
