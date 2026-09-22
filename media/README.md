# Media

## In-product intro (email wall)

`media/runnr-intro-email-wall.mp4` (~39.5s, British VO, candy linger) plays **before** the SAMPLE keep-score email wall. Poster: `media/runnr-intro-email-wall.jpg`.

This clip replaces the old parked signed-in homepage walkthrough. It is **not** for Instagram/TikTok. Homepage autoplay stays off (`RunnrIntro.ENABLED=false`).

The four-beat chip tour (if present) stays optional via `?tour=1` — do not force chips + video on the first email wall. **Watch how Runnr works** plays the intro soft-gate, then lands on live Sizer / Beat 1 — not the keep-score wall. Replay video alone with `?intro=1`. Do not put Watch on the keep-score wall.

Fallback: `/media/runnr-how-it-works.mp4`.

Do **not** use `tmp-reply-video/` (old spy-ad). Do **not** put this clip on the public logged-out homepage hook.

GitHub Pages copies this directory from `.github/workflows/pages.yml`.
