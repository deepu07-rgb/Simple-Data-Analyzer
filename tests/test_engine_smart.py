"""Unusual values (per group, robust) and monthly series, every row read; equal to pandas / numpy."""
import random

import numpy as np
import pandas as pd
import pytest

import engine as eng_mod


@pytest.fixture()
def eng():
    e = eng_mod.Engine()
    yield e
    e.close()


def _data(eng):
    r = random.Random(8)
    rows = []
    for i in range(3000):
        item = r.choice(["Sugar", "Tea", "Salt", "Rice"])
        base = {"Sugar": 45, "Tea": 420, "Salt": 23, "Rice": 90}[item]
        rate = round(base * (0.9 + 0.2 * r.random()), 2)
        if i in (10, 500, 2000):
            rate = round(rate * 6, 2)                                           # planted: far too high FOR THIS ITEM
        month = 1 + i % 12
        rows.append([item, str(rate), f"2024-{month:02d}-{1 + i % 27:02d}" if i % 50 else "", str(i % 40 * 100 + (500 if month in (11, 12) else 0))])
    return eng.load_rows(["Item", "Rate", "Date", "Amount"], rows, "o")["id"], rows


def test_outliers_equal_pandas_per_group(eng):
    i, rows = _data(eng)
    res = eng.outliers(i, 1, 0, k=3.5, limit=100)
    df = pd.DataFrame(rows, columns=["item", "rate", "date", "amt"]); df["rate"] = df.rate.astype(float)
    med = df.groupby("item").rate.transform("median"); mad = (df.rate - med).abs().groupby(df.item).transform("median")
    z = 0.6745 * (df.rate - med) / mad
    exp = df[(z.abs() > 3.5)]
    assert res["tested"] == len(df) and res["groups"] == 4
    assert res["flagged"] == len(exp)
    assert {r["rid"] for r in res["rows"]} == set(exp.index)
    top = res["rows"][0]
    assert abs(top["z"] - z.loc[top["rid"]]) < 1e-9 and top["cells"][0] == df.loc[top["rid"], "item"]
    assert {10, 500, 2000} <= {r["rid"] for r in res["rows"]}


def test_a_value_usual_for_tea_is_not_flagged_but_would_be_for_sugar(eng):
    i, rows = _data(eng)
    plain = eng.outliers(i, 1, None, k=3.5, limit=500)                          # the whole column: tea's usual rates look extreme next to sugar's
    grouped = eng.outliers(i, 1, 0, k=3.5, limit=500)
    assert plain["flagged"] > grouped["flagged"] * 5


def test_small_and_flat_groups_are_not_judged(eng):
    i = eng.load_rows(["g", "x"], [["a", str(v)] for v in (1, 2, 3)] + [["b", "5"]] * 20 + [["b", "900"]], "s")["id"]
    res = eng.outliers(i, 1, 0, min_group=8)
    assert res["tested"] == 0 and res["flagged"] == 0                           # a has 3 rows; b has no spread (MAD 0)


def test_monthly_series_equals_pandas_and_names_missing_months(eng):
    i, rows = _data(eng)
    res = eng.monthly_series(i, 2, 3, "sum")
    df = pd.DataFrame(rows, columns=["item", "rate", "date", "amt"]); df["amt"] = df.amt.astype(float)
    d2 = df[df.date != ""].copy(); d2["m"] = d2.date.str[:7]
    exp = d2.groupby("m").amt.sum()
    assert [s["month"] for s in res["series"]] == list(exp.index) and np.allclose([s["value"] for s in res["series"]], exp.values)
    assert res["undated"] == (df.date == "").sum() and res["missing"] == []
    j = eng.load_rows(["d", "v"], [["2024-01-05", "1"], ["2024-02-05", "2"], ["2024-05-09", "4"], ["15-06-2024", "8"]], "g")["id"]
    r2 = eng.monthly_series(j, 0, 1, "sum")
    assert [s["month"] for s in r2["series"]] == ["2024-01", "2024-02", "2024-05", "2024-06"] and r2["missing"] == ["2024-03", "2024-04"]
    assert eng.monthly_series(j, 0, 1, "avg")["series"][0]["value"] == 1 and eng.monthly_series(j, 0, None, "count")["series"][3]["value"] == 1
