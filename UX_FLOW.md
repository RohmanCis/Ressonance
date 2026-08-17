# UX Flow — Manual QA Guide

A walkthrough of every guest and admin screen for testing on localhost, written for the event owner. Follow it top to bottom; each numbered step is a screen with what you should see, what you can do, and what happens next.

**Getting a guest link:** sign in as admin → open your active event → **Access / QR** → copy the link (or scan the QR with a phone). Each test run works best in a fresh incognito/private window, because the guest session and its photo/voice/message allowance live in the browser.

---

## Part A — Guest flow

### A1. Open the event link
| What happens | What you see |
|---|---|
| Loading | Skeleton placeholder; buttons unavailable until the event loads |
| Event found (active) | Event title, "Guest entry" label, optional **Your name** field, **Start** button |
| Event closed | Title + "Event closed — remains viewable, but new submissions are not accepted"; name field and Start are disabled |
| Link wrong / event deleted | "Event unavailable — This event cannot be found." No actions offered |
| Page failed to load | "Event unavailable" with a **Try again** button (reloads the page) |

The name is optional. Helper text under it: "Your name applies to submissions in this session." Leave it blank to appear as **Anonymous Guest** in the admin view.

### A2. Press Start
- **Starting…** — button disabled, status text shown; pressing again does nothing.
- **Success** → you move to the frame screen (A3).
- **Invalid name** (over 100 characters or contains control characters) — "Check your name" panel; your text is kept and editable; correct it and Start again.
- **Temporarily unavailable** (too many starts in a short period) — message tells you to wait, with the retry interval when known.
- **Offline** — "Starting did not complete"; name kept; retry when connected.
- **Any other failure** — "The session could not start. Your name was kept. Try again."

### A3. Choose a frame
After a successful Start you always land here, before the camera opens.

- Three frame cards (Wedding Floral, Wedding Classic, Party). Every card is a **9:16 preview** showing the frame artwork undistorted. Tap to select (✓ badge appears); arrow keys also move the selection.
- The main button reads **Use [frame name]** once something is selected, or **Continue without frame** when nothing is selected.
- **"No Frame" is never a card in the grid.** It is reachable two ways: the **Skip — no frame** link (appears only once a frame is selected) or the **Continue without frame** button (when nothing is selected). Both lead to the same place.
- Any choice → brief "Confirming your session usage…" → capture screen (A4).
- The chosen frame is printed onto your photos as you take them; skipping means plain photos. Refreshing the page at this point loses the choice and returns you to the Start screen.
- The current artwork is placeholder art: the contract is the 9:16 (1080×1920) shape with a transparent photo area, so designs can be swapped later without code changes.

### A4. Take photos
The camera is the main element. Above it: event title and "Guest: [name or Anonymous Guest]".

**Camera permission**
- "Starting camera…" placeholder, then the browser asks for camera access.
- **Denied** → "Camera access was not granted. You can still choose a photo below." The **Choose a photo** file picker always remains available.
- **Not supported** (no camera / unsupported browser) → similar card; file picker remains.
- On phones with two cameras a **↻ switch camera** button appears; photos taken with the front camera are mirrored.

**Taking photos**
- The viewfinder is **9:16** — what you see is what the photo will be. Every camera photo is saved as a **1080×1920** picture: the camera image is center-cropped to fit, so the result is the same size and shape on every device. When a frame is active it is drawn on top of the photo exactly as previewed — never mirrored (front-camera photos themselves are mirrored, matching the preview), never stretched.
- Big round shutter at the bottom. Each tap adds a photo to the pending strip — nothing is uploaded yet.
- "**N photos remaining**" counter = 5 minus saved minus unsent. At 0 the shutter and file picker disable (hint only; the server is the real referee).
- Tap any thumbnail → review overlay: full preview, its status (**Not sent yet / Sending… / Saved / Not saved / Not saved — session expired**), and **Back / Retake / Delete**. Retake and Delete exist only for unsent photos; **saved photos cannot be deleted**.
- Photos from the **Choose a photo** file picker are sent as-is — intentionally without a frame and not resized to 9:16.

**Sending**
- **Send N photo(s)** appears when there is at least one unsent photo; disabled while sending.
- Photos go one by one: thumbnail shows spinner → ✓ (saved) or ! (failed, with a small retry arrow).
- When finished: "N photos saved. M could not be saved."
- Per-item failures: a failed photo does not stop the others, except **photo limit reached** and **event closed**, which stop the rest of the batch. "Too many requests" pauses sending for the stated wait, then continues automatically. Network failure marks that photo failed — use the retry arrow.

**Limit reached** — "Photo limit reached for this guest session." Shutter and picker disable; voice note and message stay available.

### A5. Record a voice note
Separate card, independent of photos. One per session, 5–30 seconds.

1. **Idle** — "Record one voice note, 5–30 seconds…" + **Record**.
2. Permission — the browser asks for microphone access after you press Record. **Denied** → "Microphone access was not granted…"; **unsupported browser** → "Voice recording is not supported here…". Nothing is submitted.
3. **Recording** — "Recording" label, running timer, **Stop recording**. Recording stops by itself at 30 seconds.
4. **Review** — playback player, duration, **Submit voice note** / **Re-record**. Stopping under 5 seconds shows **"Too short"** with guidance — you can still attempt Submit, but the server will reject anything outside 5–30 seconds.
5. **Saving** — "Saving…" with upload percentage; buttons disabled.
6. **Saved** — "Voice note saved." The card then shows the limit message ("Voice-note limit reached…") and cannot be used again this session.
7. **Errors** — clear message per cause: unsupported format, too large, must be 5–30 seconds, could not be verified, limit already reached, event closed, too many requests, or not confirmed as saved (retry).

### A6. Leave a message
"Pesan & kesan (optional)" card. One message per session, up to 280 characters.

- Text box with a live **n/280** counter; typing is capped at 280. **Send message** is disabled while empty, while closed, once the limit is used, or while sending.
- **Sending** — "Sending…" and "Sending your message…".
- **Sent** — "Message sent." The card stays in this state for the rest of the session.
- **Errors** — message cannot be empty / must be 280 characters or fewer / already submitted / event closed / check your message / too many requests / could not be saved. Typing after an error clears it and lets you correct the text.
- The message is independent: it is never required and works with or without photos and a voice note.

### A7. Your session panel and expiry
The "Your session" card always shows: **Photos remaining X/5**, **Voice note Available/Already added**, **Message Available/Sent**.

- Sessions last **30 minutes** from Start. In the final 5 minutes a warning appears: "Your session ends in N minute(s). Send your photos to save them."
- **After expiry** (e.g. waiting out the 30 minutes): you are returned to the Start screen with "Your session has expired. N photo(s) were not saved. Press Start to begin again." Unsent photos survive only on that screen — reloading the page discards them.
- **Carry-over:** with unsent photos present, a panel shows their thumbnails and the Start button reads **"Start and add unsaved photos"**. Starting again → frame choice → the carried photos return as unsent items counting against the new session's 5. **Discard unsaved photos** throws them away. Carry-over is never automatic.

### A8. Event closed while you are in a session
"Event closed — Your session remains viewable, but new submissions are not accepted." Shutter, picker, Send, Record, and Send message are all disabled; anything already saved stays visible.

---

## Part B — Admin flow

### B1. Sign in (`/admin/sign-in`)
- Email and password (both required) + **Sign in**.
- Success → event index. Wrong credentials → "Those credentials were not accepted." Also possible: sign-in required, too many requests, appear offline, service error — each with its own message and the form kept.

### B2. Event index (`/admin`)
Opening `/admin` while signed out redirects to sign-in.

- **Active event** card at the top: title, opened date, **Open** and **Access / QR**.
- **Past events** list: title, opened/closed dates, "Closed" badge, **Open**.
- **Create new event** button top-right.
- No events yet → empty state with **Create event**.
- Load failure → error panel with **Retry**; expired admin session → redirected to sign-in.

### B3. Create event
- Title (required) + **Create event** → redirects to the new event's dashboard.
- **Only one active event allowed** — creating while one is active fails with "An active event already exists. Open it instead." plus a **Find existing event** link back to the index.
- Other failures keep the form and offer safe retry.

### B4. Event dashboard
Left: title, **Active/Closed** pill, **Access / QR** link, and **Close event** (only while active; shows "Closing…" and updates the pill after confirmation). Right: submissions.

- **Timeline** — newest first, grouped per guest: name, item count, breakdown (photos · voice notes · messages), and time range. Groups collapse/expand. Guests with the same name get "Session 2", "Session 3" labels.
- **Photos** — grid of thumbnails; click → large preview with **Download** and **Close** (Esc also closes). Broken media → per-item **Retry**.
- **Voice notes** — play/pause button, progress bar, duration, **Download**.
- **Messages** — read-only text cards with name and time; no download (messages have no file).
- **Search by guest name** — type + **Search**; results stay newest first. No matches → "No matching submissions" with **Clear search**. Empty event → "No submissions yet."
- **Download** — per item; failures show an inline message with **Retry**.

### B5. Access / QR
- **Back to event** link; **Public URL** with **Copy link** (button flips to "Copied" and confirms).
- **Print** menu with two one-page options: **Print QR only** and **Print access card** (framed, with guest instruction) — opens the browser print dialog.
- QR preview card on the right; load failure → "This access card is unavailable." with **Retry**.

---

## Part C — Edge-case checklist

| Case | How to reach | Expected |
|---|---|---|
| Camera denied | Deny the browser prompt (or block it) | Fallback card + file picker still usable; nothing submitted |
| Audio too short | Record 2–3 s, stop, submit | Review shows "Too short"; server rejects with the 5–30 s message |
| Audio over 30 s | Keep recording | Auto-stops at 30 s; longer cannot be submitted |
| Message too long | Paste a long text | Typing capped at 280 with live counter; Send stays disabled when empty |
| Session expired | Wait 30 min (or clear the site cookie), then Send | Expiry message, unsent photos offered for carry-over or discard, fresh quota after Start |
| Event closed (guest) | Close the event in the admin, reload the guest link | Page viewable, Start disabled |
| Event closed mid-session | Close the event while the guest screen is open | Submission controls disable; saved items stay visible |
| Photo limit | Capture and send 5 photos | Counter hits 0, shutter disables; voice/message still usable |
| Voice/message limit | Submit one of each | Cards lock to "Already added" / "Message sent." |
| No frame / skip | On the frame screen | No card for "No Frame"; use "Continue without frame" (nothing selected) or "Skip — no frame" (after selecting) |
| Wrong guest link | Edit the URL with a junk ID | "Event unavailable — This event cannot be found." |
| Signed-out admin | Open `/admin` after the admin session ends | Redirect to sign-in |
