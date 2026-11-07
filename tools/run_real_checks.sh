#!/bin/bash
# Permanent check on the real files used so far. Usage: REAL_DIR=/folder/with/the/files BASE=http://127.0.0.1:5000 tools/run_real_checks.sh
# (start the app first: python app.py). A file that is missing is skipped.
cd "$(dirname "$0")/.."
python3 tests/real_files/engine_truth.real.py || exit 1
for s in zomato mbg_fair mbg_analyst coffee; do echo "== $s"; node tests/real_files/$s.real.js || exit 1; done
echo "real-file checks done"
