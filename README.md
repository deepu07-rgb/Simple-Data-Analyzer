# Stellura (स्टेल्यूरा)

Free, offline, bilingual (Hindi / English) data analysis for offices. Your data never leaves your computer.

## Run it (development)

```bash
pip install -r requirements.txt
python app.py            # http://127.0.0.1:5000  (this PC only)
```

Windows users run `start.bat` (installs the local AI engine on first run) and `stop.bat`.
The server listens on this PC only. To let other PCs on the office network connect, set `STELLURA_HOST=0.0.0.0` deliberately.

## Test it

```bash
pip install pytest
python -m pytest tests -q                       # backend + offline-promise checks
BASE=http://127.0.0.1:5000 node tests/e2e/phase0.e2e.js   # browser checks, all external network blocked
```

The browser test needs Node.js and Playwright. It fails if any request leaves the PC.

## Layout

| Path | What |
|---|---|
| `app.py` | Local server: file upload, Excel/PDF/report export, AI proxy |
| `download/` and `public/` | The single-file web app. **Both copies must stay byte-identical** (a test checks) |
| `static/` | Libraries and fonts served locally (no internet needed). Licences in `static/js/THIRD_PARTY_LICENSES.txt` |
| `tests/` | pytest and Playwright checks |
| `docs/` | Design documents and the roadmap |
