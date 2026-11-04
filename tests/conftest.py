import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="session")
def client():
    import app as stellura

    stellura.app.config["TESTING"] = True
    with stellura.app.test_client() as c:
        yield c
