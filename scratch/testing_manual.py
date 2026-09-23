"""
testing_manual.py — DataDrishti Complete Feature Testing Manual
Run: runtime\python\python.exe scratch\testing_manual.py
Generates: DataDrishti-Testing-Manual.docx in the project root.
"""

from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from pathlib import Path
import datetime

ROOT = Path(__file__).resolve().parent.parent
OUT  = ROOT / "DataDrishti-Testing-Manual.docx"

# ── Colour palette ────────────────────────────────────────────────────────────
C_PURPLE   = RGBColor(0x6A, 0x2C, 0xB0)
C_CYAN     = RGBColor(0x0B, 0x7D, 0x9A)
C_GREEN    = RGBColor(0x06, 0x7A, 0x3D)
C_ORANGE   = RGBColor(0xC0, 0x5A, 0x00)
C_RED      = RGBColor(0xAA, 0x00, 0x00)
C_GREY     = RGBColor(0x44, 0x44, 0x44)
C_BLACK    = RGBColor(0x11, 0x11, 0x11)
C_DARKBLUE = RGBColor(0x1A, 0x37, 0x72)

doc = Document()

# ── Page margins ──────────────────────────────────────────────────────────────
for section in doc.sections:
    section.top_margin    = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin   = Cm(2.5)
    section.right_margin  = Cm(2.0)

# ── Base font ─────────────────────────────────────────────────────────────────
normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(11)

# ── Helpers ───────────────────────────────────────────────────────────────────
def shade_para(para, hex_fill):
    pPr = para._p.get_or_add_pPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:color"), "auto")
    sh.set(qn("w:fill"), hex_fill)
    pPr.append(sh)

def page_break():
    p = doc.add_paragraph()
    run = p.add_run()
    br = OxmlElement("w:br")
    br.set(qn("w:type"), "page")
    run._r.append(br)

def h1(text, color=C_PURPLE):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after  = Pt(4)
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(17)
    run.font.color.rgb = color
    shade_para(p, "EDE7F6")
    return p

def h2(text, color=C_DARKBLUE):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after  = Pt(2)
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(13)
    run.font.color.rgb = color
    return p

def h3(text, color=C_CYAN):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after  = Pt(2)
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(11.5)
    run.font.color.rgb = color
    return p

def para(text, bold=False, color=C_BLACK, size=10.5, indent=0):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after  = Pt(1)
    if indent:
        p.paragraph_format.left_indent = Cm(indent)
    run = p.add_run(text)
    run.bold = bold
    run.font.size = Pt(size)
    run.font.color.rgb = color
    return p

def step(number, action, result_text=""):
    """Checkbox step: ☐  N. ACTION   → Expected: RESULT"""
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after  = Pt(2)
    p.paragraph_format.left_indent  = Cm(0.3)

    # checkbox
    r0 = p.add_run("☐  ")
    r0.font.size  = Pt(13)
    r0.font.color.rgb = RGBColor(0x55, 0x00, 0xAA)

    # step number
    r1 = p.add_run(f"{number}.  ")
    r1.bold = True
    r1.font.size = Pt(10.5)
    r1.font.color.rgb = C_BLACK

    # action text
    r2 = p.add_run(action)
    r2.font.size = Pt(10.5)
    r2.font.color.rgb = C_BLACK

    if result_text:
        r3 = p.add_run(f"   →  Expected: {result_text}")
        r3.font.size = Pt(10)
        r3.font.color.rgb = C_GREEN
        r3.italic = True
    return p

def note(text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent  = Cm(0.6)
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after  = Pt(1)
    shade_para(p, "FFF8E1")
    run = p.add_run("ℹ  " + text)
    run.font.size = Pt(10)
    run.font.color.rgb = C_ORANGE
    return p

def divider():
    p = doc.add_paragraph("─" * 72)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after  = Pt(4)
    for run in p.runs:
        run.font.color.rgb = RGBColor(0xCC, 0xBB, 0xEE)
        run.font.size = Pt(8)


# ═══════════════════════════════════════════════════════════════════════════════
#  COVER PAGE
# ═══════════════════════════════════════════════════════════════════════════════
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("\n\nDataDrishti")
r.bold = True; r.font.size = Pt(32); r.font.color.rgb = C_PURPLE

p2 = doc.add_paragraph()
p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
r2 = p2.add_run("डेटा दृष्टि  —  Data Vision Studio")
r2.font.size = Pt(16); r2.font.color.rgb = C_CYAN

p3 = doc.add_paragraph()
p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
r3 = p3.add_run("\nComplete Feature Testing Manual & Instruction Guide")
r3.bold = True; r3.font.size = Pt(14); r3.font.color.rgb = C_DARKBLUE

p4 = doc.add_paragraph()
p4.alignment = WD_ALIGN_PARAGRAPH.CENTER
r4 = p4.add_run("\nVersion 1.0   |   " + datetime.date.today().strftime("%d %B %Y"))
r4.font.size = Pt(11); r4.font.color.rgb = C_GREY

p5 = doc.add_paragraph()
p5.alignment = WD_ALIGN_PARAGRAPH.CENTER
r5 = p5.add_run("\nPrepared for: Rajasthan Police — DataDrishti Field Testing")
r5.font.size = Pt(11); r5.font.color.rgb = C_GREY

doc.add_paragraph()
shade_para(doc.add_paragraph(
    "INSTRUCTIONS FOR TESTERS:\n"
    "• Work through each section in order.\n"
    "• Tick the ☐ box (click or type ✓) if the step works correctly.\n"
    "• Leave the box empty ☐ if the step fails or the result is wrong.\n"
    "• Note any issue in the margin or in the 'Remarks' column.\n"
    "• Save this file and share it when testing is complete.\n"
    "• Both English and Hindi (हिंदी) samples are tested — follow the sample name shown."
), "E8EAF6")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 1 — SAMPLE DATA LOADING
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 1 — Loading Sample Data  |  नमूना डेटा लोड करना")
para("DataDrishti includes two large built-in samples for offline testing. No internet required.", color=C_GREY)

h2("1A. English Sample — Police District Register 2024-25")
note("This loads 250 rows × 12 columns. Works offline, no Flask needed.")
step(1,  "Open the app in your browser (or click the DataDrishti icon).",
         "Welcome screen appears with cosmic dark background.")
step(2,  "On the Welcome screen, find the 'Police Register (English)' card (highlighted in purple). Click it.",
         "Table loads with 250 rows. Document title shows 'Police District Register 2024-25'.")
step(3,  "Verify the column headers: Sr_No, Officer_Name, Rank, District, Station, Cases_Filed, Cases_Solved, Salary, Experience_Yrs, Rating, Status, Quarter.",
         "All 12 columns visible in the table header row.")
step(4,  "Scroll down to row 43. Check the Salary value.",
         "Salary = 195,000 (this is the intentional outlier row for testing).")
step(5,  "Look for rows where Rating column is blank (rows 18, 49, 80, 111, 142…).",
         "Some Rating cells are empty — these are the intentional missing-value rows.")
step(6,  "Check the bottom status bar.",
         "Shows '250 rows · 12 columns' (or similar count).")

h2("1B. Hindi Sample — पुलिस विभाग कर्मचारी पंजी 2024-25")
note("Same 250-row structure but with Hindi Unicode column headers and values.")
step(7,  "Click 'पुलिस पंजी (हिंदी)' card on the Welcome screen.",
         "Table loads with Hindi headers: क्र_सं, नाम, पद, जिला, थाना, प्रकरण_दर्ज, हल_प्रकरण, वेतन, अनुभव_वर्ष, मूल्यांकन, स्थिति, तिमाही.")
step(8,  "Document title should show 'पुलिस विभाग कर्मचारी पंजी 2024-25'.",
         "Title visible in top bar of the app.")
step(9,  "Verify Devanagari text renders correctly in the table cells (not garbled boxes).",
         "Hindi text displays cleanly with Noto Sans Devanagari font.")

divider()
note("For the rest of this manual, use the ENGLISH sample (Police District Register 2024-25) unless a step says 'Switch to Hindi sample'.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 2 — DOCUMENT TITLE & CUSTOMIZATION
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 2 — Document Title & Customization  |  शीर्षक और अनुकूलन")
para("(English sample must be loaded)", color=C_GREY, size=10)

step(1, "Double-click the document title 'Police District Register 2024-25' at the top of the screen.",
        "Title becomes editable (cursor appears inside).")
step(2, "Change the title to: 'Rajasthan Police — Q1–Q5 Analysis 2024-25'  and press Enter.",
        "New title saves and shows in the header bar.")
step(3, "Click the 'Language' toggle button (EN / हि) in the toolbar.",
        "Interface labels switch to Hindi. Table column headers remain unchanged (they are data, not UI).")
step(4, "Toggle back to English.",
        "UI returns to English labels.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 3 — TABLE NAVIGATION
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 3 — Table Navigation  |  तालिका नेविगेशन")

h2("3A. Sorting")
step(1, "Click the column header 'Salary' once.",
        "Rows sort ascending by Salary (lowest first, ~26,000 at top).")
step(2, "Click 'Salary' again.",
        "Rows sort descending. Row 43 (outlier, Salary = 195,000) moves to the very top.")
step(3, "Click 'Experience_Yrs' header.",
        "Rows re-sort by experience years.")
step(4, "Click 'Officer_Name' header.",
        "Rows sort alphabetically by officer name (A→Z).")

h2("3B. Search / Filter")
step(5, "Find the Search box (top-right of the table area). Type: Jaipur",
        "Only rows where any column contains 'Jaipur' show — District = Jaipur rows appear. Count reduces from 250.")
step(6, "Clear the search. Type: Inspector",
        "Only rows with Rank = Inspector are shown.")
step(7, "Clear the search box.",
        "All 250 rows return.")

h2("3C. Column Resizing & Reorder")
step(8, "Hover over the border between 'Officer_Name' and 'Rank' column headers. Drag right.",
        "Officer_Name column widens.")
step(9, "Click on a cell in the 'Quarter' column. Note the column index shown in the status bar.",
        "Status bar updates to show column info.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 4 — FILTER PANEL
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 4 — Filter Panel  |  फ़िल्टर पैनल")
step(1, "Click the 'Filter' button in the toolbar.",
        "Filter panel slides open on the right side.")
step(2, "Click '+ Add Filter'. Set: Column = District, Type = Text, Value = Jaipur. Click Apply.",
        "Table shows only Jaipur rows (approximately 31 of 250, every 8th row).")
step(3, "Add a second filter: Column = Rank, Value = Inspector. Click Apply.",
        "Table now shows only Inspector rows from Jaipur — further reduced count.")
step(4, "Click 'Clear All Filters'.",
        "All 250 rows return.")
step(5, "Add a numeric filter: Column = Salary, Type = Greater Than, Value = 60000. Apply.",
        "Only rows with Salary > 60,000 remain (Inspectors, Deputy SPs, and the outlier row 43).")
step(6, "Clear all filters.",
        "250 rows restored.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 5 — CHARTS
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 5 — Charts & Visualization  |  चार्ट और दृश्यीकरण")

h2("5A. Bar Chart")
step(1, "Click the 'Chart' button in the toolbar.",
        "Chart panel opens with X Axis / Y Axis drop zones.")
step(2, "Drag column 'District' to the X Axis slot. Drag 'Cases_Filed' to Y Axis slot.",
        "Chart preview appears.")
step(3, "Select chart type: Bar. Click 'Create Chart'.",
        "Bar chart renders showing Cases Filed per District. Jaipur, Jodhpur etc. as bars.")
step(4, "Click 'Download Chart as PNG'.",
        "PNG file downloads to your computer.")

h2("5B. Line Chart — Quarterly Trend")
step(5, "Change X Axis to 'Quarter', Y Axis to 'Cases_Filed'. Type = Line. Click Create.",
        "Line chart shows Q1→Q5 trend. Cases rise from left to right (designed upward trend in data).")
step(6, "Change Y Axis to 'Cases_Solved'. Add it as a second series if option available.",
        "Two lines visible — filed vs solved over time.")

h2("5C. Pie Chart")
step(7, "Change chart type to Pie. Set the column to 'Status'. Click Create.",
        "Pie chart with slices: Active (largest ~78%), On Leave, Retired, Suspended.")
step(8, "Hover over each pie slice.",
        "Tooltip shows exact count and percentage.")

h2("5D. Scatter Plot")
step(9,  "Set X = Experience_Yrs, Y = Salary, Type = Scatter. Click Create.",
         "Scatter plot shows dots. Generally a positive correlation — more experience → higher salary.")
step(10, "Look for the outlier dot far above the cluster.",
         "One dot at ~195,000 Salary stands clearly apart from the rest (row 43 outlier).")

h2("5E. Chart Title & Theme")
step(11, "In the Chart Title box, type: 'Salary vs Experience — All Districts 2024-25'.",
         "Title updates on the chart.")
step(12, "Change 'Color Theme' dropdown to 'Government Blue + Teal'.",
         "Chart re-colours using government blue tones.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 6 — DASHBOARD VIEW
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 6 — Smart Dashboard  |  स्मार्ट डैशबोर्ड")
note("Dashboard auto-generates KPI cards, charts, and a summary from your loaded data.")
step(1, "Click the 'Dashboard' button in the top toolbar.",
        "Dashboard view opens. The table view slides away.")
step(2, "Observe the auto-generated KPI cards at the top.",
        "Cards show: Total Records = 250, Avg Salary ≈ 37,000–42,000, Avg Cases Filed, Avg Rating ≈ 3.9–4.0.")
step(3, "Observe the auto-generated bar/line charts below the KPIs.",
        "Charts show distributions of Rank, District, and quarterly trends.")
step(4, "Click 'Export Dashboard to PNG' button (camera icon).",
        "PNG of the full dashboard downloads.")
step(5, "Click 'Export Dashboard to PDF' button.",
        "PDF of dashboard page downloads.")
step(6, "Click 'Export Dashboard to Excel' button.",
        "Excel file downloads with the underlying data.")
step(7, "Click the 'Back to Table' or 'Sheet' button to return to table view.",
        "Table view restored with all 250 rows.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 7 — ANALYSIS PANEL
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 7 — Analysis Panel  |  विश्लेषण पैनल")
step(1, "Click 'Analysis' in the toolbar.",
        "Analysis panel opens on the right.")
step(2, "Select column 'Salary' from the column dropdown.",
        "Statistics appear: Count=250, Sum, Average (~37,500–42,000), Min=26,000, Max=195,000 (outlier), Median.")
step(3, "Note the Median value vs Mean value.",
        "Median should be much lower than Mean (≈35,000 vs ≈42,000) due to the 195,000 outlier.")
step(4, "Change column to 'Cases_Filed'.",
        "New stats: Count=250, Average, Min, Max shown.")
step(5, "Change column to 'Rating'.",
        "Count < 250 (some nulls excluded). Average ≈ 3.95.")
step(6, "Click 'Run Full Analysis' button (if available).",
        "Correlation matrix or summary table appears for all numeric columns.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 8 — CONDITIONAL FORMATTING
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 8 — Conditional Formatting  |  सशर्त स्वरूपण")
step(1, "Click 'Format' in the toolbar. The Conditional Formatting panel opens.",
        "Panel shows existing rules list (empty initially).")
step(2, "Click '+ Add Rule'. Set: Column = Salary, Condition = Greater Than, Value = 60000, Color = Red.",
        "Rule created.")
step(3, "Click 'Apply Rules'.",
        "Table cells in Salary column where value > 60,000 are highlighted red. Row 43 (195,000) is bright red.")
step(4, "Add another rule: Column = Status, Condition = Equals, Value = Suspended, Color = Orange.",
        "Apply. Suspended rows show orange in Status column.")
step(5, "Add rule: Column = Rating, Condition = Less Than, Value = 3.5, Color = Yellow.",
        "Low-rating rows highlighted yellow in Rating column.")
step(6, "Click 'Clear All Rules'. Apply.",
        "All colour highlights removed — table returns to default appearance.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 9 — FORMULA PANEL (CALCULATIONS)
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 9 — Formula Panel  |  सूत्र पैनल")
step(1, "Click 'Formulas' in the toolbar.",
        "Formula panel opens with function buttons (SUM, AVG, MIN, MAX, COUNT).")
step(2, "Select Function = SUM. Select Column = Salary. Click Calculate.",
        "Result shown: Sum of Salary for all 250 rows. Expected range: ~9,300,000–10,500,000.")
step(3, "Select Function = AVERAGE. Column = Cases_Filed. Calculate.",
        "Average Cases Filed per officer. Expected: approximately 35–55.")
step(4, "Select Function = COUNT. Column = Rating. Calculate.",
        "Count of non-empty Rating values. Expected: ~241 (250 minus the ~9 null rows).")
step(5, "Select Function = MAX. Column = Salary. Calculate.",
        "Result = 195,000 (the outlier row 43).")
step(6, "Select Function = MIN. Column = Salary. Calculate.",
        "Result = 26,000 (lowest Constable salary).")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 10 — INTELLIGENCE PANEL (LOCAL ANALYTICS)
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 10 — Intelligence Panel (Local Analytics)  |  स्थानीय विश्लेषण")
note("Local analytics work offline — no AI needed. Results appear instantly.")
step(1, "Click 'Intelligence' in the toolbar.",
        "Intelligence panel opens with a text input box.")
step(2, "Type: average salary   and press Enter (or click Ask).",
        "Local engine responds with the average of the Salary column: ~₹37,500–42,000.")
step(3, "Type: top 5 districts by cases filed",
        "Response lists districts with highest total Cases_Filed (Jaipur, Jodhpur likely top).")
step(4, "Type: outliers in salary",
        "Response identifies the outlier — Salary = 195,000 at row 43. May also list statistically extreme values.")
step(5, "Type: trend in cases",
        "Response describes the upward trend across Q1→Q5 quarters.")
step(6, "Type: missing values",
        "Response identifies Rating column has ~9 null values.")
step(7, "Type: correlation between salary and experience",
        "Response shows positive correlation (r ≈ 0.4–0.7). More experience → higher salary.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 11 — AI COGNITION ENGINE (Ollama / Online)
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 11 — AI Cognition Engine  |  एआई कॉग्निशन इंजन")
note("Requires Ollama running locally OR an API key configured. If neither is available, skip to Section 12.")

h2("11A. Voice / Tone Presets")
step(1, "In the Intelligence panel, find the Voice / स्वर selector above the chat box.",
        "Three buttons visible: 💬 Friendly, 📋 Official, ⚡ Brief.")
step(2, "Click '📋 Official'.",
        "Button highlighted. AI will respond in formal official language.")
step(3, "Click '💬 Friendly'.",
        "Button highlighted. AI will respond in warm, plain language.")

h2("11B. Grounded Query (Cognition Pipeline)")
step(4, "With Ollama running, type in the AI chat box: Which district has the highest average salary?",
        "System shows: 🧠 Decomposing… → 🔍 Verifying… → ✏ Styling…")
step(5, "Wait for the response to appear.",
        "Response shows the district name with exact average salary figure AND confidence badge (High/Medium/Low).")
step(6, "Look for the step trace below the answer (expandable).",
        "Step trace shows: Plan → Ground → Draft → Verify → Tone badges for each step.")
step(7, "Type: What is the trend in cases filed across quarters?",
        "Response describes Q1→Q5 upward trend with specific numbers. Numbers verified badge appears.")
step(8, "Type a question about data NOT in the table: What is the national crime rate in India?",
        "Abstention message appears: 'I can only answer from your loaded data. This information is not in the table.'")

h2("11C. Hallucination Guard")
step(9,  "Observe the verification badge on any response.",
         "Badge shows ✓ OK (green), ⚠ Warn (yellow), or ✗ Fail (red) for number accuracy.")
step(10, "If a Warn or Fail badge appears, a correction note is shown below the answer.",
         "Unverified numbers are removed or flagged with italic note.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 12 — DATA X-RAY PROFILER (MOAT FEATURE)
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 12 — Data X-Ray Profiler  |  डेटा एक्स-रे प्रोफाइलर")
note("MOAT FEATURE: Auto-profiles every column. Runs in the background after data loads.")
step(1, "With 250-row English sample loaded, click the 'X-Ray' or 'Profile' button in the toolbar.",
        "X-Ray panel opens. Profiling may already be complete (runs in background after load).")
step(2, "Observe the column cards listed.",
        "One card per column. Each shows: type badge, fill%, unique count, top values.")
step(3, "Click the card for column 'Salary'.",
        "Expanded view shows: Type=Number, Min=26000, Max=195000, Mean≈42000, Std Dev, histogram-style bar.")
step(4, "Check the 'Officer_Name' card.",
        "Shows: Type=Text, Unique=30, Fill=100%, Top value = 'Rajesh Kumar' (appears 9 times).")
step(5, "Check the 'Rating' card.",
        "Fill% < 100%. Missing value count shown (~9 nulls).")
step(6, "Look for the KEY COLUMN indicator on 'Sr_No' card.",
        "Sr_No should be flagged as a potential key column (all unique values).")
step(7, "Look for DEPENDENCY MAP section at the bottom of X-Ray.",
        "Shows which columns are correlated or dependent (e.g., Rank → Salary dependence detected).")
step(8, "Check if SIGNATURE COLUMNS are highlighted.",
        "Columns with highly unique or structured values (like Sr_No, Officer_Name) marked as signatures.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 13 — WHAT-IF SIMULATION (MOAT FEATURE)
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 13 — Live What-If Simulation  |  लाइव व्हाट-इफ सिमुलेशन")
note("MOAT FEATURE: Change one value and see ripple effects across related columns instantly.")
step(1, "Click 'What-If' or 'Simulation' in the toolbar.",
        "What-If panel opens with column slider controls.")
step(2, "Find the Salary slider (or input). Change it: increase the average Salary by 10%.",
        "System recalculates: SUM of Salary, Total payroll projected figure updates in real-time.")
step(3, "Find the Cases_Filed slider. Drag it to reduce by 20%.",
        "Cases_Solved projection and solve-rate percentage update instantly.")
step(4, "Click 'Save Scenario' and name it: 'Salary Hike 10% Scenario'.",
        "Scenario saved. It can be recalled later.")
step(5, "Click 'Add Scenario' and create a second scenario: increase Experience filter to minimum 5 years.",
        "Second scenario saved.")
step(6, "Toggle between the two scenarios using the scenario selector.",
        "Numbers in the simulation panel switch between the two saved configurations.")
step(7, "Click 'Reset to Actual Data'.",
        "All simulation values revert to the real loaded data.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 14 — PROVENANCE & AUDIT TIME-MACHINE (MOAT FEATURE)
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 14 — Provenance & Audit Time-Machine  |  उद्गम और लेखापरीक्षा")
note("MOAT FEATURE: Every action is logged with a tamper-evident hash chain.")
step(1, "Click 'Provenance' or 'Audit' in the toolbar.",
        "Audit panel opens. Shows the log of events since data was loaded.")
step(2, "Observe the log entries.",
        "Each entry shows: timestamp, action type, a short hash (FNV-1a chain). E.g., 'DATA_LOAD | 2024-06-15 14:32:01 | #A3F2...'")
step(3, "Perform an action: sort the table by Salary. Return to Provenance panel.",
        "New log entry added for the sort action with new hash.")
step(4, "Click the Time-Machine slider and drag it backward.",
        "Table state reverts to the data as it was at the selected point in time.")
step(5, "Drag slider back to the present (rightmost).",
        "Table returns to current state.")
step(6, "Click 'Checkpoint — Save current state'.",
        "Checkpoint created. A marker appears on the time-machine slider.")
step(7, "Click 'Export Audit PDF'.",
        "PDF downloads containing the full hash-chained audit trail.")
step(8, "Look at the hash values in the log.",
        "Each entry's hash includes the previous hash — forming a tamper-evident chain.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 15 — LOCAL SQL ENGINE
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 15 — Local SQL Engine (AlaSQL)  |  स्थानीय SQL")
note("Requires Flask running (app.py). AlaSQL badge shows 'AlaSQL ✓' in the header when active.")
step(1, "With Flask running, look at the top bar for the SQL engine badge.",
        "Badge shows 'AlaSQL ✓' in cyan/teal colour.")
step(2, "Open the Formulas panel. Run SUM on Salary column.",
        "Under the hood, this now routes through AlaSQL for faster computation on large data.")
step(3, "Open the X-Ray panel.",
        "X-Ray sample count shows the full 250 rows (not capped at 20,000) when AlaSQL is active.")
step(4, "If Flask is not running, the badge shows 'JS Fallback'.",
        "JS fallback mode: all calculations still work, just uses browser JS instead of AlaSQL.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 16 — SMART CLEANUP WIZARD
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 16 — Smart Cleanup Wizard  |  स्मार्ट सफ़ाई विज़ार्ड")
step(1, "Click 'Cleanup' or 'Clean' in the toolbar.",
        "Cleanup Wizard panel opens and automatically scans the 250-row dataset.")
step(2, "Wait for the scan to complete.",
        "Detectors report: Missing values found in 'Rating' (~9 rows). No duplicate rows. Some text trim issues may be detected.")
step(3, "Click 'Fix All Issues'.",
        "Single-action fix: empty Rating cells may be filled with column average or flagged.")
step(4, "Click 'Undo Fix All'.",
        "All changes reverted — original data restored (single undo stack).")
step(5, "Try fixing only the 'Trim Whitespace' issue if detected.",
        "Only whitespace issues fixed, others left untouched.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 17 — PIVOT TABLE
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 17 — Pivot Table Builder  |  पिवट तालिका")
step(1, "Click 'Pivot' in the toolbar.",
        "Pivot table builder opens with drag-and-drop row/column slots.")
step(2, "Drag 'District' to the Rows slot.",
        "District values appear as row labels (Jaipur, Jodhpur, Udaipur…).")
step(3, "Drag 'Rank' to the Columns slot.",
        "Rank values appear as column headers (Constable, Head Constable, ASI…).")
step(4, "Drag 'Salary' to the Values slot. Set aggregation = Average.",
        "Pivot table fills with average salary by District × Rank intersection.")
step(5, "Change aggregation to Count.",
        "Table shows number of officers in each District × Rank cell.")
step(6, "Click 'Export Pivot to Excel'.",
        "Excel file downloads containing the pivot table.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 18 — DATA VALIDATION RULES
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 18 — Data Validation Rules  |  डेटा सत्यापन नियम")
step(1, "Click 'Validation' in the toolbar.",
        "Validation panel opens.")
step(2, "Click '+ Add Rule'. Set: Column = Salary, Rule = Range, Min = 20000, Max = 150000.",
        "Rule created.")
step(3, "Click 'Validate Now'.",
        "Violation report appears: Row 43 (Salary = 195,000) flagged as out-of-range. Count: 1 violation.")
step(4, "Add rule: Column = Rating, Rule = Not Empty.",
        "Run again. ~9 additional violations shown for missing Rating values.")
step(5, "Add rule: Column = Experience_Yrs, Rule = Range, Min = 0, Max = 40.",
        "No violations expected — experience values 1–35 all within range.")
step(6, "Clear all validation rules.",
        "Validation panel reset.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 19 — AGENTS CANVAS (MODULE BUBBLES — ORBIT UI)
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 19 — Agents Canvas  |  एजेंट कैनवास (बबल वर्कफ़्लो)")
note("The Agents view lets you build analysis pipelines by connecting module bubbles.")

h2("19A. Opening the Canvas")
step(1, "Click 'Agents' or the star-node icon in the toolbar.",
        "The canvas view opens — a dark cosmic space with a left Module Drawer panel.")
step(2, "Observe the Module Drawer on the left.",
        "Modules grouped by category: Summarize (purple), Quality (cyan), Transform (violet), Predict (green), Visualize (pink), Report (orange), AI (yellow).")

h2("19B. Simple Single-Module Run — Average Salary")
step(3, "In the Module Drawer, find 'Average' under Summarize. Drag it onto the canvas.",
        "An 'Average' bubble/node appears on the canvas.")
step(4, "Click the bubble to open its configuration panel.",
        "Config shows: Column selector dropdown.")
step(5, "Select Column = Salary. Click 'Run Node'.",
        "Result card appears below/inside the bubble: Average · औसत = [value ~37,500–42,000].")
note("Expected average ≈ 37,500–42,000 for the English Police sample (excluding outlier effect on mean).")

h2("19C. Chained Pipeline — Salary Stats")
step(6, "Drag another module: 'Maximum' (Summarize) onto the canvas.",
        "Second bubble appears.")
step(7, "Drag 'Minimum' onto the canvas.",
        "Third bubble appears.")
step(8, "Click 'Run All' (or the play button).",
        "All three nodes execute. Results: Max = 195,000, Min = 26,000, Avg ≈ 42,000.")

h2("19D. Quality Pipeline — Find Problems")
step(9,  "Drag 'Missing Entries' (Quality) onto canvas. Configure: Column = Rating. Run.",
         "Result: count of missing Rating values (~9 rows listed).")
step(10, "Drag 'Outliers' (Quality). Configure: Column = Salary. Run.",
         "Result: Outlier detected — value 195,000 (row 43) flagged as IQR outlier.")
step(11, "Drag 'Duplicates' (Quality). Configure: Column = Officer_Name. Run.",
         "Result: Repeated names found (since 30 names cycle over 250 rows — each appears ~8–9 times).")

h2("19E. Transform Pipeline — Filter then Sort")
step(12, "Drag 'Filter Rows' (Transform) onto canvas. Configure: Column = District, Condition = =, Value = Jaipur. Run.",
         "Result: ~31 rows matched (all Jaipur rows).")
step(13, "Drag 'Sort' (Transform). Configure: Column = Salary, Direction = Descending. Run.",
         "Result: Table preview of sorted rows — highest Jaipur salary at top.")
step(14, "Connect the Filter output to the Sort input by dragging from the output dot (right side of Filter bubble) to the input dot (left side of Sort bubble).",
         "A bezier curve edge appears connecting the two bubbles. Sort now operates on the filtered result.")
step(15, "Click 'Run All'.",
         "Pipeline executes: Filter first (31 Jaipur rows) → Sort (sorted by salary desc). Preview shows top 5 Jaipur rows by salary.")

h2("19F. Predict Pipeline — Trend Analysis on Cases")
note("This is the key trend analysis example referenced in the manual title.")
step(16, "Drag 'Trend' (Predict) onto canvas. Configure: Column = Cases_Filed. Run.",
         "Result: ↑ Uptrend / ऊर्ध्व प्रवृत्ति. Slope value shown (positive, since data has Q1→Q5 growth built in).")
step(17, "Drag 'Moving Average' (Predict). Configure: Column = Cases_Filed, Window = 5. Run.",
         "Result: Smoothed series — last 3 moving average values shown.")
step(18, "Drag 'Project Next' (Predict). Configure: Column = Cases_Filed, Periods ahead = 3. Run.",
         "Result: Three projected future values shown with R² score.")
step(19, "Drag 'Growth Rate' (Predict). Configure: Column = Cases_Filed. Run.",
         "Result: Average growth rate % per row. Should be positive (upward trend in data).")

h2("19G. Visualize Pipeline — Bar Chart from Grouped Data")
step(20, "Drag 'Group & Total' (Transform). Configure: Group By = District, Aggregate = Cases_Filed, Function = Sum. Run.",
         "Result: Table of 8 districts with total Cases_Filed per district.")
step(21, "Drag 'Bar Chart' (Visualize). Configure: X Axis = District col, Y Axis = Cases_Filed col. Run.",
         "Mini SVG bar chart renders inside the node card. Bars for each district visible.")
step(22, "Drag 'KPI Card' (Visualize). Connect upstream 'Average' node to it. Configure Label = 'Avg Salary'. Run.",
         "KPI card shows the average salary value in large purple text: ~42,000.")

h2("19H. Report Pipeline")
step(23, "Drag 'Excel Export' (Report) onto canvas. Run.",
         "Excel export dialog opens. Click Export — Excel file downloads with full 250-row data.")
step(24, "Drag 'PDF Export' (Report) onto canvas. Run.",
         "PDF export dialog opens. Click Generate — PDF report downloads.")

h2("19I. AI Pipeline")
step(25, "Drag 'Ask' (AI) onto canvas. Run.",
         "AI Intelligence chat panel opens. Type a question — AI responds using the Cognition Engine.")

h2("19J. Normalize Pipeline")
step(26, "Drag 'Normalize' (Transform). Configure: Column = Salary. Run.",
         "Result: Normalized series 0–1. Min (26,000) maps to 0.0, Max (195,000) maps to 1.0. Sample values shown.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 20 — HINDI SAMPLE AGENT RUN
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 20 — Hindi Sample: Agent Pipeline Run  |  हिंदी नमूना: एजेंट पाइपलाइन")
note("Switch to Hindi sample: Click Welcome screen → 'पुलिस पंजी (हिंदी)' card.")
step(1, "Load the Hindi sample. Navigate to Agents canvas.",
        "Canvas opens with Hindi sample data active.")
step(2, "Drag 'Average' (Summarize). Select Column = वेतन (salary). Run.",
        "Average of वेतन column. Same numeric result as English sample (~42,000).")
step(3, "Drag 'Group & Total'. Group By = जिला (district), Aggregate = प्रकरण_दर्ज (cases filed), Function = Sum. Run.",
        "Groups in Hindi: जयपुर, जोधपुर, उदयपुर… with total cases.")
step(4, "Drag 'Pie Chart'. Configure: Column = स्थिति (status). Run.",
        "Pie chart with Hindi status labels: सक्रिय, अवकाश पर, सेवानिवृत्त, निलंबित.")
step(5, "Click the Language toggle → हिंदी (Hindi mode).",
        "Interface labels switch to Hindi. Module names in drawer show Hindi.")
step(6, "Toggle back to English.",
        "UI returns to English. Data still in Hindi Unicode — no change to data.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 21 — EXCEL & PDF EXPORT (DETAILED)
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 21 — Export Features  |  निर्यात सुविधाएँ")
para("Load English sample. Document title: 'Rajasthan Police — Q1–Q5 Analysis 2024-25'", color=C_GREY, size=10)

h2("21A. Excel Export")
step(1, "Click 'Excel' button in the toolbar.",
        "Excel Export dialog opens.")
step(2, "Check: 'Include Data Profile' option (if available). Leave enabled.",
        "Profile sheet will be included in the Excel workbook.")
step(3, "Click 'Export Excel'.",
        "File downloads as: 'Rajasthan_Police_Q1-Q5_Analysis_2024-25_[date].xlsx'")
step(4, "Open the Excel file.",
        "Contains data with 250 rows, 12 columns. Column headers in row 1.")
step(5, "If a 'Profile' sheet is included, click it.",
        "Profile sheet shows column statistics: type, fill%, min, max, mean for numeric columns.")

h2("21B. PDF Export")
step(6,  "Click 'PDF' button in the toolbar.",
          "PDF Export dialog opens with options.")
step(7,  "Set: Page Size = A4, Orientation = Landscape.",
          "Settings update.")
step(8,  "Set: Include Logo = Yes (if logo configured). Include Profile = Yes.",
          "Logo and profile options enabled.")
step(9,  "Type Watermark text: 'CONFIDENTIAL — राजस्थान पुलिस'.",
          "Watermark text saved.")
step(10, "Click 'Generate PDF'.",
          "PDF downloads. Opens with data table, custom title, watermark text visible on each page.")
step(11, "Check the PDF: title page / header shows 'Rajasthan Police — Q1–Q5 Analysis 2024-25'.",
          "Title matches what was set in Section 2.")

h2("21C. Interactive HTML Export")
step(12, "Click 'Export as HTML' (or Interactive Report in menu).",
          "HTML file downloads.")
step(13, "Open the downloaded HTML file in a browser (offline).",
          "Standalone interactive report: sortable table, search, basic charts — all working offline.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 22 — HINDI FONT & KRUTIDEV CONVERSION
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 22 — Hindi Font & Krutidev ↔ Unicode Conversion  |  हिंदी एन्कोडिंग")

h2("22A. Hindi Rendering Test")
step(1, "Load the Hindi sample (पुलिस पंजी).",
        "Table shows Devanagari text in column headers and cell values.")
step(2, "Verify: नाम, पद, जिला, थाना columns display correct Devanagari characters.",
        "Devanagari renders using Noto Sans Devanagari font. No boxes or question marks.")
step(3, "Sort by 'नाम' column (Name).",
        "Names sort in Hindi alphabetical order (अ, आ, इ… sequence).")

h2("22B. Krutidev Conversion Module (in Agents Canvas)")
step(4, "Go to Agents canvas with Hindi sample loaded.",
        "Canvas open.")
step(5, "Drag 'Krutidev ↔ Unicode' (Transform) onto canvas. Configure: Column = नाम, Direction = Unicode → Krutidev. Run.",
        "Result shows converted Krutidev-encoded strings. These will look like ASCII characters — normal Devanagari glyph codes.")
step(6, "Change Direction = Krutidev → Unicode and run on the same output.",
        "Output reverses back to Unicode Devanagari text matching original values.")

h2("22C. Hindi Font Checker (Encoding Tool)")
step(7, "Click 'Cleanup' / 'Hindi Tools' in the toolbar (if a separate tool exists).",
        "Hindi encoding checker opens.")
step(8, "Paste a Krutidev-encoded sample text into the input box. Click 'Convert to Unicode'.",
        "Unicode Devanagari output appears in the result box.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 23 — COMPLETE MINI WORKFLOW (END-TO-END)
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 23 — Complete End-to-End Workflow  |  सम्पूर्ण कार्यप्रवाह")
note("This section tests the full DataDrishti workflow from load → analyse → report.")
para("Use English sample: Police District Register 2024-25", color=C_GREY, size=10)

step(1,  "Load the English sample. Verify 250 rows loaded.",                    "250 rows visible.")
step(2,  "Change document title to: 'Q1–Q5 Police Performance Report 2024-25'.", "Title saved.")
step(3,  "Set Conditional Formatting: Salary > 60000 = Red highlight.",           "Red cells visible on high-salary rows.")
step(4,  "Open Filter panel. Filter Status = Active only.",                       "~195 rows shown (Active officers).")
step(5,  "Go to Analysis panel. Record Average Salary for Active officers.",       "Note the number — should be ~38,000–43,000.")
step(6,  "Clear filter. Open Chart panel. Create Bar chart: District vs Cases_Filed.", "Bar chart shows 8 bars.")
step(7,  "Add chart title: 'Cases Filed by District 2024-25'. Download PNG.",     "PNG file saved.")
step(8,  "Open Agents canvas. Build pipeline: Average(Salary) → KPI Card.",       "KPI card displays average salary.")
step(9,  "Add to pipeline: Trend(Cases_Filed) + Bar Chart(District, Cases_Filed).", "Pipeline runs; trend and chart nodes both show results.")
step(10, "Open Dashboard. Verify auto KPIs and charts are present.",               "Dashboard shows at least 3 KPI cards and 2 charts.")
step(11, "Export Excel with profile sheet.",                                       "Excel file downloads with data + profile.")
step(12, "Export PDF: Landscape, A4, watermark 'DRAFT', title in header.",         "PDF downloads with watermark and title.")
step(13, "Open Provenance panel. Verify all actions logged.",                      "At least 10 log entries with hash chain visible.")
step(14, "Open What-If. Increase Salary by 15%. View projected total payroll.",    "New total payroll shown in simulation.")
step(15, "Reset What-If. Close all panels. App shows clean table view.",           "250 rows, no panels open.")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 24 — MODULE CATALOG QUICK REFERENCE
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 24 — Module Catalog Reference  |  मॉड्यूल कैटलॉग")
para("Quick test — drag each module onto canvas, configure a column, and run. Mark ☐ if result shows correctly.", color=C_GREY, size=10)

h2("Summarize Modules (Purple)")
for name, col, expected in [
    ("Average",          "Salary",         "~₹42,000"),
    ("Sum",              "Salary",         "~₹10,500,000"),
    ("Count",            "Salary",         "250"),
    ("Minimum",          "Salary",         "26,000"),
    ("Maximum",          "Salary",         "195,000"),
    ("Median",           "Salary",         "~₹35,000 (lower than mean due to outlier)"),
    ("Mode",             "Rank",           "Constable (most common rank)"),
    ("Spread (Std Dev)", "Salary",         "~12,000–18,000"),
    ("Range",            "Salary",         "169,000 (195,000 − 26,000)"),
]:
    step("☐", f"{name} → Column: {col}", f"Expected: {expected}")

h2("Quality Modules (Cyan)")
for name, col, expected in [
    ("Missing Entries", "Rating",         "~9 missing rows listed"),
    ("Duplicates",      "Officer_Name",   "30 distinct names each appearing ~8–9 times"),
    ("Unique Values",   "District",       "8 unique districts"),
    ("Outliers (IQR)",  "Salary",         "195,000 flagged as outlier"),
    ("Type Check",      "Salary",         "Dominant type: Number (100%)"),
    ("Clean Text",      "Officer_Name",   "0 cells need trimming (data is clean)"),
]:
    step("☐", f"{name} → Column: {col}", f"Expected: {expected}")

h2("Transform Modules (Violet)")
for name, cfg, expected in [
    ("Filter Rows",        "District = Jaipur",                        "~31 matched rows"),
    ("Sort",               "Salary Descending",                        "Row 43 (195,000) at top"),
    ("Group & Total",      "Group=District, Agg=Salary, Fn=Sum",       "8 groups with salary totals"),
    ("Normalize",          "Salary column",                            "Values 0.0–1.0; 26,000→0.0, 195,000→1.0"),
    ("Krutidev ↔ Unicode", "nāma col, Unicode→Krutidev (Hindi sample)", "Converted Krutidev codes shown"),
]:
    step("☐", f"{name} → {cfg}", f"Expected: {expected}")

h2("Predict Modules (Green)")
for name, cfg, expected in [
    ("Project Next",    "Cases_Filed, k=3",    "3 future projected values with R² score"),
    ("Moving Average",  "Cases_Filed, w=5",    "Smoothed last 3 values displayed"),
    ("Growth Rate",     "Cases_Filed",         "Positive % average growth rate"),
    ("Trend",           "Cases_Filed",         "↑ Uptrend (positive slope)"),
]:
    step("☐", f"{name} → {cfg}", f"Expected: {expected}")

h2("Visualize Modules (Pink)")
for name, cfg, expected in [
    ("Bar Chart",   "X=District, Y=Cases_Filed",       "8 bars, one per district"),
    ("Line Chart",  "X=Sr_No, Y=Salary",               "Line showing salary distribution over serial number"),
    ("Pie Chart",   "Column=Status",                   "4 slices: Active, On Leave, Retired, Suspended"),
    ("Scatter",     "X=Experience_Yrs, Y=Salary",      "Positive correlation visible; 195,000 outlier dot"),
    ("KPI Card",    "Upstream=Average(Salary), Label='Avg Salary'", "Large purple number: ~42,000"),
]:
    step("☐", f"{name} → {cfg}", f"Expected: {expected}")

h2("Report Modules (Orange)")
for name, cfg, expected in [
    ("AI Report",     "No config",   "AI Report panel opens"),
    ("Excel Export",  "No config",   "Excel export dialog opens → file downloads"),
    ("PDF Export",    "No config",   "PDF export dialog opens → file downloads"),
]:
    step("☐", f"{name} → {cfg}", f"Expected: {expected}")

h2("AI Module (Yellow)")
step("☐", "Ask → No config", "AI Intelligence panel opens; type a question")

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 25 — KNOWN LIMITATIONS & NOTES
# ═══════════════════════════════════════════════════════════════════════════════
h1("SECTION 25 — Known Limitations & Notes  |  ज्ञात सीमाएँ")

h2("Online vs Offline Features")
para("✓ FULLY OFFLINE (no internet needed):", bold=True)
para("  • Both large samples (English + Hindi — 250 rows each)")
para("  • All table operations (sort, filter, search)")
para("  • All module computations (Summarize, Quality, Transform, Predict, Visualize)")
para("  • Dashboard, Charts, Conditional Formatting, Pivot, Validation")
para("  • Data X-Ray, What-If Simulation, Provenance")
para("  • Hindi Unicode rendering")
para("  • Excel/PDF/HTML export (requires Flask for server-side PDF generation)")

para("⚠ REQUIRES FLASK (start.bat / start.sh):", bold=True, color=C_ORANGE)
para("  • Server-side PDF export (client-side PDF fallback may be available)")
para("  • Excel export via /api/export/excel endpoint")
para("  • Government sample datasets (Salary/Attendance/Budget cards)")
para("  • AlaSQL SQL engine (lazy-loaded from /static/alasql.min.js)")

para("⚠ REQUIRES OLLAMA (local AI):", bold=True, color=C_ORANGE)
para("  • Cognition Engine grounded AI queries")
para("  • AI Report generation")
para("  • Local analytics still work without Ollama (Section 10)")

h2("Data Notes for English Sample")
para("• Row 43: Salary = 195,000 — intentional outlier to test Outlier Detection and Conditional Formatting")
para("• ~9 rows have null Rating — intentional to test Missing Values and Validation")
para("• Cases grow Q1→Q5 — intentional to test Trend and Moving Average")
para("• 30 officer names cycle over 250 rows — each appears ~8–9 times (tests Duplicates module)")
para("• Rank distribution: 3 Constable : 2 Head Constable : 1 ASI : 1 SI : 1 Inspector : 1 Deputy SP (per 9-row cycle)")

h2("Causal Language Policy")
para("DataDrishti never says 'X causes Y'. The app uses 'associated with', 'linked to', 'correlated with'.", color=C_ORANGE)
para("If you see the word 'causes' anywhere in the app output, please flag it as a bug.", color=C_RED)

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  BACK COVER / SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
h1("Testing Summary Sheet  |  परीक्षण सारांश")
para("After completing all sections, record your summary here:", bold=True)
doc.add_paragraph()

rows_data = [
    ("Section", "Feature", "Steps Tested", "Steps Passed", "Issues Found"),
    ("1",  "Sample Data Loading",          "9",  "", ""),
    ("2",  "Document Title",               "4",  "", ""),
    ("3",  "Table Navigation",             "9",  "", ""),
    ("4",  "Filter Panel",                 "6",  "", ""),
    ("5",  "Charts",                       "12", "", ""),
    ("6",  "Dashboard",                    "7",  "", ""),
    ("7",  "Analysis Panel",               "6",  "", ""),
    ("8",  "Conditional Formatting",       "6",  "", ""),
    ("9",  "Formula Panel",                "6",  "", ""),
    ("10", "Local AI Analytics",           "7",  "", ""),
    ("11", "Cognition Engine (AI)",        "10", "", ""),
    ("12", "Data X-Ray Profiler",          "8",  "", ""),
    ("13", "What-If Simulation",           "7",  "", ""),
    ("14", "Provenance & Audit",           "8",  "", ""),
    ("15", "Local SQL Engine",             "4",  "", ""),
    ("16", "Smart Cleanup Wizard",         "5",  "", ""),
    ("17", "Pivot Table",                  "6",  "", ""),
    ("18", "Data Validation",              "6",  "", ""),
    ("19", "Agents Canvas",                "26", "", ""),
    ("20", "Hindi Sample Agent Run",       "6",  "", ""),
    ("21", "Export Features",              "13", "", ""),
    ("22", "Hindi / Krutidev Conversion",  "8",  "", ""),
    ("23", "End-to-End Workflow",          "15", "", ""),
    ("24", "Module Catalog (all 33)",      "33", "", ""),
    ("",   "TOTAL",                        "~232","", ""),
]

tbl = doc.add_table(rows=len(rows_data), cols=5)
tbl.style = "Table Grid"
for i, row_data in enumerate(rows_data):
    cells = tbl.rows[i].cells
    for j, val in enumerate(row_data):
        cells[j].text = val
        for para_cell in cells[j].paragraphs:
            for run in para_cell.runs:
                run.font.size = Pt(9)
                if i == 0:
                    run.bold = True
                    run.font.color.rgb = C_PURPLE
                elif val == "TOTAL":
                    run.bold = True

doc.add_paragraph()
para("Tester Name: ___________________________________   Date: _______________", size=11)
para("Signature: _____________________________________   Version tested: 1.0", size=11)
doc.add_paragraph()
para("Overall Status:   ☐ Pass — All critical features work", size=11, bold=True)
para("                  ☐ Conditional Pass — Minor issues, no blockers", size=11)
para("                  ☐ Fail — Critical issues found", size=11)

# ── Save ──────────────────────────────────────────────────────────────────────
doc.save(OUT)
import sys
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None
print("Saved:", str(OUT))
print("  Sections: 25  |  Approximate test steps: ~232")
