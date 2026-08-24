import os
import tempfile

_db = tempfile.NamedTemporaryFile(prefix="runnr-stats-test-", suffix=".db", delete=False)
os.environ["DATABASE_PATH"] = _db.name
_db.close()
