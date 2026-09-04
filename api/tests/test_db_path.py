import os
from pathlib import Path

import pytest

from app import db as dbmod


def test_explicit_database_path(tmp_path, monkeypatch):
    target = tmp_path / "nested" / "runnr.db"
    monkeypatch.setenv("DATABASE_PATH", str(target))
    monkeypatch.delenv("RAILWAY_VOLUME_MOUNT_PATH", raising=False)
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    assert dbmod._resolve_database_path() == str(target)
    assert target.parent.is_dir()


def test_railway_volume_mount_wins_over_data(tmp_path, monkeypatch):
    mount = tmp_path / "vol"
    mount.mkdir()
    monkeypatch.setenv("RAILWAY_VOLUME_MOUNT_PATH", str(mount))
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    monkeypatch.delenv("DATABASE_PATH", raising=False)
    path = dbmod._resolve_database_path()
    assert path == str(mount / "runnr.db")
    assert dbmod.path_is_persistent(path)


def test_railway_without_volume_does_not_create_ephemeral_data(monkeypatch):
    monkeypatch.delenv("DATABASE_PATH", raising=False)
    monkeypatch.delenv("RAILWAY_VOLUME_MOUNT_PATH", raising=False)
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    monkeypatch.setattr(dbmod, "_is_mount", lambda path: False)
    monkeypatch.setattr(os.path, "isdir", lambda path: False)
    with pytest.raises(RuntimeError, match="persistent Volume"):
        dbmod._resolve_database_path()


def test_local_dev_does_not_require_volume(monkeypatch):
    monkeypatch.delenv("DATABASE_PATH", raising=False)
    monkeypatch.delenv("RAILWAY_VOLUME_MOUNT_PATH", raising=False)
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    monkeypatch.delenv("RAILWAY_PROJECT_ID", raising=False)
    path = dbmod._resolve_database_path()
    assert path in {"/tmp/runnr.db", "/data/runnr.db"}


def test_railway_toml_requires_volume_and_ignores_frontend():
    text = Path(__file__).resolve().parents[1].joinpath("railway.toml").read_text(encoding="utf-8")
    assert 'requiredMountPath = "/data"' in text
    assert 'watchPatterns = ["/api/**"]' in text
    assert "overlapSeconds = 0" in text
    assert "numReplicas = 1" in text
    assert "Do not scale replicas" in text
