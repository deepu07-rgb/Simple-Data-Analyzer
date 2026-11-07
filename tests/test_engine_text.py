"""Words in a text column and repeated values, every row read; equal to pandas on the same rows."""
import collections
import random
import re

import pandas as pd
import pytest

import engine as eng_mod


@pytest.fixture()
def eng():
    e = eng_mod.Engine()
    yield e
    e.close()


WORDS = {"0": ["sad", "lonely", "tired", "gloomy"], "1": ["happy", "glad", "bright", "cheerful"], "4": ["scared", "afraid", "anxious", "tense"]}
COMMON = ["i", "feel", "really", "so", "the", "very", "because", "work"]


def _data(eng, n=3000):
    r = random.Random(5)
    rows = []
    for _ in range(n):
        lab = r.choice(["0", "1", "1", "4"])
        ws = [r.choice(COMMON) for _ in range(r.randint(3, 8))] + ([r.choice(WORDS[lab])] if r.random() < 0.8 else [])
        r.shuffle(ws)
        rows.append([" ".join(ws).capitalize() + ("!" if r.random() < 0.2 else ""), lab])
    rows += rows[:200]                                                     # 200 texts entered twice
    rows += [[rows[i][0].upper() + " ", "4" if rows[i][1] != "4" else "0"] for i in range(50)]      # 50 of them again with another label, in capitals
    r.shuffle(rows)
    return eng.load_rows(["Text", "Label"], rows, "t")["id"], rows


def _tokens(s):
    return set(w for w in re.sub(r"[^\w']+", " ", s.lower()).split() if len(w) >= 2)


def test_word_counts_equal_pandas(eng):
    i, rows = _data(eng)
    res = eng.word_counts(i, 0, 1, top=15, ignore_common=False)
    df = pd.DataFrame(rows, columns=["t", "l"])
    cnt = collections.Counter(w for t in df.t for w in _tokens(t))
    assert res["n"] == len(df) and res["distinct_words"] == len(cnt)
    for x in res["common"]:
        assert x["rows"] == cnt[x["w"]]
        for g, k in x["by"].items():
            assert k == sum(x["w"] in _tokens(t) for t in df[df.l == g].t)
    assert [x["w"] for x in res["common"]][:3] == [w for w, _ in sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))[:3]]
    for g in ["0", "1", "4"]:
        gt = df[df.l == g].t
        top = res["standout"][g][0]
        k = sum(top["w"] in _tokens(t) for t in gt)
        assert top["rows"] == k and top["w"] in WORDS[g], (g, top)
        assert abs(top["share"] - k / len(gt)) < 1e-12 and abs(top["share_all"] - cnt[top["w"]] / len(df)) < 1e-12
        assert abs(top["lift"] - (k / len(gt)) / (cnt[top["w"]] / len(df))) < 1e-9


def test_common_words_are_left_out_on_request(eng):
    i, rows = _data(eng)
    res = eng.word_counts(i, 0, None, ignore_common=True)
    assert "the" not in [x["w"] for x in res["common"]] and "because" not in [x["w"] for x in res["common"]]
    assert "feel" in [x["w"] for x in res["common"]]                       # "feel" is not a stop word: it is what the file is about


def test_repeats_and_conflicts_equal_pandas(eng):
    i, rows = _data(eng)
    df = pd.DataFrame(rows, columns=["t", "l"])
    df["k"] = df.t.str.strip().str.lower()
    g = df.groupby("k").agg(n=("l", "size"), dv=("l", "nunique"))
    res = eng.repeats(i, 0, 1)
    assert res["rows"] == len(df) and res["values"] == len(g)
    assert res["repeated_values"] == (g.n > 1).sum() and res["rows_in_repeats"] == g.n[g.n > 1].sum() and res["extra_copies"] == (g.n[g.n > 1] - 1).sum()
    assert res["conflicting_values"] == (g.dv > 1).sum() and res["rows_in_conflicts"] == g.n[g.dv > 1].sum()
    assert res["examples"] and all(len(e["values"]) > 1 for e in res["examples"])


def test_contains_and_whole_word_conditions(eng):
    i, rows = _data(eng)
    df = pd.DataFrame(rows, columns=["t", "l"])
    assert eng.scalar(i, None, "count", [{"col": 0, "op": "word", "value": "happy"}])["n"] == sum("happy" in _tokens(t) for t in df.t)
    assert eng.scalar(i, None, "count", [{"col": 0, "op": "contains", "value": "HAPP"}])["n"] == df.t.str.lower().str.contains("happ").sum()
    assert eng.scalar(i, None, "count", [{"col": 0, "op": "word", "value": "hap"}])["n"] == 0                    # a whole word, not part of one
    assert eng.scalar(i, None, "count", [{"col": 0, "op": "word", "value": "happy"}, {"col": 1, "value": "1"}])["n"] == sum(("happy" in _tokens(t)) and l == "1" for t, l in rows)


def test_text_length_and_word_count_columns(eng):
    i, rows = _data(eng)
    info = eng.add_text_stats(i, 0, "t2")
    assert info["headers"] == ["Text", "Label", "Text_characters", "Text_words"]
    df = eng.to_arrow(info["id"]).to_pandas()
    src = pd.DataFrame(rows, columns=["Text", "Label"])
    assert (df.Text_characters.astype(int) == src.Text.str.strip().str.len()).all()
    assert (df.Text_words.astype(int) == src.Text.str.split().str.len()).all()
    assert (df.Text.values == src.Text.values).all() and info["rows"] == len(rows)
