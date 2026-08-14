# MVP visual system

**Status:** LOCKED — approved for implementation  
**Authority:** Subordinate to `docs/UI_UX.md` and higher canonical documents.  
**Scope:** Visual direction and presentation primitives for the MVP guest and admin experiences. Implementation-agnostic.

## 1. Visual direction

Use a quiet **memory-table** direction: warm paper surfaces, dark ink, and one coral signal color. Guest pages feel personal and immediate on a phone; admin pages feel like a clear working archive. A restrained ruled-line motif may separate chronology, never compete with media.

- One obvious next action per view; secondary actions stay plain.
- Warm surfaces, dark ink, coral only for action or confirmed state.
- Photos and voice controls carry visual weight; decoration stays peripheral.
- Sentence case, direct verbs, visible labels, short measures.
- Avoid neon palettes, glassmorphism, gradients behind text, dashboard chrome, autoplay audio, emoji icons, color-only status, and ornamental motion.

## 2. Layout, grid, container

| Context | Rule |
|---|---|
| Grid | 4px base unit; align edges and controls to 4px increments. |
| Guest | Single column; `100%` width; 20px horizontal inset below `sm`, 24px from `sm`. |
| Guest measure | `min(100%, 30rem)`; centered where viewport permits. |
| Admin | Header plus content; max-width `90rem`; at `lg`, 18rem context rail plus flexible timeline. |
| Timeline | Max-width `56rem`; search and status precede media. |
| Access/QR | Two columns at `lg`; stacked below `lg`. |
| Safe area | Sticky/fixed controls include `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`; content reserves equal space. |
| Reach | Guest primary action stays in lower flow or bottom action band; band has 16px side inset and 12px bottom clearance. No essential action at top-right edge. |
| Flow | One guest scroll region; reserve media and progress space to prevent layout jumps. |

## 3. Responsive behavior

Tailwind intent: base, `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px.

| Width | Guest | Admin |
|---|---|---|
| Base–`sm` | Single column, full-width controls, 16px body text, reachable primary action. | Stack header, search, status, timeline; move secondary actions into overflow when needed. |
| `sm` | 24px gutters; one column; photos may become two-up. | Two-column utility rows; side metadata on timeline items. |
| `md` | Capped measure; preserve reading order. | Horizontal header actions; fixed metadata column. |
| `lg` | Calm centered layout; no desktop-only feature. | Context rail plus timeline; QR beside URL. |
| `xl` | Do not widen text measure. | Increase whitespace, not density; retain 90rem cap. |

Landscape phones retain 16px text and visible primary action without horizontal scrolling. Never disable zoom.

## 4. Typography

Display: `Fraunces, Georgia, Cambria, "Times New Roman", serif`, for event titles and major headings only. Body/control: `DM Sans, ui-sans-serif, system-ui, sans-serif`. No vendor decision is required.

| Role | Size / line-height | Weight |
|---|---:|---:|
| Metadata | 12px / 16px | 500 |
| Helper, status detail | 14px / 20px | 400–600 |
| Body, fields | 16px / 24px | 400 |
| Card title | 18px / 28px | 600 |
| Section heading | 20px / 28px | 600 |
| Admin heading | 24px / 32px | 650 |
| Guest event title | 30px / 36px | 650 |
| Large desktop title | 36px / 40px | 650 |

Guest measure: 45–60 characters. Admin measure: 60–75. Use tabular figures for counters, timestamps, elapsed time. Avoid all-caps sentences; labels may use `0.04em` tracking.

## 5. Color and tokens

Light mode is the MVP theme. Dark mode is deferred. Extend existing shadcn/ui names; do not rename them.

| Token | Light value | Use |
|---|---|---|
| `--background` | `oklch(0.975 0.018 78)` | Paper page |
| `--foreground` | `oklch(0.205 0.025 50)` | Primary ink |
| `--card` / `--popover` | `oklch(0.995 0.009 85)` | Raised/floating surface |
| `--card-foreground` / `--popover-foreground` | `oklch(0.205 0.025 50)` | Surface text |
| `--primary` | `oklch(0.535 0.155 29)` | Coral action |
| `--primary-foreground` | `oklch(0.985 0.01 80)` | Text on action |
| `--secondary` | `oklch(0.925 0.035 78)` | Quiet control fill |
| `--secondary-foreground` | `oklch(0.245 0.03 50)` | Quiet control text |
| `--muted` | `oklch(0.945 0.025 78)` | Muted surface |
| `--muted-foreground` | `oklch(0.425 0.035 52)` | Supporting text |
| `--accent` | `oklch(0.91 0.055 45)` | Highlight surface |
| `--accent-foreground` | `oklch(0.245 0.03 50)` | Highlight text |
| `--destructive` | `oklch(0.52 0.18 25)` | Error/destructive |
| `--destructive-foreground` | `oklch(0.985 0.01 80)` | Text on destructive |
| `--border` / `--input` | `oklch(0.86 0.035 72)` | Dividers/fields |
| `--ring` | `oklch(0.535 0.155 29)` | Focus |

Additional tokens:

| Token | Value | Use |
|---|---|---|
| `--success` | `oklch(0.46 0.13 151)` | Confirmed persistence |
| `--success-foreground` | `oklch(0.985 0.01 80)` | Text on success |
| `--success-surface` | `oklch(0.91 0.055 151)` | Success surface |
| `--warning` | `oklch(0.49 0.13 70)` | Limit/attention signal |
| `--warning-foreground` | `oklch(0.22 0.03 60)` | Text on warning |
| `--warning-surface` | `oklch(0.93 0.065 78)` | Warning surface |
| `--recording` | `oklch(0.55 0.19 20)` | Active recording |
| `--recording-surface` | `oklch(0.93 0.06 25)` | Recording surface |
| `--scrim` | `oklch(0.18 0.02 50 / 0.56)` | Preview backdrop |
| `--shadow-color` | `oklch(0.25 0.03 50 / 0.16)` | Shadow tint |

Contrast targets: primary ink on background `12.1:1`; supporting text on background `5.0:1`; primary-foreground on primary `4.7:1`; success, destructive, and warning text pairs at least `4.5:1`; communicating borders at least `3.0:1` against adjacent surfaces.

## 6. Spacing

Base unit 4px. Scale: `4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px, 64px`.

- Label-to-control: 8px. Field stack: 16px. Error offset: 4px.
- Related controls: 8px. Unrelated groups: 24px.
- Card padding: 16px mobile, 24px from `sm`.
- Sections: 32px guest, 40px admin. Major transitions: 48px.
- Adjacent touch targets: at least 8px apart.

## 7. Radius and elevation

`--radius` remains the anchor at `0.625rem` (10px). Use 6px fields/compact controls, 10px cards/buttons, 14px media panels, 999px status pills only.

| Level | Shadow | Use |
|---|---|---|
| 0 | none | Page, dividers, timeline |
| 1 | `0 1px 2px var(--shadow-color)` | Cards, media tiles |
| 2 | `0 8px 24px var(--shadow-color)` | Preview, floating feedback |
| 3 | `0 16px 40px var(--shadow-color)` | Modal/sheet only |

One elevation level per surface. Prefer border plus Level 1. No glow or stacked shadows.

## 8. Buttons, inputs, feedback surfaces

Primary is coral filled; secondary is warm filled; outline is low emphasis; destructive is visually separated. Visible text labels are required. Guest primary height 48px; admin controls 44px; icon hit areas 44px; gaps 8px.

States: default, hover with no layout change, active with 1px inset emphasis, focus-visible with 3px `--ring` outline and 2px offset, disabled at 0.45 opacity with no action, loading with preserved width, disabled activation, inline progress, and status text.

Fields use a visible label, optional helper, then error. Height: 48px guest, 44px admin. Invalid fields use border plus icon/text, never red alone. Preserve name and search text during recoverable failures.

- Inline field error: immediately below field; cause plus correction; alert semantics after submit.
- Status/alert: bordered surface near the action; icon plus plain message plus recovery action; polite status for progress, alert for failure.
- Progress: determinate per-item upload progress; indeterminate bounded loader for retrieval; reserve height.
- Empty state: plain explanation plus available next action; never a blank panel.
- Errors from `UI_UX.md` §6 use the same surface anatomy; recovery follows the contract.

## 9. Guest mobile shell

Use a paper page frame with event title at the top, a compact context line below, and the active task in one stacked content column. Pre-session shows title, optional name, and Start; no submission affordance appears before successful Start. Post-Start places the camera viewfinder as the dominant element, with the shutter in the lower thumb zone, a remaining-photo indicator near the shutter, a pending photo strip of captured-but-unsent and server-confirmed items, a Send action for batch synchronization, and a voice-note action as a separate secondary control. Server-returned usage is reflected in the remaining-photo indicator and voice-note state.

Reserve height for the viewfinder, pending strip, and sync progress to prevent layout jumps. Loading uses reserved skeleton blocks. Camera permission denied/unsupported shows a file-selection fallback surface. Closed, limit, session-invalid/expired, offline, rate-limited, and unexpected states use the status/alert surface and disable only affected actions as a hint. On session expiry, pending captures remain visible marked as not saved; a Start prompt is shown. Do not decide expiry wording or retention messaging here. Sync progress stays inside the photo block; per-item and aggregate progress use reserved height; success updates per-item status and the remaining indicator without layout jumps.

## 10. Admin shell

Sign-in uses a narrow centered frame, explicit email/password labels, one primary sign-in action, and an authentication status region below the form. Loading/submitting preserves the frame; failed, rate-limited, offline, and unexpected states keep fields and provide deliberate recovery.

Dashboard uses a compact header with event title, status, close action while active, and access/QR action. Search sits above the newest-first timeline. At `lg`, use a context rail and main timeline; below `lg`, stack them.

Each timeline item contains media type, guest label (`Anonymous Guest` when unnamed), timestamp, media surface, and applicable preview/playback/download action. Loading uses bounded skeleton items. Empty event explains that no submissions exist. Empty search result retains the query and offers clear/edit. Closed status remains visible; history remains readable. Not found/forbidden, preview/playback loading/failure, download/failure, closing, and offline states use nearby status surfaces without private links.

Event creation uses the same field anatomy. Success shows title, status, public URL, and access/QR action. `ACTIVE_EVENT_EXISTS` points to the existing event. Invalid, submitting, authentication, rate-limit, network, and unexpected states remain in the creation frame.

Access/QR uses a URL block and bounded QR block with copy and print actions. Loading is reserved; copy success is local feedback; print in progress/unavailable and access failure use status surfaces. Never show signed media URLs.

## 11. Media and recording surfaces

Photo capture uses a camera-first viewfinder surface (`getUserMedia` live preview, `playsInline`, `muted`, `autoPlay`, `object-fit: cover`). Permission request precedes the browser prompt. Denied/unsupported state keeps a file-selection fallback when available; the pending strip, remaining indicator, and Send action remain available for any captures already taken. The shutter button sits in the lower thumb zone, 48px+ height, `env(safe-area-inset-bottom)` clearance, with capture feedback (flash overlay). A camera switch toggle is shown only when `enumerateDevices` reports two or more cameras.

A pending photo strip shows horizontal scrollable thumbnails (~48px) of captured-but-unsent and server-confirmed items. Each thumbnail carries a per-item status indicator: `pending`, `uploading` (spinner), `confirmed` (check), `error` (error icon + code), or `expired` (not saved). Tapping a pending thumbnail opens a full-size review overlay with delete and retake controls (Level 2 elevation, `--scrim` backdrop, `1:1` thumbnail ratio, `4:3` preview where source allows, `object-fit: cover`). Confirmed items cannot be deleted — no delete endpoint exists. The remaining-photo indicator uses tabular figures and `aria-live` polite, placed near the shutter.

Batch synchronization (Send) shows aggregate progress with per-item fidelity: each thumbnail transitions through spinner → check (201 confirmed) or error icon (rejected). On sync complete, a summary of accepted and rejected items is shown. `RATE_LIMITED` (429) pauses the queue and honors `Retry-After`. `PHOTO_LIMIT_REACHED` (409) marks the item as error and frees the local budget. `SESSION_EXPIRED` or `SESSION_INVALID` (401) discards session authority; pending items remain visible marked as not saved. `EVENT_CLOSED` (422) marks the item as error with no retry.

On session expiry, pending captures remain visible and are marked as not saved. A Start prompt is shown. If the guest starts a new session, an explicit carry-over prompt offers to add unsent captures to the new session's budget. Carry-over requires explicit user action — it is never automatic.

Audio playback is a bordered horizontal surface with play/pause text label, duration, progress track, and download/action where applicable. Recorder surface uses `--recording-surface`, a visible “Recording” label, non-color indicator, stop control, and tabular elapsed time. Under 5 seconds shows “Too short” plus continued-recording guidance; 30 seconds transitions to review after auto-stop. These are hints, not proof of acceptance. Review shows playback, duration, submit, and re-record. Permission, unsupported, submitting, success, and error use the same status anatomy.

## 12. Motion

Use 150–200ms for hover/focus/press, 200–300ms for surfaces entering, and 120–180ms for exits. Use ease-out entering and ease-in exiting. Animate opacity and transform only; reserve layout space before transitions.

Allowed: one purposeful reveal of the active task, progress value changes, and confirmation crossfades. Do not animate errors, recording indicators, counters, or server-authoritative status in a way that delays understanding. Never block input or use decorative looping motion. With reduced motion, remove transforms and nonessential transitions; retain immediate state, progress, and announcements.

## 13. Accessibility constraints

- Normal text contrast: minimum 4.5:1. Large text: minimum 3:1. Essential controls and focus indicators: minimum 3:1 against adjacent surfaces.
- Focus-visible: 3px `--ring` outline plus 2px offset; never remove it.
- Touch targets: minimum 44×44px; minimum 8px separation; guest primary control 48px high.
- Status uses text and icon/shape in addition to color. Recording uses label plus indicator; limits use text and count.
- Loading, permission, capture/recording, upload, success, and failure use appropriate status/alert announcements.
- Labels remain visible; focus order follows task order; dynamic text wraps without clipping.
- Visual affordances never override server limits, ownership, event status, validation, authentication, or persistence. Never expose credentials, cookies, database IDs, storage keys, or signed URLs.

## 14. State coverage

Every guest pre-session, post-Start, photo, and voice state in `docs/UI_UX.md` §4; every sign-in, dashboard, creation, and access/QR state in §5; every §6 error code; and every §7 feedback/timing rule has a treatment above. No listed state lacks visual treatment.
