"""Real-file regression at engine level: every number the app shows comes from the engine; here it is compared with pandas on the original files.
   REAL_DIR=<folder with the files> python tests/real_files/engine_truth.real.py      (a file that is not there is skipped)
   Files: credit_record.csv, application_record.csv (or the .7z extracted), text.csv (emotion), ai_student_impact_dataset_1.csv"""
import os, sys, re, collections
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import pandas as pd
from engine import Engine

D = os.environ.get("REAL_DIR")
if not D:
    print("SKIP: set REAL_DIR"); sys.exit(0)
fails = 0
def ok(c, m):
    global fails
    print(("PASS " if c else "FAIL ") + m); fails += 0 if c else 1
def find(n):
    for root, _, fs in os.walk(D):
        for f in fs:
            if f.endswith(n): return os.path.join(root, f)
e = Engine()

cr, ap = find("credit_record.csv"), find("application_record.csv")
if cr and ap:
    C = pd.read_csv(cr, dtype={"STATUS": str}); A = pd.read_csv(ap)
    a, c = e.load_csv(ap, "a")["id"], e.load_csv(cr, "c")["id"]
    ok(e.scalar(c, 2, "count", [{"col": 2, "value": "5"}])["n"] == (C.STATUS == "5").sum(), "credit: rows with STATUS 5")
    ok(e.scalar(c, 0, "distinct")["value"] == C.ID.nunique(), "credit: different IDs")
    k = e.link_check(c, a, 0, 0)
    ok(k["matched_keys"] == len(set(A.ID) & set(C.ID)) and k["other_repeated_keys"] == A.ID.duplicated().sum(), "link check: matched people and repeated IDs")
    s = e.summarize(c, 0, [{"fn": "anyif", "col": 2, "values": ["1", "2", "3", "4", "5"], "name": "late"}])
    ok(s["rows"] == C.ID.nunique(), "one row per ID")
    j = e.link(a, s["id"], 0, 0, None, "inner", "blank", "j"); df = e.to_arrow(j["id"]).to_pandas()
    ever = C.groupby("ID").STATUS.apply(lambda x: x.isin(list("12345")).any()); M = A[~A.ID.duplicated(keep=False)].merge(ever.rename("late").reset_index(), on="ID")
    ok((df["late"] == "Yes").sum() == M.late.sum(), "linked table: people ever late")
txt = find("text.csv")
if txt:
    T = pd.read_csv(txt, dtype=str, keep_default_na=False); t = e.load_csv(txt, "t")["id"]
    r = e.repeats(t, 1, 2); g = T.assign(k=T.text.str.strip().str.lower()).groupby("k").agg(n=("label", "size"), dv=("label", "nunique"))
    ok(r["extra_copies"] == (g.n[g.n > 1] - 1).sum() and r["conflicting_values"] == (g.dv > 1).sum(), "text: repeated texts and conflicting labels")
    ok(e.scalar(t, None, "count", [{"col": 1, "op": "word", "value": "happy"}])["n"] == T.text.str.lower().str.contains(r"(?<![\w'])happy(?![\w'])").sum(), "text: rows containing the word happy")
st = find("ai_student_impact_dataset_1.csv")
if st:
    S = pd.read_csv(st); s = e.load_csv(st, "s")["id"]
    ok(e.scalar(s, 0, "distinct")["value"] == S.iloc[:, 0].nunique(), "students: different IDs")
print("ALL PASSED" if not fails else f"{fails} FAILED"); sys.exit(1 if fails else 0)
