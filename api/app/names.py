"""First-name sanitiser for terminal titles (e.g. John's terminal)."""

from __future__ import annotations

import re

_STRIP = re.compile(r"[^\w\s\-']+", re.UNICODE)
_DIGITS_UNDERSCORE = re.compile(r"[0-9_]+")
_WORD = re.compile(r"^[\s\-']+$")


def normalize_first_name(raw: str | None, *, max_len: int = 24) -> str | None:
    if not raw:
        return None
    s = " ".join(str(raw).strip().split())
    s = _STRIP.sub("", s)
    s = _DIGITS_UNDERSCORE.sub("", s)
    s = s[:max_len].strip(" -'")
    if not s:
        return None
    parts = re.split(r"([\s\-']+)", s)
    out = []
    for part in parts:
        if not part or _WORD.match(part):
            out.append(part)
            continue
        out.append(part[0].upper() + part[1:] if len(part) > 1 else part.upper())
    name = "".join(out).strip()
    return name or None
