# Media

## TODO (parent / Janis)

Drop the ~90s 1080p voiced walkthrough onto this folder as:

```
media/runnr-how-it-works.mp4
```

Source filename is expected to look like `runnr-how-it-works-vo.mp4` (~1.6MB). The signed-in intro player loads `/media/runnr-how-it-works.mp4` (then `/media/runnr-how-it-works-vo.mp4` as a fallback).

Do **not** use `tmp-reply-video/` (old spy-ad). Do **not** put this clip on the public logged-out homepage.

GitHub Pages copies this directory from `.github/workflows/pages.yml`.
