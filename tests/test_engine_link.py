"""Linking two files by a key column, one row per key, and replacing a placeholder code: every result equals pandas on the same rows."""
import random

import pandas as pd
import pytest

import engine as eng_mod


@pytest.fixture()
def eng():
    e = eng_mod.Engine()
    yield e
    e.close()


def _pair(eng, n_people=800, seed=4):
    r = random.Random(seed)
    app, cred = [], []
    for p in range(n_people):
        pid = str(5000000 + p)
        app.append([pid, r.choice(["F", "M"]), str(r.choice([50000, 90000, 120000, 365243]))])
        if p % 5 == 0:
            continue                                                  # no credit history for this person
        for m in range(r.randint(1, 14)):
            cred.append([pid, str(-m), r.choice(["C", "0", "X", "1", "2", "5"])])
    r.shuffle(cred)
    app += [["5000007", "M", "70000"], ["5000011", "F", "80000"]]      # two ids that are in the application file twice (different people)
    cred += [["9999991", "0", "0"]]                                    # a person who is not in the application file
    a = eng.load_rows(["ID", "Gender", "Income"], app, "application")
    c = eng.load_rows(["ID", "MONTHS_BALANCE", "STATUS"], cred, "credit")
    return a, c, pd.DataFrame(app, columns=["ID", "Gender", "Income"]), pd.DataFrame(cred, columns=["ID", "M", "S"])


def _df(eng, info):
    return eng.to_arrow(info["id"]).to_pandas()


def test_one_row_per_id_equals_pandas(eng):
    a, c, A, C = _pair(eng)
    outs = [{"fn": "count", "name": "Months"}, {"fn": "min", "col": 1, "name": "Oldest"}, {"fn": "avg", "col": 1, "name": "Mean"},
            {"fn": "countif", "col": 2, "values": ["1", "2", "5"], "name": "Late months"}, {"fn": "anyif", "col": 2, "values": ["2", "5"], "name": "Ever 60+"},
            {"fn": "shareif", "col": 2, "values": ["1", "2", "5"], "name": "Late share"}, {"fn": "distinct", "col": 2, "name": "Kinds"}, {"fn": "first", "col": 2, "name": "First"}]
    s = eng.summarize(c["id"], 0, outs, "per person")
    got = _df(eng, s).set_index("ID")
    g = C.assign(M=C.M.astype(float)).groupby("ID")
    assert len(got) == C.ID.nunique() == s["rows"]
    got = got.sort_index()
    assert (got["Months"].astype(int) == g.size()).all()
    assert (got["Oldest"].astype(float) == g.M.min()).all()
    assert (got["Mean"].astype(float) - g.M.mean()).abs().max() < 1e-5
    late = C.assign(l=C.S.isin(["1", "2", "5"])).groupby("ID").l.sum()
    assert (got["Late months"].astype(int) == late).all()
    assert (got["Ever 60+"] == C.assign(l=C.S.isin(["2", "5"])).groupby("ID").l.any().map({True: "Yes", False: "No"})).all()
    assert (got["Late share"].astype(float) - 100 * late / g.size()).abs().max() < 0.006
    assert (got["Kinds"].astype(int) == g.S.nunique()).all()
    assert (got["First"] == g.S.first()).all()


def test_link_check_reports_every_count(eng):
    a, c, A, C = _pair(eng)
    k = eng.link_check(c["id"], a["id"], 0, 0)             # credit rows, looking each person up in the application file
    ids = set(A.ID)
    assert k["left_rows"] == len(C) and k["matched_rows"] == C.ID.isin(ids).sum()
    assert k["left_keys"] == C.ID.nunique() and k["matched_keys"] == len(set(C.ID) & ids)
    assert k["other_repeated_keys"] == 2 and k["other_repeated_rows"] == 4
    assert k["ambiguous_keys"] == len(set(C.ID) & {"5000007", "5000011"})


def test_link_adds_columns_and_never_guesses_a_repeated_id(eng):
    a, c, A, C = _pair(eng)
    out = eng.link(c["id"], a["id"], 0, 0, [1, 2], "left", "blank", "linked")
    got = _df(eng, out)
    assert list(got.columns) == ["ID", "MONTHS_BALANCE", "STATUS", "Gender", "Income"] and len(got) == len(C)       # one row per credit row, order kept
    uniq = A[~A.ID.duplicated(keep=False)].set_index("ID")
    ok = got[got.ID.isin(uniq.index)]
    assert (ok.Gender.values == uniq.loc[ok.ID, "Gender"].values).all() and (ok.Income.values == uniq.loc[ok.ID, "Income"].values).all()
    amb = got[got.ID.isin(["5000007", "5000011"])]
    assert len(amb) and (amb.Gender == "").all() and (amb.Income == "").all()                    # two people share this id: nobody is assumed
    assert (got[got.ID == "9999991"].Gender == "").all()                                         # not in the application file: left empty
    first = _df(eng, eng.link(c["id"], a["id"], 0, 0, [1, 2], "left", "first", "linked2"))
    f = A.drop_duplicates("ID").set_index("ID")
    ok2 = first[first.ID.isin(f.index)]
    assert (ok2.Income.values == f.loc[ok2.ID, "Income"].values).all()


def test_inner_link_keeps_only_matches(eng):
    a, c, A, C = _pair(eng)
    out = eng.link(c["id"], a["id"], 0, 0, [1], "inner", "first", "inner")
    assert out["rows"] == C.ID.isin(set(A.ID)).sum()


def test_keys_ignore_capitals_spaces_and_trailing_zero(eng):
    l = eng.load_rows(["Key", "V"], [["A-1 ", "1"], ["b-2", "2"], ["5008804.0", "3"], ["zz", "4"]], "l")
    o = eng.load_rows(["Code", "Name"], [["a-1", "one"], ["B-2", "two"], ["5008804", "num"]], "o")
    got = _df(eng, eng.link(l["id"], o["id"], 0, 0, [1], "left", "blank", "x"))
    assert list(got.Name) == ["one", "two", "num", ""]


def test_name_collision_gets_the_other_files_name(eng):
    l = eng.load_rows(["ID", "Income"], [["1", "5"]], "left")
    o = eng.load_rows(["ID", "Income"], [["1", "9"]], "right")
    got = eng.link(l["id"], o["id"], 0, 0, [1], "left", "blank", "x")
    assert got["headers"] == ["ID", "Income", "Income (right)"]


def test_replace_placeholder_makes_blank_and_counts(eng):
    a, c, A, C = _pair(eng)
    out = eng.replace_value(a["id"], 2, "365243", "", "clean")
    got = _df(eng, out)
    assert out["changed"] == (A.Income == "365243").sum() and (got.Income == "").sum() == out["changed"]
    assert (got.ID.values == A.ID.values).all() and (got.Gender.values == A.Gender.values).all()
    assert eng.scalar(a["id"], 2, "count", [{"col": 2, "value": "365243"}])["n"] == out["changed"]      # the original is untouched


def test_unknown_options_are_refused(eng):
    a, c, A, C = _pair(eng)
    with pytest.raises(eng_mod.EngineError):
        eng.summarize(c["id"], 0, [{"fn": "median", "col": 1}])
    with pytest.raises(eng_mod.EngineError):
        eng.link(c["id"], a["id"], 0, 0, [], "sideways")
    with pytest.raises(eng_mod.EngineError):
        eng.summarize(c["id"], 0, [{"fn": "countif", "col": 2, "values": []}])
