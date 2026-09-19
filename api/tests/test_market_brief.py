from app.market_brief import _CACHE, _BRIEF_REFRESH, build_market_brief, price_bucket


def test_price_bucket_groups_small_ticks():
    assert price_bucket(100) == price_bucket(104) == "100"
    assert price_bucket(88.74) == price_bucket(88.8) == "89"
    assert price_bucket(95.48) == "95"
    assert price_bucket(None) == ""
    assert price_bucket("nope") == ""


def test_brief_cache_invalidates_when_price_moves(monkeypatch):
    _CACHE.clear()
    _BRIEF_REFRESH.clear()
    calls = []

    def fake_headlines(symbol, limit=5):
        return [{"title": f"{symbol} holds the open", "publisher": "T", "link": ""}]

    def fake_ai(symbol, headlines, **kwargs):
        calls.append(kwargs.get("price"))
        return f"{symbol} now {kwargs.get('price')}", None

    monkeypatch.setattr("app.market_brief.fetch_headlines", fake_headlines)
    monkeypatch.setattr("app.market_brief._openai_remark", fake_ai)

    first = build_market_brief("GDX", direction="long", entry=88.74, price=88.74)
    second = build_market_brief("GDX", direction="long", entry=88.74, price=88.8)
    moved = build_market_brief("GDX", direction="long", entry=88.74, price=95.48)

    assert first["remark"] == "GDX now 88.74"
    assert second["_runnr"]["cache"] == "hit"
    assert moved["_runnr"]["cache"] == "miss"
    assert moved["remark"] == "GDX now 95.48"
    assert moved["price"] == 95.48
    assert calls == [88.74, 95.48]
