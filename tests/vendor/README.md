# Vendored test fixtures

`tests/test_browser_pdfs.py` drives the real `download/Simple-Data-Analyser.html` in a
headless browser.  The page loads jsPDF and jsPDF-AutoTable from a CDN; the tests serve
these local copies instead so they run offline and deterministically.  They are the exact
versions the page requests:

| File | Package | Version | License |
|---|---|---|---|
| `jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | MIT (`LICENSE.jspdf`) |
| `jspdf.plugin.autotable.min.js` | [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) | 3.8.2 | MIT (`LICENSE.jspdf-autotable`) |

They are test-only and are not shipped with the app.  If the CDN versions in the HTML are
bumped, update these files to match (`npm pack jspdf@<v> jspdf-autotable@<v>`).
