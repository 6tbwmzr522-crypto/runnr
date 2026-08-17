#!/usr/bin/env python3
"""
Runnr Reddit Scout — SAFE DIGEST ONLY

Finds retail traders venting about discipline failures.
Writes a ranked Markdown digest for YOU to review and reply by hand.

HARD RULES (enforced in code):
  - Never posts comments
  - Never sends DMs
  - Never reads/writes the inbox
  - Read-only Reddit credentials (no username/password required)

Setup:
  1. Create a Reddit app (script): https://www.reddit.com/prefs/apps
  2. pip install praw
  3. export REDDIT_CLIENT_ID=... REDDIT_CLIENT_SECRET=...
  4. python3 scripts/runnr_reddit_scout.py

Optional:
  --limit 80     posts per listing per sub
  --top 25       max targets in digest
  --out PATH     digest output path

Digest lands in digests/ by default (gitignored pattern recommended).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import praw
except ImportError:
    print("Install praw:  pip install praw", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Empathy / discipline pain — not "how do I get rich"
PAIN_KEYWORDS = [
    "blew up",
    "blew my account",
    "blew up my account",
    "stopped out",
    "got stopped out",
    "emotional trading",
    "traded emotionally",
    "can't stick to",
    "cant stick to",
    "cannot stick to",
    "broke my rules",
    "broke my rule",
    "didn't follow my plan",
    "didnt follow my plan",
    "no discipline",
    "lack of discipline",
    "overtraded",
    "over trading",
    "over-trading",
    "revenge trading",
    "revenge trade",
    "fomo",
    "fear of missing out",
    "huge loss",
    "massive loss",
    "big loss",
    "red day",
    "red week",
    "red month",
    "gave back profits",
    "gave back gains",
    "bleeding money",
    "margin call",
    "should have stuck to",
    "should have followed",
    "too greedy",
    "no patience",
    "journaling",
    "track my trades",
    "trade journal",
]

# Safe starting set — no WSB / povertyfinance (predatory optics)
TARGET_SUBREDDITS = [
    "Daytrading",
    "RealDayTrading",
    "Forex",
    "ForexTraders",
    "options",
    "stocks",
    "StockMarket",
    "algotrading",
]

MIN_SCORE = 2
MIN_COMMENTS = 1
MAX_AGE_HOURS = 48

# Landing for YOUR manual replies — /report not shipped yet
RUNNR_URL = os.environ.get("RUNNR_LANDING_URL", "https://runnr.fyi/report/")

ROOT = Path(__file__).resolve().parents[1]
STATE_DIR = Path(os.environ.get("RUNNR_SCOUT_DIR", Path.home() / ".runnr_scout"))
STATE_FILE = STATE_DIR / "seen.json"
DEFAULT_DIGEST_DIR = ROOT / "digests"

# Optional draft lines — printed for copy-paste only; never posted by this script
DRAFT_REPLIES = [
    "I feel this. I stopped tracking P&L alone and started scoring stop/size discipline on every trade — that exposed the real leaks. If useful, happy to share how I score them.",
    "The strategy usually isn’t the killer — execution is. A simple discipline score (stop kept? size ok? plan followed?) changed how I review weeks. Curious if you journal by rules or only by P&L?",
    "Been there on revenge trading. Logging ‘broke my own rule’ vs ‘market got me’ separately was the unlock. Free tool at runnr.fyi if you want a structured log — no pressure.",
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def load_seen() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {"post_ids": {}, "updated": None}


def save_seen(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state["updated"] = utc_now().isoformat()
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def get_reddit() -> praw.Reddit:
    client_id = os.environ.get("REDDIT_CLIENT_ID", "").strip()
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET", "").strip()
    user_agent = os.environ.get(
        "REDDIT_USER_AGENT",
        "RunnrScoutDigest/1.0 (read-only; by ThinIceDigital)",
    ).strip()
    if not client_id or not client_secret:
        raise SystemExit(
            "Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET "
            "(read-only app from https://www.reddit.com/prefs/apps)."
        )
    # No username/password → cannot post or DM even if someone tries later
    return praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        user_agent=user_agent,
    )


def matched_keywords(text: str) -> list[str]:
    hits = []
    for kw in PAIN_KEYWORDS:
        if kw in text:
            hits.append(kw)
    return hits


def score_post(title: str, body: str, score: int, comments: int, age_hours: float, hits: list[str]) -> int:
    s = len(hits) * 10
    s += min(score, 50)
    s += min(comments, 20) * 2
    if age_hours < 6:
        s += 20
    elif age_hours < 24:
        s += 10
    blob = f"{title} {body}".lower()
    if any(x in blob for x in ("$", "%", "pnl", "p/l", "profit", "loss")):
        s += 15
    return s


def pick_draft(username: str) -> str:
    # Stable pick per user for consistent tone if you re-open the digest
    idx = sum(ord(c) for c in username) % len(DRAFT_REPLIES)
    draft = DRAFT_REPLIES[idx]
    if "runnr.fyi" not in draft.lower():
        draft = f"{draft}\n\n(Optional link when it fits: {RUNNR_URL})"
    return draft


def find_targets(reddit: praw.Reddit, limit: int) -> list[dict]:
    targets: list[dict] = []
    per_listing = max(10, limit // 3)

    for sub_name in TARGET_SUBREDDITS:
        try:
            sub = reddit.subreddit(sub_name)
            print(f"  scanning r/{sub_name}…")
            streams = [
                sub.hot(limit=per_listing),
                sub.new(limit=per_listing),
                sub.top(time_filter="day", limit=per_listing),
            ]
            for listing in streams:
                for post in listing:
                    created = datetime.fromtimestamp(post.created_utc, tz=timezone.utc)
                    age_hours = (utc_now() - created).total_seconds() / 3600
                    if age_hours > MAX_AGE_HOURS:
                        continue
                    if post.score < MIN_SCORE or post.num_comments < MIN_COMMENTS:
                        continue
                    author = post.author.name if post.author else None
                    if not author:
                        continue
                    title = post.title or ""
                    body = post.selftext or ""
                    text = f"{title} {body}".lower()
                    hits = matched_keywords(text)
                    if not hits:
                        continue
                    # Skip obvious “looking for signal seller / guru” bait for now
                    if re.search(r"\b(signal service|copy trade|prop firm challenge pass)\b", text):
                        continue
                    targets.append(
                        {
                            "username": author,
                            "subreddit": sub_name,
                            "title": title.strip(),
                            "text": body.strip()[:400],
                            "url": f"https://www.reddit.com{post.permalink}",
                            "score": int(post.score),
                            "comments": int(post.num_comments),
                            "age_hours": round(age_hours, 1),
                            "keywords": hits[:8],
                            "target_score": score_post(
                                title, body, int(post.score), int(post.num_comments), age_hours, hits
                            ),
                            "post_id": post.id,
                            "created": created.isoformat(),
                        }
                    )
        except Exception as e:
            print(f"  ! r/{sub_name}: {e}", file=sys.stderr)

    # One best post per author
    best: dict[str, dict] = {}
    for t in targets:
        u = t["username"]
        if u not in best or t["target_score"] > best[u]["target_score"]:
            best[u] = t
    return sorted(best.values(), key=lambda x: x["target_score"], reverse=True)


def render_digest(targets: list[dict], scanned_at: datetime) -> str:
    lines = [
        f"# Runnr Reddit Scout Digest",
        "",
        f"**Generated:** {scanned_at.strftime('%Y-%m-%d %H:%M UTC')}  ",
        f"**Mode:** read-only scout — no posts, no DMs  ",
        f"**Landing for manual replies:** {RUNNR_URL}",
        "",
        "## How to use",
        "",
        "1. Open the thread and read the full context.",
        "2. Reply **as yourself** only if you can be genuinely helpful.",
        "3. Prefer the draft below; edit so it fits the thread.",
        "4. Do not mass-paste the same promo in every sub.",
        "",
        "---",
        "",
    ]
    if not targets:
        lines.append("_No matching targets this run._")
        return "\n".join(lines)

    for i, t in enumerate(targets, 1):
        draft = pick_draft(t["username"])
        lines.extend(
            [
                f"## {i}. u/{t['username']} — r/{t['subreddit']} (score {t['target_score']})",
                "",
                f"- **Post:** [{t['title']}]({t['url']})",
                f"- **Engagement:** {t['score']} upvotes · {t['comments']} comments · {t['age_hours']}h old",
                f"- **Pain hits:** {', '.join(t['keywords'])}",
                "",
                "### Excerpt",
                "",
                f"> {(t['text'] or '_link/title only_').replace(chr(10), '  ')}",
                "",
                "### Draft reply (copy-paste — not sent)",
                "",
                draft,
                "",
                "---",
                "",
            ]
        )
    lines.append(f"_End of digest · {len(targets)} targets_")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Runnr Reddit scout — digest only")
    parser.add_argument("--limit", type=int, default=90, help="Approx posts pulled per sub")
    parser.add_argument("--top", type=int, default=25, help="Max targets in digest")
    parser.add_argument("--out", type=Path, default=None, help="Output markdown path")
    parser.add_argument(
        "--include-seen",
        action="store_true",
        help="Do not filter previously digested post IDs",
    )
    args = parser.parse_args()

    print("Runnr Reddit Scout — SAFE DIGEST (no post / no DM)")
    reddit = get_reddit()
    # Sanity: read-only client has no write scopes in practice without password
    print(f"Read-only client ready · subs: {len(TARGET_SUBREDDITS)}")

    seen = load_seen()
    seen_ids = set(seen.get("post_ids", {}).keys())

    targets = find_targets(reddit, limit=args.limit)
    if not args.include_seen:
        targets = [t for t in targets if t["post_id"] not in seen_ids]

    targets = targets[: args.top]
    scanned_at = utc_now()

    DEFAULT_DIGEST_DIR.mkdir(parents=True, exist_ok=True)
    out = args.out or DEFAULT_DIGEST_DIR / f"reddit_scout_{scanned_at.strftime('%Y%m%d_%H%M')}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_digest(targets, scanned_at), encoding="utf-8")

    # Mark seen so tomorrow’s digest is fresh
    for t in targets:
        seen.setdefault("post_ids", {})[t["post_id"]] = {
            "username": t["username"],
            "subreddit": t["subreddit"],
            "seen_at": scanned_at.isoformat(),
            "url": t["url"],
        }
    # Prune ids older than 45 days
    cutoff = scanned_at - timedelta(days=45)
    pruned = {}
    for pid, meta in seen.get("post_ids", {}).items():
        try:
            ts = datetime.fromisoformat(meta["seen_at"])
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts >= cutoff:
                pruned[pid] = meta
        except (KeyError, ValueError, TypeError):
            continue
    seen["post_ids"] = pruned
    save_seen(seen)

    print(f"\nDigest: {out}")
    print(f"Targets: {len(targets)}")
    for i, t in enumerate(targets[:5], 1):
        print(f"  {i}. u/{t['username']} r/{t['subreddit']} [{t['target_score']}] {t['title'][:56]}")
    if len(targets) > 5:
        print(f"  … +{len(targets) - 5} more in file")
    print("\nRemember: reply by hand. This script cannot and will not post.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
