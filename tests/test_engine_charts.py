"""Chart queries answered inside DuckDB: results must equal what plain Python computes from the same rows."""
import datetime as dt
import random
import statistics
from collections import defaultdict

import numpy as np
import pytest

import engine as eng_mod


@pytest.fixture()
def eng():
    e = eng_mod.Engine(memory_limit="500MB")
    yield e
    e.close()


DISTRICTS = ["Jaipur", "jaipur", "JAIPUR ", "Jodhpur", "Kota", "Ajmer", "Bikaner", "Alwar", "Udaipur", "Sikar", "Churu"]
STATUS = ["Pending", "Disposed", "Under inquiry"]


def make_rows(n=6000, seed=11):
    r = random.Random(seed)
    rows, truth = [], []
    for i in range(n):
        d = r.choice(DISTRICTS + ["", "Kota", "Kota"])
        amt = None if r.random() < 0.03 else round(r.uniform(500, 90000), 2)
        age = r.randint(18, 70)
        day = dt.date(2023, 4, 1) + dt.timedelta(days=r.randint(0, 700))
        fmt = r.choice(["iso", "dmy", "slash", "dev"])
        txt = {"iso": day.isoformat(), "dmy": day.strftime("%d-%m-%Y"), "slash": day.strftime("%d/%m/%Y"),
               "dev": day.strftime("%d-%m-%Y").translate(str.maketrans("0123456789", "०१२३४५६७८९"))}[fmt]
        if r.random() < 0.02:
            txt, day = "not a date", None
        rows.append([d, r.choice(STATUS), "" if amt is None else (f"{amt:,.2f}" if r.random() < 0.3 else str(amt)), str(age), txt])
        truth.append({"d": d.strip().lower() or "(blank)", "label": d.strip() or "(blank)", "s": rows[-1][1], "amt": amt, "age": age, "day": day})
    return rows, truth


@pytest.fixture()
def ds(eng):
    rows, truth = make_rows()
    info = eng.load_rows(["Dist", "Status", "Amount", "Age", "Date"], rows, "t")
    return eng, info["id"], truth


def agg(eng, i, **kw):
    kw.setdefault("measures", [{"col": 2, "fn": "sum"}])
    return eng.chart_agg(i, **kw)


def test_group_totals_match_python_and_ignore_capitals(ds):
    eng, i, truth = ds
    res = agg(eng, i, x=0, max_cats=100)
    want = defaultdict(float)
    cnt = defaultdict(int)
    for t in truth:
        want[t["d"]] += t["amt"] or 0
        cnt[t["d"]] += 1
    got = {r[0].strip().lower(): r[1] for r in res["rows"]}
    assert set(got) == set(want) and "(blank)" in got
    for k in want:
        assert got[k] == pytest.approx(want[k], rel=1e-9), k
    assert res["matched"] == len(truth)
    counts = {r[0].strip().lower(): r[1] for r in agg(eng, i, x=0, measures=[{"col": -1, "fn": "count"}])["rows"]}
    assert counts == cnt


def test_every_function_matches(ds):
    eng, i, truth = ds
    fns = ["sum", "avg", "min", "max", "median", "count", "distinct"]
    res = eng.chart_agg(i, x=1, measures=[{"col": 2, "fn": f} for f in fns[:6]])["rows"]
    for row in res:
        vals = [t["amt"] for t in truth if t["s"] == row[0] and t["amt"] is not None]
        rows_n = len([t for t in truth if t["s"] == row[0]])
        exp = [sum(vals), sum(vals) / len(vals), min(vals), max(vals), statistics.median(vals), rows_n]
        for got, want in zip(row[1:], exp):
            assert got == pytest.approx(want, rel=1e-9)
    dist = eng.chart_agg(i, x=1, measures=[{"col": 3, "fn": "distinct"}])["rows"]
    for row in dist:
        assert row[1] == len({t["age"] for t in truth if t["s"] == row[0]})


def test_split_and_others_are_exact(ds):
    eng, i, truth = ds
    res = agg(eng, i, x=0, g=1, measures=[{"col": 2, "fn": "avg"}], max_cats=4, max_groups=3)
    xs = {r[0] for r in res["rows"]}
    assert "(Others)" in xs and len(xs) <= 5
    keep = {r[0].strip().lower() for r in res["rows"] if r[0] != "(Others)"}
    for r in res["rows"]:
        if r[0] != "(Others)" and r[1] != "(Others)":
            vals = [t["amt"] for t in truth if t["d"] == r[0].strip().lower() and t["s"] == r[1] and t["amt"] is not None]
            assert r[2] == pytest.approx(sum(vals) / len(vals), rel=1e-9)
    one = agg(eng, i, x=0, measures=[{"col": 2, "fn": "avg"}], max_cats=4)["rows"]
    o = [r for r in one if r[0] == "(Others)"][0]
    keep1 = {r[0].strip().lower() for r in one if r[0] != "(Others)"}
    oth1 = [t["amt"] for t in truth if t["d"] not in keep1 and t["amt"] is not None]
    assert o[1] == pytest.approx(sum(oth1) / len(oth1), rel=1e-9)             # an average of the leftovers, from the real rows


def test_dates_in_any_format_are_cut_into_periods(ds):
    eng, i, truth = ds
    good = [t for t in truth if t["day"]]
    m = {r[0]: r[1] for r in agg(eng, i, x=4, time="month", rank="label", measures=[{"col": -1, "fn": "count"}], max_cats=4000)["rows"]}
    want = defaultdict(int)
    for t in good:
        want[t["day"].strftime("%Y-%m")] += 1
    assert m == dict(want), "months (ISO, dd-mm-yyyy, dd/mm/yyyy and Devanagari digits all read; 'not a date' skipped)"
    fy = {r[0]: r[1] for r in agg(eng, i, x=4, time="fy", measures=[{"col": -1, "fn": "count"}])["rows"]}
    wfy = defaultdict(int)
    for t in good:
        a = t["day"].year if t["day"].month >= 4 else t["day"].year - 1
        wfy[f"{a}-{(a + 1) % 100:02d}"] += 1
    assert fy == dict(wfy)
    q = {r[0]: r[1] for r in agg(eng, i, x=4, time="quarter", measures=[{"col": -1, "fn": "count"}])["rows"]}
    wq = defaultdict(int)
    for t in good:
        wq[f"{t['day'].year}-Q{(t['day'].month - 1) // 3 + 1}"] += 1
    assert q == dict(wq)
    wd = {r[0]: r[1] for r in agg(eng, i, x=4, time="weekday", measures=[{"col": -1, "fn": "count"}])["rows"]}
    wwd = defaultdict(int)
    for t in good:
        wwd[t["day"].strftime("%a")] += 1
    assert wd == dict(wwd)
    yr = {r[0]: r[1] for r in agg(eng, i, x=4, time="year", measures=[{"col": -1, "fn": "count"}])["rows"]}
    assert yr == {str(y): sum(1 for t in good if t["day"].year == y) for y in {t["day"].year for t in good}}


def test_filters_used_by_chart_clicks(ds):
    eng, i, truth = ds
    n = eng.rows(i, 0, 1, filters=[{"col": 0, "op": "ieq", "value": "JAIPUR"}], count=True)["matched"]
    assert n == sum(1 for t in truth if t["d"] == "jaipur")
    n = eng.rows(i, 0, 1, filters=[{"col": 4, "op": "bucket", "value": "month", "value2": "2024-02"}], count=True)["matched"]
    assert n == sum(1 for t in truth if t["day"] and t["day"].strftime("%Y-%m") == "2024-02")
    n = eng.rows(i, 0, 1, filters=[{"col": 4, "op": "bucket", "value": "fy", "value2": "2023-24"}], count=True)["matched"]
    assert n == sum(1 for t in truth if t["day"] and dt.date(2023, 4, 1) <= t["day"] < dt.date(2024, 4, 1))
    n = eng.rows(i, 0, 1, filters=[{"col": 4, "op": "bucket", "value": "quarter", "value2": "2024-Q4"}], count=True)["matched"]
    assert n == sum(1 for t in truth if t["day"] and t["day"].year == 2024 and t["day"].month >= 10)
    n = eng.rows(i, 0, 1, filters=[{"col": 4, "op": "bucket", "value": "weekday", "value2": "Mon"}], count=True)["matched"]
    assert n == sum(1 for t in truth if t["day"] and t["day"].weekday() == 0)
    n = eng.rows(i, 0, 1, filters=[{"col": 4, "op": "bucket", "value": "day", "value2": "2024-01-15"}], count=True)["matched"]
    assert n == sum(1 for t in truth if t["day"] == dt.date(2024, 1, 15))
    n = eng.rows(i, 0, 1, filters=[{"col": 0, "op": "iin", "value": ["kota", "JODHPUR "]}], count=True)["matched"]
    assert n == sum(1 for t in truth if t["d"] in ("kota", "jodhpur"))
    n = eng.rows(i, 0, 1, filters=[{"col": 4, "op": "bucket", "value": "month", "value2": ["2024-02", "2024-03"]}], count=True)["matched"]
    assert n == sum(1 for t in truth if t["day"] and t["day"].strftime("%Y-%m") in ("2024-02", "2024-03"))
    n = eng.rows(i, 0, 1, filters=[{"col": 4, "op": "bucket", "value": "weekday", "value2": ["Sat", "Sun"]}], count=True)["matched"]
    assert n == sum(1 for t in truth if t["day"] and t["day"].weekday() >= 5)
    with pytest.raises(eng_mod.EngineError):
        eng.rows(i, 0, 1, filters=[{"col": 4, "op": "bucket", "value": "month", "value2": "garbage"}])


def test_charts_respect_search_and_filters(ds):
    eng, i, truth = ds
    res = agg(eng, i, x=1, filters=[{"col": 0, "op": "ieq", "value": "kota"}], measures=[{"col": -1, "fn": "count"}])
    assert sum(r[1] for r in res["rows"]) == sum(1 for t in truth if t["d"] == "kota") == res["matched"]
    res = agg(eng, i, x=1, search="jodhpur", measures=[{"col": -1, "fn": "count"}])
    assert res["matched"] == sum(1 for t in truth if t["d"] == "jodhpur")


def test_histogram_counts_and_moments(ds):
    eng, i, truth = ds
    vals = [t["amt"] for t in truth if t["amt"] is not None]
    h = eng.chart_hist(i, 2, bins=10)
    assert h["n"] == len(vals) and sum(h["counts"]) == len(vals) and len(h["edges"]) == 11 and len(h["counts"]) == 10
    assert h["mean"] == pytest.approx(statistics.fmean(vals)) and h["median"] == pytest.approx(statistics.median(vals))
    assert h["sd"] == pytest.approx(statistics.pstdev(vals), rel=1e-9) and h["min"] == min(vals) and h["max"] == max(vals)
    w = (max(vals) - min(vals)) / 10
    want = [0] * 10
    for v in vals:
        want[min(9, int((v - min(vals)) / w))] += 1
    assert h["counts"] == want
    auto = eng.chart_hist(i, 3)                                      # ages: automatic number of bars
    assert 5 <= len(auto["counts"]) <= 40 and sum(auto["counts"]) == len(truth)


def test_boxplot_quartiles_equal_python(ds):
    eng, i, truth = ds
    b = eng.chart_box(i, 1, 2, top=3)
    assert len(b["labels"]) == 3
    for lab, st in zip(b["labels"], b["stats"]):
        v = np.array([t["amt"] for t in truth if t["s"] == lab and t["amt"] is not None])
        q1, q2, q3 = np.percentile(v, [25, 50, 75])
        iqr = q3 - q1
        inl = v[(v >= q1 - 1.5 * iqr) & (v <= q3 + 1.5 * iqr)]
        assert st == pytest.approx([inl.min(), q1, q2, q3, inl.max()], rel=1e-9)
    kinds = eng.chart_box(i, 0, 2, top=50)
    assert all(lab for lab in kinds["labels"]) and len(kinds["labels"]) <= 50


def test_points_are_a_sample_with_exact_trend(ds):
    eng, i, truth = ds
    p = eng.chart_points(i, 3, 2, limit=500)
    ok = [t for t in truth if t["amt"] is not None]
    assert p["n"] == len(ok) and len(p["points"]) == 500 and p["sampled"]
    xs, ys = np.array([t["age"] for t in ok], float), np.array([t["amt"] for t in ok], float)
    assert p["reg"]["r"] == pytest.approx(np.corrcoef(xs, ys)[0, 1], rel=1e-9)
    slope, icpt = np.polyfit(xs, ys, 1)
    assert p["reg"]["slope"] == pytest.approx(slope, rel=1e-9) and p["reg"]["xmin"] == xs.min() and p["reg"]["xmax"] == xs.max()
    assert p == eng.chart_points(i, 3, 2, limit=500), "the same sample every time"
    g = eng.chart_points(i, 3, 2, g=0, limit=300, max_groups=4)
    assert len({pt[3] for pt in g["points"]}) <= 4 and g["hasGroup"]
    b = eng.chart_points(i, 3, 2, size=3, limit=200)
    assert all(len(pt) == 4 for pt in b["points"])


def test_sample_for_column_types(ds):
    eng, i, truth = ds
    s = eng.sample(i, 800)
    assert len(s["rows"]) == 800 and s["headers"][0] == "Dist" and s["total"] == len(truth)
    assert s["rows"] == eng.sample(i, 800)["rows"]


def test_unknown_function_and_columns_are_refused(ds):
    eng, i, _ = ds
    with pytest.raises(eng_mod.EngineError):
        eng.chart_agg(i, x=0, measures=[{"col": 2, "fn": "drop table"}])
    with pytest.raises(eng_mod.EngineError):
        eng.chart_agg(i, x=99)
    with pytest.raises(eng_mod.EngineError):
        eng.chart_hist(i, 99)


def test_a_long_date_axis_keeps_the_most_recent_periods(ds):
    eng, i, truth = ds
    res = agg(eng, i, x=4, time="month", rank="label", max_cats=6, measures=[{"col": -1, "fn": "count"}])
    months = sorted({t["day"].strftime("%Y-%m") for t in truth if t["day"]})
    kept = sorted(r[0] for r in res["rows"] if r[0] != "(Others)")
    assert kept == months[-6:]


def test_numeric_request_fields_are_numbers_only(ds):
    eng, i, _ = ds
    with pytest.raises((ValueError, TypeError)):
        eng.chart_points(i, 3, 2, g=0, max_groups="4; DROP TABLE x")
    with pytest.raises((ValueError, TypeError)):
        eng.chart_agg(i, x=0, max_cats="5; DROP TABLE x")
    assert eng.chart_points(i, 3, 2, limit=100)["n"] > 0, "the dataset is still there"


# ---------------------------------------------------------------- analyst features: lists, zeros as "not rated", small groups
CUIS = ["North Indian", "Chinese", "Italian", "Cafe", "Desserts", "Seafood", "Mexican"]


@pytest.fixture()
def zm(eng):
    r = random.Random(5)
    rows, truth = [], []
    for i in range(4000):
        cu = sorted({r.choice(CUIS), r.choice(CUIS)}) if r.random() < 0.8 else [r.choice(CUIS)]
        city = r.choice(["Delhi", "Delhi", "Delhi", "Pune", "Goa"] + (["Tiny"] if i < 12 else []))
        rating = 0.0 if r.random() < 0.25 else round(2.2 + r.random() * 2.6, 1)
        rows.append([", ".join(cu), city, str(rating), str(r.randint(0, 900))])
        truth.append({"cu": cu, "city": city, "rating": rating})
    info = eng.load_rows(["Cuisines", "City", "Rating", "Votes"], rows, "z")
    return eng, info["id"], truth


def test_list_column_items_are_counted_separately(zm):
    eng, i, truth = zm
    res = eng.chart_agg(i, x=0, multi=True, measures=[{"col": -1, "fn": "count"}], max_cats=50)
    got = {r[0].lower(): r[1] for r in res["rows"]}
    want = {c.lower(): sum(1 for t in truth if c in t["cu"]) for c in CUIS}
    assert got == want and sum(got.values()) > len(truth)
    avg = eng.chart_agg(i, x=0, multi=True, nozero=True, measures=[{"col": 2, "fn": "avg"}], max_cats=50)
    for row in avg["rows"]:
        v = [t["rating"] for t in truth if any(c.lower() == row[0].lower() for c in t["cu"]) and t["rating"] > 0]
        assert row[1] == pytest.approx(sum(v) / len(v), rel=1e-9)
    assert avg["zeroSkipped"] == sum(1 for t in truth if t["rating"] == 0)


def test_item_filter_finds_the_rows_of_a_list_item(zm):
    eng, i, truth = zm
    n = eng.rows(i, 0, 1, filters=[{"col": 0, "op": "item", "value": "Cafe"}], count=True)["matched"]
    assert n == sum(1 for t in truth if "Cafe" in t["cu"])
    n2 = eng.rows(i, 0, 1, filters=[{"col": 0, "op": "item", "value": ["cafe", "SEAFOOD"]}], count=True)["matched"]
    assert n2 == sum(1 for t in truth if "Cafe" in t["cu"] or "Seafood" in t["cu"])
    assert eng.rows(i, 0, 1, filters=[{"col": 0, "op": "item", "value": "Ca"}], count=True)["matched"] == 0, "an item is matched whole, not as part of another word"


def test_zeros_can_be_left_out_of_every_chart_kind(zm):
    eng, i, truth = zm
    rated = [t["rating"] for t in truth if t["rating"] > 0]
    by = {r[0]: r[1] for r in eng.chart_agg(i, x=1, nozero=True, measures=[{"col": 2, "fn": "avg"}])["rows"]}
    for city, v in by.items():
        vals = [t["rating"] for t in truth if t["city"] == city and t["rating"] > 0]
        assert v == pytest.approx(sum(vals) / len(vals), rel=1e-9)
    cnt = eng.chart_agg(i, x=1, nozero=True, measures=[{"col": -1, "fn": "count"}])
    assert sum(r[1] for r in cnt["rows"]) == len(truth), "counting still counts every row"
    h = eng.chart_hist(i, 2, bins=8, nozero=True)
    assert h["n"] == len(rated) and sum(h["counts"]) == len(rated) and h["zeroSkipped"] == len(truth) - len(rated) and h["min"] > 0
    assert eng.chart_hist(i, 2, bins=8)["n"] == len(truth)
    b = eng.chart_box(i, 1, 2, nozero=True)
    assert all(st[0] > 0 for st in b["stats"])
    p = eng.chart_points(i, 3, 2, nozero=True, limit=500)
    assert all(pt[1] > 0 and pt[2] > 0 for pt in p["points"]) and p["zeroSkipped"] > 0


def test_small_groups_are_hidden_but_never_all_of_them(zm):
    eng, i, truth = zm
    res = eng.chart_agg(i, x=1, nozero=True, min_rows=100, measures=[{"col": 2, "fn": "avg"}])
    assert {r[0] for r in res["rows"]} == {"Delhi", "Pune", "Goa"} and res["hiddenSmall"] == 1
    res2 = eng.chart_agg(i, x=1, min_rows=10_000_000, measures=[{"col": 2, "fn": "avg"}])
    assert len(res2["rows"]) == 4 and res2["hiddenSmall"] == 0, "if nothing would be left, nothing is hidden"


def test_fair_cells_equal_plain_python(zm):
    eng, i, truth = zm
    res = eng.fair_cells(i, 2, 1, [0], nozero=True)
    cells = {tuple(c["k"]): c for c in res["cells"]}
    # whole-table totals and per-group totals
    assert sum(c["n"] for c in res["cells"]) == sum(1 for t in truth if t["rating"] > 0) == res["matched"] - res["zeroSkipped"]
    assert res["zeroSkipped"] == sum(1 for t in truth if t["rating"] == 0)
    for city in ["Delhi", "Pune", "Goa"]:
        vals = [t["rating"] for t in truth if t["city"] == city and t["rating"] > 0]
        n = sum(c["n"] for k, c in cells.items() if k[0] == city)
        assert n == len(vals) and sum(c["sy"] for k, c in cells.items() if k[0] == city) == pytest.approx(sum(vals))
        assert sum(c["syy"] for k, c in cells.items() if k[0] == city) == pytest.approx(sum(v * v for v in vals))


def test_fair_cells_fold_rare_levels_and_refuse_bad_columns(zm):
    eng, i, _ = zm
    res = eng.fair_cells(i, 2, 1, [0], max_levels=3)
    assert "(Others)" in {c["k"][1] for c in res["cells"]}
    with pytest.raises(eng_mod.EngineError):
        eng.fair_cells(i, 2, 1, [1])
    with pytest.raises(eng_mod.EngineError):
        eng.fair_cells(i, 99, 1, [])


def test_number_bands_and_condition_shares(ds):
    eng, i, truth = ds
    edges = [18, 30, 40, 50, 60, 70]
    res = eng.chart_agg(i, x=3, xbands=edges, measures=[{"col": -1, "fn": "count"}, {"col": 2, "fn": "pct", "op": ">", "value": 50000}])
    got = {r[0]: (r[1], r[2]) for r in res["rows"]}
    for b in range(5):
        lo, hi = edges[b], edges[b + 1]
        inb = [t for t in truth if (lo <= t["age"] < hi) or (b == 0 and t["age"] < lo) or (b == 4 and t["age"] >= hi)]
        amts = [t["amt"] for t in inb if t["amt"] is not None]
        assert got[f"b{b:03d}"][0] == len(inb)
        assert got[f"b{b:03d}"][1] == pytest.approx(sum(1 for a in amts if a > 50000) / len(amts) * 100, rel=1e-9)
    st = eng.chart_agg(i, x=1, measures=[{"col": 1, "fn": "pct", "op": "=", "value": "pending"}])
    assert {r[0]: r[1] for r in st["rows"]} == {"Pending": 100.0, "Disposed": 0.0, "Under inquiry": 0.0}
    with pytest.raises(eng_mod.EngineError):
        eng.chart_agg(i, x=1, measures=[{"col": 2, "fn": "pct", "op": "; drop", "value": 1}])
    with pytest.raises(eng_mod.EngineError):
        eng.chart_agg(i, x=3, xbands=["a", "b"])


def test_fair_cells_with_number_bands(zm):
    eng, i, truth = zm
    res = eng.fair_cells(i, 2, 1, [3], bands={3: [0, 300, 600, 901]})
    assert {c["k"][1] for c in res["cells"]} <= {"b000", "b001", "b002"}
    assert sum(c["n"] for c in res["cells"]) == len(truth)


# ------------------------------------------------------------------ "What explains this?": stand-ins and label rules
@pytest.fixture()
def tiers(eng):
    r = random.Random(9)
    rows, truth = [], []
    for i in range(6000):
        waste = round(r.uniform(1, 30), 1)
        temp = round(r.uniform(30, 72), 1) if r.random() > 0.01 else None        # a few blank temperatures
        rare = r.random() < 0.02                                                 # a rare label: 2% of rows
        tier = "Rare" if rare else ("Cold" if temp is not None and temp < 48 else ("High" if waste >= 20 else "Ok"))
        rows.append([str(waste), "" if temp is None else str(temp), tier, r.choice(["A", "B", "C"])])
        truth.append((waste, temp, tier))
    info = eng.load_rows(["Waste", "Temp", "Tier", "Group"], rows, "t")
    return eng, info["id"], truth


def test_label_sample_keeps_every_label_and_counts_the_whole_file(tiers):
    eng, i, truth = tiers
    res = eng.label_sample(i, 2, [0, 1], per_class=300)
    counts = defaultdict(int)
    for *_, t in truth:
        counts[t] += 1
    assert res["counts"] == dict(counts)
    got = defaultdict(int)
    for row in res["rows"]:
        got[row[0]] += 1
        assert len(row) == 3
    assert got["Rare"] == min(300, counts["Rare"]) and all(v <= 300 for v in got.values())
    assert eng.label_sample(i, 2, [0, 1], per_class=300)["rows"] == res["rows"], "always the same rows"


def test_rule_check_counts_every_row_like_python(tiers):
    eng, i, truth = tiers
    rules = [{"label": "Cold", "conds": [{"col": 1, "max": 48}]}, {"label": "High", "conds": [{"col": 0, "min": 20}]}]
    res = eng.rule_check(i, 2, rules, "Ok")
    want = [{"n": 0, "right": 0}, {"n": 0, "right": 0}]
    other = {"n": 0, "right": 0}
    for w, t, tier in truth:
        k = 0 if (t is not None and t < 48) else (1 if w >= 20 else -1)       # a blank temperature is not "< 48"
        pred = rules[k]["label"] if k >= 0 else "Ok"
        st = want[k] if k >= 0 else other
        st["n"] += 1
        st["right"] += pred == tier
    assert res["rules"] == want and res["otherwise"] == other and res["n"] == len(truth)
    assert res["right"] == sum(x["right"] for x in want) + other["right"]
    with pytest.raises(eng_mod.EngineError):
        eng.rule_check(i, 2, [{"label": "x", "conds": [{"col": 99, "min": 1}]}], "Ok")


def test_fair_pairs_equal_fair_cells_one_by_one(tiers):
    eng, i, truth = tiers
    bands = {0: [1, 10, 20, 31], 1: [30, 48, 60, 73]}
    res = eng.fair_pairs(i, 0, [{"x": 3, "z": 2}, {"x": 1, "z": 2}], bands=bands)["pairs"]
    one = eng.fair_cells(i, 0, 3, [2])["cells"]
    two = eng.fair_cells(i, 0, 1, [2], bands={1: bands[1]})["cells"]
    key = lambda cs: sorted((tuple(c["k"]), c["n"], round(c["sy"], 6)) for c in cs)
    assert key(res[0]["cells"]) == key(one) and key(res[1]["cells"]) == key(two)


def test_column_checks_count_formulas_and_caps_on_every_row(eng):
    r = random.Random(4)
    rows = []
    for _ in range(3000):
        cost = min(round(r.uniform(9000, 16000)), 15000)                          # capped at 15,000
        waste = round(r.uniform(1, 30), 1)
        temp = round(r.uniform(30, 72), 1)
        transit = r.randint(5, 90)
        rows.append([str(cost), str(waste), str(round(cost / (1 - waste / 100))), str(temp), str(transit), str(round((75 - temp) / transit, 3))])
    i = eng.load_rows(["Cost", "Waste", "Adjusted", "Temp", "Transit", "Cooling"], rows, "f")["id"]
    res = eng.column_checks(i, formulas=[{"t": 2, "a": 0, "b": 1, "op": "divless", "d": 0}, {"t": 5, "a": 3, "b": 4, "op": "cdiv", "c": 75, "d": 3},
                                         {"t": 2, "a": 0, "b": 1, "op": "mul", "d": 0}],
                            caps=[{"col": 0, "value": 15000}])
    assert res["formulas"][0] == {"n": 3000, "ok": 3000}
    assert res["formulas"][1] == {"n": 3000, "ok": 3000}
    assert res["formulas"][2]["ok"] < 100, "a wrong formula does not fit"
    want = sum(1 for row in rows if row[0] == "15000")
    assert res["caps"][0] == {"n": 3000, "count": want} and want > 300
    with pytest.raises(eng_mod.EngineError):
        eng.column_checks(i, formulas=[{"t": 2, "a": 0, "b": 1, "op": "drop table"}])


def test_fair_pairs_accepts_several_columns_together(tiers):
    eng, i, truth = tiers
    res = eng.fair_pairs(i, 0, [{"x": 3, "z": [2, 1]}], bands={1: [30, 48, 60, 73]})["pairs"][0]["cells"]
    one = eng.fair_cells(i, 0, 3, [2, 1], bands={1: [30, 48, 60, 73]})["cells"]
    key = lambda cs: sorted((tuple(c["k"]), c["n"]) for c in cs)
    assert key(res) == key(one) and all(len(c["k"]) == 3 for c in res)


def test_fair_linear_equals_statsmodels_hc3(eng):
    sm = pytest.importorskip("statsmodels.formula.api")
    import pandas as pd
    r = random.Random(12)
    rows = []
    for _ in range(3000):
        mode = r.choice(["Boat", "Van", "Bike", "Bike"])
        grp = r.choice(["SD", "SMP", "SMA"])
        temp = round(r.uniform(30, 72) - (12 if mode == "Boat" else 0), 1)
        waste = round(20 - 0.15 * temp + (3 if grp == "SD" else 0) + r.gauss(0, 3), 1)
        rows.append([mode, grp, str(temp), str(waste)])
    i = eng.load_rows(["Mode", "Group", "Temp", "Waste"], rows, "l")["id"]
    res = eng.fair_linear(i, 3, 0, [1], [2], ref="Bike")
    df = pd.DataFrame(rows, columns=["mode", "grp", "temp", "waste"]).astype({"temp": float, "waste": float})
    m = sm.ols("waste ~ C(mode, Treatment('Bike')) + C(grp, Treatment('SD')) + temp", df).fit(cov_type="HC3")
    for lv in ["Boat", "Van"]:
        k = f"C(mode, Treatment('Bike'))[T.{lv}]"
        assert abs(res["levels"][lv][0] - m.params[k]) < 1e-8 and abs(res["levels"][lv][1] - m.bse[k]) < 1e-8
    assert abs(res["r2"] - m.rsquared) < 1e-9 and res["n"] == 3000
    alone = sm.ols("waste ~ C(mode, Treatment('Bike')) + temp", df).fit(cov_type="HC3")
    assert abs(res["alone"][1]["Boat"][0] - alone.params["C(mode, Treatment('Bike'))[T.Boat]"]) < 1e-8
    assert abs(res["alone"][1]["Boat"][1] - alone.bse["C(mode, Treatment('Bike'))[T.Boat]"]) < 1e-8


def test_fair_linear_curve_and_aic_equal_statsmodels(eng):
    sm = pytest.importorskip("statsmodels.formula.api")
    import pandas as pd
    r = random.Random(3)
    rows = []
    for _ in range(2500):
        mode = r.choice(["Boat", "Bike", "Bike"])
        temp = round(r.uniform(30, 72) - (10 if mode == "Boat" else 0), 1)
        waste = round(30 - 0.6 * temp + 0.005 * (temp - 50) ** 2 * 10 + r.gauss(0, 2), 1)
        rows.append([mode, str(temp), str(waste)])
    i = eng.load_rows(["Mode", "Temp", "Waste"], rows, "c")["id"]
    df = pd.DataFrame(rows, columns=["mode", "temp", "waste"]).astype({"temp": float, "waste": float})
    df["t2"] = (df.temp - df.temp.mean()) ** 2
    for curve, formula in [(False, "waste ~ C(mode, Treatment('Bike')) + temp"), (True, "waste ~ C(mode, Treatment('Bike')) + temp + t2")]:
        res = eng.fair_linear(i, 2, 0, [], [1], ref="Bike", curve=curve)
        m = sm.ols(formula, df).fit(cov_type="HC3")
        k = "C(mode, Treatment('Bike'))[T.Boat]"
        assert abs(res["levels"]["Boat"][0] - m.params[k]) < 1e-8 and abs(res["levels"]["Boat"][1] - m.bse[k]) < 1e-8
        assert res["p"] == len(m.params) and abs(res["aic"] - (len(df) * np.log(m.ssr / len(df)) + 2 * len(m.params))) < 1e-6
