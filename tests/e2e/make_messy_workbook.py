"""A small messy district register for the browser test (no LibreOffice needed): prints its true answers as JSON.
  python make_messy_workbook.py out.xlsx
Sheet "FY A": block-wise (title row per block, repeated headers, one-cell subtotal lines, signature lines).
Sheet "FY B": merged two-row header, month-total rows, a Block column with spelling variants, NIL amounts, mixed date shapes,
              Hindi digits, rows entered twice. Sheet "Cover": notes. Nothing here is random across runs."""
import datetime as dt, json, random, sys
from openpyxl import Workbook
from openpyxl.styles import Font

R = random.Random(11)
BLOCKS = ['Kishangarh', 'Beawar', 'Pushkar', 'Masuda']
VARIANTS = {'Kishangarh': ['Kishangrah', 'KISHANGARH', 'Kishan Garh'], 'Beawar': ['Byawar', 'BEAWAR', 'Beawer'], 'Pushkar': ['Pushker', 'PUSHKAR'], 'Masuda': ['Masooda', 'MASUDA']}
DEPTS = ['Revenue (Land)', 'Water Supply (PHED)', 'Pension', 'Health']
FIRST = ['Ramesh', 'Suresh', 'Kamla', 'Geeta', 'Salim', 'Mohan', 'Pushpa', 'Dinesh', 'Rekha', 'Hanuman', 'Sunita', 'Prakash']
LAST = ['Gurjar', 'Jat', 'Rawat', 'Meena', 'Sharma', 'Rathore', 'Prajapat', 'Mali', 'Bhati', 'Yadav', 'Khan', 'Saini']
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
HI_FIRST = {'Ramesh': 'रमेश', 'Suresh': 'सुरेश', 'Kamla': 'कमला', 'Geeta': 'गीता', 'Salim': 'सलीम', 'Mohan': 'मोहन', 'Pushpa': 'पुष्पा', 'Dinesh': 'दिनेश', 'Rekha': 'रेखा', 'Hanuman': 'हनुमान', 'Sunita': 'सुनीता', 'Prakash': 'प्रकाश'}
HI_LAST = {'Gurjar': 'गुर्जर', 'Jat': 'जाट', 'Rawat': 'रावत', 'Meena': 'मीणा', 'Sharma': 'शर्मा', 'Rathore': 'राठौड़', 'Prajapat': 'प्रजापत', 'Mali': 'माली', 'Bhati': 'भाटी', 'Yadav': 'यादव', 'Khan': 'खान', 'Saini': 'सैनी'}
HI = str.maketrans('0123456789', '०१२३४५६७८९')
ASOF = dt.date(2026, 1, 31)


def shape(d):
    x = R.random()
    if x < .45: return dt.datetime(d.year, d.month, d.day)
    if x < .65: return f'{d.day:02d}/{d.month:02d}/{d.year}'
    if x < .78: return f'{d.day:02d}-{MON[d.month - 1]}-{str(d.year)[2:]}'
    if x < .90: return f'{d.day:02d}.{d.month:02d}.{d.year}'
    return f'{d.day:02d}/{d.month:02d}/{d.year}'.translate(HI)


def amount(a):
    if a is None: return R.choice([None, 'NIL', '-'])
    x = R.random()
    return a if x < .4 else f'₹ {a:,}' if x < .7 else f'{a}/-' if x < .85 else f'Rs.{a:,}.00'


def hindi(n):
    f, l = n.split()
    return HI_FIRST[f] + ' ' + HI_LAST[l]


def make(path):
    cases = []
    n = 0
    for sheet, (start, end, count) in {'A': (dt.date(2024, 4, 1), dt.date(2025, 3, 31), 120), 'B': (dt.date(2025, 4, 1), dt.date(2026, 1, 20), 160)}.items():
        for _ in range(count):
            n += 1
            d = start + dt.timedelta(days=R.randint(0, (end - start).days))
            took = R.randint(2, 90)
            disp = d + dt.timedelta(days=took)
            status = 'Pending' if disp > ASOF or R.random() < .08 else R.choice(['Disposed', 'Disposed', 'Disposed', 'Rejected'])
            cases.append(dict(sheet=sheet, reg=f'GRV/{d.year}/{n:05d}', date=d, name=f'{R.choice(FIRST)} {R.choice(LAST)}', block=R.choice(BLOCKS), village=f'V{R.randint(1, 9)}',
                              dept=R.choice(DEPTS), amt=R.choice([None, None, R.randint(1000, 90000)]), status=status, disp=None if status == 'Pending' else disp, mob=9000000000 + R.randint(0, 99999999)))
    wb = Workbook(); ws = wb.active; ws.title = 'Cover'; ws.merge_cells('A1:F1'); ws['A1'] = 'District Collectorate — Grievance Register'; ws['A1'].font = Font(bold=True, size=14); ws['A3'] = 'Report as on: 31/01/2026'
    ws['A4'] = 'Sheet FY A is block-wise; FY B has month totals; some applicants were entered twice.'
    # ---- FY A: block-wise
    wa = wb.create_sheet('FY A'); wa.merge_cells('A1:I1'); wa['A1'] = 'GRIEVANCE REGISTER 2024-25 (BLOCK-WISE)'; wa['A2'] = 'District Ajmer | Period: 01/04/2024 to 31/03/2025'
    H = ['Sr. No.', 'Registration No.', 'Date of Registration', 'Name of Applicant', 'Village', 'Department', 'Amount Involved (Rs.)', 'Status', 'Date of Disposal']
    row = 4; dupsA = 0
    for blk in BLOCKS:
        wa.merge_cells(start_row=row, start_column=1, end_row=row, end_column=9); wa.cell(row=row, column=1, value=f'Block: {blk} (Tehsil {blk})').font = Font(bold=True); row += 1
        for c, h in enumerate(H, 1): wa.cell(row=row, column=c, value=h).font = Font(bold=True)
        row += 1; mine = [c for c in cases if c['sheet'] == 'A' and c['block'] == blk]; i = 0
        for c in mine:
            if i and i % 25 == 0:
                for k, h in enumerate(H, 1): wa.cell(row=row, column=k, value=h)
                row += 1
            i += 1
            copies = 2 if R.random() < .06 else 1
            dupsA += copies - 1
            for _ in range(copies):
                nm = c['name'] if _ == 0 else R.choice([c['name'].upper(), 'Shri ' + c['name'], c['name'] + ' ', hindi(c['name']), hindi(c['name'])])
                vals = [i, c['reg'], shape(c['date']), nm, c['village'], c['dept'], amount(c['amt']), R.choice([c['status'], c['status']]) if c['status'] != 'Disposed' else R.choice(['Disposed', 'Disposed', 'disposed', 'Disposed Off']), shape(c['disp']) if c['disp'] else None]
                for k, v in enumerate(vals, 1): wa.cell(row=row, column=k, value=v)
                row += 1
        wa.merge_cells(start_row=row, start_column=1, end_row=row, end_column=9); wa.cell(row=row, column=1, value=f'Total ({blk}): {len(mine)} cases   Pending: {sum(1 for c in mine if c["status"] == "Pending")}'); row += 2
    wa.cell(row=row, column=1, value='Entered by: Block operators    Verified by: ____________    Date: ___/___/2025'); wa.cell(row=row + 1, column=1, value='District Informatics Officer / Signature')
    # ---- FY B: two-row header, totals, variants
    wbk = wb.create_sheet('FY B'); wbk.merge_cells('A1:J1'); wbk['A1'] = 'JAN SHIKAYAT REGISTER — FY 2025-26'; wbk['A2'] = 'Updated up to 31/01/2026'
    for a, b, t in [(1, 3, 'Case'), (4, 5, 'Applicant'), (6, 8, 'Location / Department'), (9, 10, 'Outcome')]:
        wbk.merge_cells(start_row=4, start_column=a, end_row=4, end_column=b); wbk.cell(row=4, column=a, value=t).font = Font(bold=True)
    HB = ['S.No', 'Reg. No', 'Date of Reg', 'Applicant Name', 'Village', 'Block', 'Village2', 'Dept', 'Amt Claimed', 'Current Status']
    HB = ['S.No', 'Reg. No', 'Date of Reg', 'Applicant Name', 'Mobile', 'Block', 'Village', 'Wing', 'Amt Claimed', 'Current Status']
    for c, h in enumerate(HB, 1): wbk.cell(row=5, column=c, value=h).font = Font(bold=True)
    row = 6; k = 0; prev = None; mc = 0; dupsB = 0
    mine = sorted([c for c in cases if c['sheet'] == 'B'], key=lambda c: c['date'])
    for c in mine:
        m = (c['date'].year, c['date'].month)
        if prev and m != prev: wbk.cell(row=row, column=1, value=f'Total for {MON[prev[1] - 1]}-{prev[0]} :'); wbk.cell(row=row, column=2, value=mc); row += 1; mc = 0
        prev = m; k += 1; mc += 1
        copies = 2 if R.random() < .06 else 1
        dupsB += copies - 1
        for _ in range(copies):
            nm = c['name'] if _ == 0 else R.choice([c['name'].lower(), c['name'].upper(), hindi(c['name'])])
            blk = R.choice(VARIANTS[c['block']]) if R.random() < .12 else c['block']
            st = c['status'] if c['status'] != 'Disposed' else R.choice(['Disposed', 'Disposed', 'Closed'])
            vals = [k, c['reg'], shape(c['date']), nm, c['mob'], blk, c['village'], c['dept'], amount(c['amt']), st]
            for q, v in enumerate(vals, 1): wbk.cell(row=row, column=q, value=v)
            row += 1
    wbk.cell(row=row, column=1, value=f'Total for {MON[prev[1] - 1]}-{prev[0]} :'); wbk.cell(row=row, column=2, value=mc); row += 2
    wbk.cell(row=row, column=1, value='GRAND TOTAL'); wbk.cell(row=row, column=2, value=k); wbk.cell(row=row + 2, column=1, value='Verified by: ____________  Signature')
    # ---- Summary sent upward, typed by a clerk: Beawar's case count is 5 too high; every other number is right
    wsm = wb.create_sheet('Summary'); wsm['A1'] = 'Block-wise summary sent to the State'; wsm.append([]); wsm.append(['Block', 'Cases received', 'Pending'])
    cnt = {b: sum(1 for c in cases if c['block'] == b) for b in BLOCKS}; pen = {b: sum(1 for c in cases if c['block'] == b and c['status'] == 'Pending') for b in BLOCKS}
    for b in BLOCKS: wsm.append([b, cnt[b] + (5 if b == 'Beawar' else 0), pen[b]])
    wsm.append(['Total', sum(cnt.values()) + 5, sum(pen.values())])
    wb.save(path)
    pending = {b: sum(1 for c in cases if c['block'] == b and c['status'] == 'Pending') for b in BLOCKS}
    return {'cases': len(cases), 'rowsA': len([c for c in cases if c['sheet'] == 'A']) + dupsA, 'rowsB': len([c for c in cases if c['sheet'] == 'B']) + dupsB, 'dups': dupsA + dupsB, 'pending': pending, 'pending_total': sum(pending.values()),
            'blocks': len(BLOCKS), 'unique_after': len(cases), 'summary_wrong': [['Beawar', 'Cases received', cnt['Beawar'] + 5, cnt['Beawar']]]}


if __name__ == '__main__':
    print(json.dumps(make(sys.argv[1]), default=str))
