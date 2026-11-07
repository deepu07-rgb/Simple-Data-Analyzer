"""Tags by words and the feeling of a comment, every row read; equal to an independent plain-Python version (English and Hindi)."""
import re

import pytest

import engine as eng_mod
import lexicon


@pytest.fixture()
def eng():
    e = eng_mod.Engine()
    yield e
    e.close()


TEXTS = [
    "The service was very good and staff were friendly", "Bus came late, very bad experience", "not good at all", "No problem, resolved quickly",
    "Pending since 3 months, nobody listens", "Plate was clean", "", "   ", "Great work! Thanks", "I don't like the delay",
    "पानी की सप्लाई में देरी, बहुत खराब", "सेवा अच्छी है, धन्यवाद", "काम अच्छा नहीं है", "bijli ka bill galat aaya", "Excellent and quick, will recommend",
    "Terrible!!! worst ever", "Everything is fine", "Late fee charged wrongly; complaint pending",
]


def _load(eng):
    rows = [[str(i), t] for i, t in enumerate(TEXTS * 40)]
    return eng.load_rows(["id", "comment"], rows, "c")["id"]


def _toks(t):
    t = t.replace("’", "'").lower()
    t = re.sub(r"[.,;:!?।…()]+", " | ", t)
    return [w for w in re.sub(r"[^\wऀ-ॿ'|]+", " ", t).strip().split(" ") if w]


def _score(t):
    lex = lexicon.table()
    toks = _toks(t)
    s = 0
    for i, w in enumerate(toks):
        if w not in lex:
            continue
        neg = (i >= 1 and toks[i - 1] in lexicon.NEGATORS) or (i >= 2 and toks[i - 2] in lexicon.NEGATORS and toks[i - 1] != '|' and toks[i - 1] not in lex) or (i + 1 < len(toks) and toks[i + 1] in lexicon.POST_NEGATORS)
        s += lex[w] * (-1 if neg else 1)
    return s


def _feel(t):
    if not t.strip():
        return ""
    s = _score(t)
    return "Positive" if s > 0 else "Negative" if s < 0 else "Neutral"


def _col(eng, info, k):
    return [r[k] for r in eng.rows(info["id"], 0, 100000)["rows"]] if hasattr(eng, "rows") else None


def _read(eng, ds):
    cur = eng.db.cursor()
    d = eng.datasets[ds]
    return [r for r in cur.execute(f"SELECT {', '.join('c%d' % i for i in range(len(d['headers'])))} FROM {d['table']} ORDER BY __rid").fetchall()]


def test_feeling_equals_plain_python(eng):
    ds = _load(eng)
    res = eng.tag_text(ds, 1, sentiment=True)
    got = [r[2] for r in _read(eng, res["info"]["id"])]
    want = [_feel(t) for t in TEXTS * 40]
    bad = [(t, g, w) for t, g, w in zip(TEXTS * 40, got, want) if g != w]
    assert not bad, bad[:5]
    assert res["feeling"]["Positive"] == want.count("Positive") and res["feeling"]["Negative"] == want.count("Negative")
    # a few meanings spelled out
    m = dict(zip(TEXTS, [_feel(t) for t in TEXTS]))
    assert m["The service was very good and staff were friendly"] == "Positive" and m["not good at all"] == "Negative"
    assert m["काम अच्छा नहीं है"] == "Negative" and m["सेवा अच्छी है, धन्यवाद"] == "Positive" and m["I don't like the delay"] == "Negative"


def test_tags_whole_word_and_hindi(eng):
    ds = _load(eng)
    tags = [{"name": "Delay", "words": ["late", "delay", "pending", "देरी"]}, {"name": "Cleanliness", "words": ["clean", "plate"]}, {"name": "Billing", "words": ["bill", "fee"]}]
    res = eng.tag_text(ds, 1, tags=tags, whole=True)
    got = [r[2] for r in _read(eng, res["info"]["id"])]

    def want(t):
        if not t.strip():
            return ""
        low = t.lower()
        hit = []
        for nm, ws in [(x["name"], x["words"]) for x in tags]:
            if any(re.search(r"(^|[^\wऀ-ॿ])" + re.escape(w) + r"($|[^\wऀ-ॿ])", low) for w in ws):
                hit.append(nm)
        return "; ".join(hit) or "Other"
    exp = [want(t) for t in TEXTS * 40]
    assert got == exp, [(t, g, e) for t, g, e in zip(TEXTS * 40, got, exp) if g != e][:5]
    # 'late' must not match inside 'plate'
    assert "Delay" not in got[TEXTS.index("Plate was clean")]
    assert res["counts"]["Delay"] == sum(1 for e in exp if "Delay" in e.split("; "))
    assert res["other"] == exp.count("Other")
    # part-of-word mode does match inside words
    res2 = eng.tag_text(ds, 1, tags=[{"name": "L", "words": ["late"]}], whole=False)
    g2 = [r[2] for r in _read(eng, res2["info"]["id"])]
    assert g2[TEXTS.index("Plate was clean")] == "L"


def test_hindi_words_are_not_split(eng):
    ds = eng.load_rows(["t"], [["अच्छा काम"], ["अच्छा सेवा"], ["खराब काम"]] * 20, "h")["id"]
    out = eng.word_counts(ds, 0, top=5)
    words = {w["w"]: w["rows"] for w in out["common"]}
    assert words.get("अच्छा") == 40 and words.get("काम") == 40, words


def test_needs_something_to_do(eng):
    ds = _load(eng)
    with pytest.raises(eng_mod.EngineError):
        eng.tag_text(ds, 1)
