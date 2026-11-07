"""Fair comparison of a yes/no outcome in the engine: 'how often Late = Yes' as 100 / 0, equal to statsmodels (HC3) and pandas."""
import random

import pytest

import engine as eng_mod


@pytest.fixture()
def eng():
    e = eng_mod.Engine()
    yield e
    e.close()


def _data(eng, n=4000):
    r = random.Random(21)
    rows = []
    for _ in range(n):
        inc = r.choice(["Low", "Low", "Mid", "Mid", "High"])
        own = "Yes" if r.random() < {"Low": .25, "Mid": .5, "High": .8}[inc] else "No"
        p = {"Low": .22, "Mid": .12, "High": .05}[inc] - (.015 if own == "Yes" else 0)
        late = "Yes" if r.random() < p else ("No" if r.random() < .97 else "")        # a few blank outcomes
        rows.append([late, own, inc, str(round(r.uniform(20, 70), 1))])
    return eng.load_rows(["Late", "Owner", "Income", "Age"], rows, "y")["id"], rows


def test_cells_are_percent_and_leave_blank_outcomes_out(eng):
    i, rows = _data(eng)
    res = eng.fair_cells(i, 0, 1, [2], yspec={"is": "Yes", "scale": 100})
    known = [r for r in rows if r[0] != ""]
    assert res["matched"] == len(known)
    assert sum(c["n"] for c in res["cells"]) == len(known)
    assert abs(sum(c["sy"] for c in res["cells"]) - 100 * sum(r[0] == "Yes" for r in known)) < 1e-6
    assert abs(sum(c["syy"] for c in res["cells"]) - 10000 * sum(r[0] == "Yes" for r in known)) < 1e-4


def test_linear_fit_equals_statsmodels(eng):
    sm = pytest.importorskip("statsmodels.formula.api")
    import pandas as pd
    i, rows = _data(eng)
    res = eng.fair_linear(i, 0, 1, [2], [3], ref="No", yspec={"is": "Yes", "scale": 100})
    df = pd.DataFrame([r for r in rows if r[0] != ""], columns=["late", "own", "inc", "age"]).astype({"age": float})
    df["y"] = (df.late == "Yes") * 100.0
    m = sm.ols("y ~ C(own, Treatment('No')) + C(inc, Treatment('High')) + age", df).fit(cov_type="HC3")
    k = "C(own, Treatment('No'))[T.Yes]"
    assert abs(res["levels"]["Yes"][0] - m.params[k]) < 1e-7 and abs(res["levels"]["Yes"][1] - m.bse[k]) < 1e-7
    assert abs(res["r2"] - m.rsquared) < 1e-9 and res["n"] == len(df)
