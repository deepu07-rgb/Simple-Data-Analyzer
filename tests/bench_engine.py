"""Benchmark: python tests/bench_engine.py [rows]   (not part of the normal test run)"""
import os, resource, sys, tempfile, time
import numpy as np
import pandas as pd
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import engine

N = int(sys.argv[1]) if len(sys.argv) > 1 else 1_000_000
rng = np.random.default_rng(1)
dist = np.array(["जयपुर", "जोधपुर", "उदयपुर", "कोटा", "अजमेर", "सीकर", "अलवर", "भरतपुर"])
ps = np.array([f"थाना {i}" for i in range(300)])
df = pd.DataFrame({
    "क्र_सं": np.arange(1, N + 1), "नाम": [f"व्यक्ति {i}" for i in range(N)],
    "जिला": rng.choice(dist, N), "थाना": rng.choice(ps, N), "पद": rng.choice(["सिपाही", "हेड कांस्टेबल", "एसआई"], N),
    "वेतन": rng.integers(20000, 90000, N), "भत्ता": rng.integers(0, 20000, N),
    "अनुभव": rng.integers(0, 35, N), "मूल्यांकन": np.round(rng.uniform(3, 5, N), 1),
    "स्थिति": rng.choice(["सक्रिय", "अवकाश पर", "निलंबित"], N), "तिमाही": rng.choice(["Q1", "Q2", "Q3", "Q4"], N),
    "फोन": [f"09{x:09d}" for x in rng.integers(0, 10**9, N)]})
path = os.path.join(tempfile.mkdtemp(), "big.csv")
df.to_csv(path, index=False, encoding="utf-8")
print(f"file: {N:,} rows x {df.shape[1]} cols, {os.path.getsize(path)/1e6:.0f} MB")

def t(label, fn):
    s = time.perf_counter(); r = fn(); print(f"{label:<42}{time.perf_counter()-s:7.2f} s"); return r

e = engine.Engine()
info = t("open file (load into engine)", lambda: e.load_csv(path))
ds = info["id"]; assert info["rows"] == N
t("first screen (100 rows)", lambda: e.rows(ds, 0, 100, count=True))
t("scroll to the middle", lambda: e.rows(ds, N // 2, 100))
t("sort by salary (numeric) + first page", lambda: e.rows(ds, 0, 100, sort=5, numeric=True, desc=True))
t("sort by name (text) + first page", lambda: e.rows(ds, 0, 100, sort=1))
t("search 'थाना 17' + count", lambda: e.rows(ds, 0, 100, search="थाना 17", count=True))
t("filter district & salary>80000 + count", lambda: e.rows(ds, 0, 100, count=True, filters=[{"col": 2, "op": "eq", "value": "जयपुर"}, {"col": 5, "op": "gt", "value": 80000}]))
t("group by district: sum salary, count", lambda: e.aggregate(ds, [2], [{"fn": "sum", "col": 5}, {"fn": "count"}]))
t("group by station (300 groups)", lambda: e.aggregate(ds, [3], [{"fn": "avg", "col": 5}]))
t("profile all 12 columns", lambda: e.profile(ds))
t("SQL: top 10 stations by headcount", lambda: e.query(ds, 'SELECT "थाना", count(*) c FROM data GROUP BY 1 ORDER BY 2 DESC LIMIT 10'))
t("export 1,000 filtered rows to Arrow", lambda: e.to_arrow(ds, limit=1000))
sel = t("save as project (zip+parquet)", lambda: __import__("projects").save("bench", {}, e.to_arrow(ds)))
print(f"project file: {sel['size']/1e6:.0f} MB")
print(f"peak memory of this process: {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024:.0f} MB")
e.close()
