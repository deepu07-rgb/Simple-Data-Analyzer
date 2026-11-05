# -*- coding: utf-8 -*-
"""Content of the Stellura user guide, in English and Hindi. tools/build_guide.py turns it into
static/guide/guide.html (opened from inside the app) and docs/Stellura-User-Guide.docx.

Block types:  ("p", en, hi)   ("steps", [(en, hi), ...])   ("list", [(en, hi), ...])
              ("tip", en, hi) ("warn", en, hi)            ("keys", [(keys, en, hi), ...])
Button and tile names are written exactly as they appear in the app, in both languages."""

TITLE = ("Stellura — How to use", "Stellura — उपयोग कैसे करें")
SUBTITLE = ("A free, offline data-analysis tool in English and Hindi", "निःशुल्क, ऑफ़लाइन डेटा-विश्लेषण उपकरण — हिंदी और अंग्रेज़ी में")
CREDIT = "Neeraj Purohit · purohitneeraj87@gmail.com"

SECTIONS = [
 # ------------------------------------------------------------------ 1
 dict(id="welcome", icon="👋", en="Welcome", hi="स्वागत", blocks=[
  ("p", "Stellura turns your Excel and CSV files into clean tables, charts, reports and letters — with a few clicks, in English or Hindi. It runs on **your own computer**. It needs no internet and it never sends your data anywhere.",
        "Stellura आपकी एक्सेल और CSV फ़ाइलों को कुछ ही क्लिक में साफ़ तालिका, चार्ट, रिपोर्ट और पत्रों में बदल देता है — हिंदी या अंग्रेज़ी में। यह **आपके अपने कंप्यूटर** पर चलता है। इंटरनेट नहीं चाहिए और आपका डेटा कहीं नहीं भेजा जाता।"),
  ("list", [("**Clean** a messy file in one step (title rows, totals, old Hindi fonts, “2.5 लाख”, dates).", "बिगड़ी फ़ाइल **एक चरण में साफ़** करें (शीर्षक की पंक्तियाँ, योग, पुराने हिंदी फ़ॉन्ट, “2.5 लाख”, तारीखें)।"),
            ("**Combine** many files into one table.", "कई फ़ाइलों को **एक तालिका में जोड़ें**।"),
            ("**Chart** your data with 25 chart types — click a bar and the table shows those rows.", "25 प्रकार के **चार्ट** बनाएँ — पट्टी पर क्लिक करें तो तालिका में वही पंक्तियाँ दिखती हैं।"),
            ("**Make this month's report** in your office's own Excel format.", "अपने कार्यालय के ही एक्सेल प्रारूप में **इस माह की रिपोर्ट बनाएँ**।"),
            ("See **what changed** since last month, and **pending cases by age**.", "**पिछले माह से क्या बदला** और **आयु के अनुसार लंबित प्रकरण** देखें।"),
            ("Write **letters from data** (Word / PDF) and **find the same person** written in different spellings.", "**डेटा से पत्र** (वर्ड / पीडीएफ) बनाएँ और अलग-अलग वर्तनी में लिखा **एक ही व्यक्ति खोजें**।"),
            ("Open files with **millions of rows**.", "**लाखों पंक्तियों** वाली फ़ाइलें खोलें।")]),
  ("tip", "You do not need to read this whole guide. Start with “Your first 5 minutes”, then read only the section for the job you are doing.",
          "पूरी गाइड पढ़ना ज़रूरी नहीं। “पहले 5 मिनट” से शुरू करें, फिर केवल उसी काम का भाग पढ़ें जो आप कर रहे हैं।"),
 ]),
 # ------------------------------------------------------------------ 2
 dict(id="start", icon="🚀", en="Your first 5 minutes", hi="पहले 5 मिनट", blocks=[
  ("steps", [("Start Stellura (double-click **start.bat**). Your browser opens the Stellura page. Keep the black window open while you work.", "Stellura चालू करें (**start.bat** पर डबल-क्लिक)। आपका ब्राउज़र Stellura का पृष्ठ खोल देगा। काम करते समय काली विंडो खुली रहने दें।"),
             ("On the **Home** screen you see tiles: “What do you want to do?”. Click **Open a file** (फ़ाइल खोलें) and choose an Excel or CSV file — or drag the file onto the page.", "**Home** पर “आप क्या करना चाहते हैं?” के टाइल दिखते हैं। **फ़ाइल खोलें** पर क्लिक करके एक्सेल या CSV फ़ाइल चुनें — या फ़ाइल को पृष्ठ पर खींच लाएँ।"),
             ("Your table appears. Click a column heading's small **ⓘ** to see facts about that column.", "आपकी तालिका दिखती है। किसी कॉलम के शीर्षक के छोटे **ⓘ** पर क्लिक करके उस कॉलम की जानकारी देखें।"),
             ("Click **Charts** (चार्ट). The best chart for your data appears at once. Click a bar — the table shows only those rows.", "**Charts** (चार्ट) पर क्लिक करें। आपके डेटा का सबसे उपयुक्त चार्ट तुरंत दिखता है। किसी पट्टी पर क्लिक करें — तालिका में केवल वही पंक्तियाँ दिखेंगी।"),
             ("Done. To go back to all rows, click **Show all rows** (सभी पंक्तियाँ दिखाएँ).", "बस। सभी पंक्तियों पर लौटने के लिए **सभी पंक्तियाँ दिखाएँ** दबाएँ।")]),
  ("p", "**Language.** Use the language box at the top right: **EN** (English), **हिंदी** (Hindi) or **EN + हिंदी** (both together). Every screen, chart caption and message follows it.",
        "**भाषा।** ऊपर दाईं ओर भाषा-बॉक्स से **EN** (अंग्रेज़ी), **हिंदी** या **EN + हिंदी** (दोनों एक साथ) चुनें। हर स्क्रीन, चार्ट का विवरण और संदेश उसी भाषा में दिखते हैं।"),
  ("p", "**Simple and Pro.** The button **Simple** switches between a clean screen (default) and **Pro**, which also shows the formatting bar, formula bar and every view. Beginners should stay in Simple.",
        "**सरल और प्रो।** **Simple** बटन साफ़-सुथरी स्क्रीन (डिफ़ॉल्ट) और **Pro** के बीच बदलता है; Pro में फ़ॉर्मेटिंग बार, फ़ॉर्मूला बार और सभी दृश्य भी दिखते हैं। नए उपयोगकर्ता Simple में ही रहें।"),
  ("p", "**Search anything: Ctrl+K.** Type a few letters (English or Hindi, for example “combine”, “chart”, “साफ़”) and press **Enter**. It finds every action in Stellura.",
        "**कुछ भी खोजें: Ctrl+K।** कुछ अक्षर लिखें (अंग्रेज़ी या हिंदी में, जैसे “combine”, “chart”, “साफ़”) और **Enter** दबाएँ। Stellura की हर सुविधा मिल जाएगी।"),
  ("p", "**No file yet?** Choose the sample data on the Home screen to try things out.", "**अभी फ़ाइल नहीं है?** आज़माने के लिए Home पर नमूना डेटा चुनें।"),
 ]),
 # ------------------------------------------------------------------ 3
 dict(id="files", icon="📂", en="Opening, saving and large files", hi="फ़ाइल खोलना, सहेजना और बड़ी फ़ाइलें", blocks=[
  ("p", "Stellura opens Excel (.xlsx), CSV and TSV files. Text is kept exactly as written — phone numbers keep their leading zero and Hindi text is never changed.",
        "Stellura एक्सेल (.xlsx), CSV और TSV फ़ाइलें खोलता है। पाठ जैसा लिखा है वैसा ही रहता है — फ़ोन नंबर का शुरुआती शून्य बना रहता है और हिंदी पाठ कभी नहीं बदलता।"),
  ("steps", [("Home → **Open a file**, or drag the file onto the page.", "Home → **फ़ाइल खोलें**, या फ़ाइल को पृष्ठ पर खींचें।"),
             ("If the Excel file has several sheets, choose the sheet you want.", "यदि एक्सेल फ़ाइल में कई शीट हैं तो वांछित शीट चुनें।"),
             ("Files of **10 MB or more** open automatically in **Large File mode** (see the section “Very large files”).", "**10 MB या अधिक** की फ़ाइलें अपने-आप **बड़ी फ़ाइल मोड** में खुलती हैं (देखें “बहुत बड़ी फ़ाइलें”)।")]),
  ("p", "**Save your work as a project.** *More → Projects* saves the table, formatting, filters, steps and audit trail as one **.stellura** file in the folder *Stellura/Projects* of your user folder. Open it later from Home → **Open a project** (प्रोजेक्ट खोलें). Your pinned charts and dashboard are saved inside it too. The previous save is kept as a **.bak** copy.",
        "**काम को प्रोजेक्ट के रूप में सहेजें।** *More → Projects* तालिका, फ़ॉर्मेटिंग, फ़िल्टर, स्टेप और ऑडिट ट्रेल को एक **.stellura** फ़ाइल में आपके यूज़र फ़ोल्डर के *Stellura/Projects* में सहेजता है। बाद में Home → **प्रोजेक्ट खोलें** से खोलें। आपके पिन किए चार्ट और डैशबोर्ड भी उसी में सहेजे जाते हैं। पिछली बचत **.bak** प्रति के रूप में रहती है।"),
  ("p", "**Export.** Use **Excel** to download the table as an Excel file. For a PDF with correct Hindi, use **Print / Save as PDF** from the report or letter screens.",
        "**निर्यात।** तालिका को एक्सेल फ़ाइल के रूप में उतारने के लिए **Excel** बटन उपयोग करें। हिंदी सही दिखने वाले PDF के लिए रिपोर्ट या पत्र स्क्रीन से **Print / Save as PDF** उपयोग करें।"),
  ("warn", "The toolbar's older **PDF** button may show Hindi letters broken. Use **Print / Save as PDF** or a Word file instead.",
           "टूलबार का पुराना **PDF** बटन हिंदी अक्षर टूटे हुए दिखा सकता है। इसकी जगह **Print / Save as PDF** या वर्ड फ़ाइल उपयोग करें।"),
 ]),
 # ------------------------------------------------------------------ 4
 dict(id="clean", icon="🧹", en="Clean a messy file", hi="बिगड़ी फ़ाइल साफ़ करें", blocks=[
  ("p", "Office files often have title rows above the headings, a two-row heading, total rows in the middle, repeated headings, blank cells from merged cells, Hindi digits, numbers like “2.5 लाख”, mixed date styles or old-font Hindi (Krutidev). This tool finds all of these and fixes them together.",
        "दफ़्तर की फ़ाइलों में अक्सर शीर्षक से ऊपर नाम की पंक्तियाँ, दो पंक्ति का शीर्षक, बीच में योग की पंक्तियाँ, दोहराए शीर्षक, मर्ज किए खानों से खाली सेल, हिंदी अंक, “2.5 लाख” जैसी संख्याएँ, मिली-जुली तारीखें या पुराने फ़ॉन्ट (कृतिदेव) का हिंदी होता है। यह उपकरण इन सबको खोजकर एक साथ ठीक कर देता है।"),
  ("steps", [("Open the file, then Home → **Clean a messy file** (बिगड़ी फ़ाइल साफ़ करें).", "फ़ाइल खोलें, फिर Home → **बिगड़ी फ़ाइल साफ़ करें**।"),
             ("Stellura lists what it found: “This file can be tidied: …”. Tick the fixes you want. **Nothing changes until you press Apply.**", "Stellura जो मिला उसकी सूची दिखाता है: “यह फ़ाइल सुधारी जा सकती है: …”। जो सुधार चाहिए उन पर निशान लगाएँ। **Apply दबाने तक कुछ नहीं बदलता।**"),
             ("Press **Apply**. Check the table. If you do not like it, press **Undo**.", "**Apply** दबाएँ। तालिका जाँचें। पसंद न आए तो **Undo** दबाएँ।"),
             ("Optional: **Save these cleaning steps as a recipe**. Next month press **Run on this file** and the same cleaning is repeated.", "वैकल्पिक: **इन सफ़ाई चरणों को रेसिपी के रूप में सहेजें**। अगले माह **Run on this file** दबाएँ — वही सफ़ाई दोहराई जाएगी।")]),
  ("tip", "The **Steps** button at the top lists everything done to the file, in order. Your original file on disk is never changed.",
          "ऊपर का **Steps** बटन फ़ाइल पर किए गए हर काम की क्रम से सूची देता है। डिस्क पर आपकी मूल फ़ाइल कभी नहीं बदलती।"),
  ("p", "This tool works on the table in the editor. For a very large file, first press **Work on a copy**.", "यह उपकरण संपादक की तालिका पर चलता है। बहुत बड़ी फ़ाइल के लिए पहले **प्रति पर काम करें** दबाएँ।"),
 ]),
 # ------------------------------------------------------------------ 5
 dict(id="combine", icon="🧩", en="Combine files", hi="फ़ाइलें जोड़ें", blocks=[
  ("p", "Join many files — for example 40 police stations' monthly sheets — into one table. Columns with the same **meaning** are matched even when the names differ (“थाना”, “Police Station”, “PS Name”). Title rows are skipped.",
        "कई फ़ाइलों — जैसे 40 थानों की मासिक शीट — को एक तालिका में जोड़ें। एक ही **अर्थ** वाले कॉलम नाम अलग होने पर भी मिला दिए जाते हैं (“थाना”, “Police Station”, “PS Name”)। शीर्षक की पंक्तियाँ छोड़ दी जाती हैं।"),
  ("steps", [("Home → **Combine files** (फ़ाइलें जोड़ें).", "Home → **फ़ाइलें जोड़ें**।"),
             ("Add the files (Excel or CSV), or drop them here.", "फ़ाइलें (एक्सेल या CSV) जोड़ें, या यहाँ खींचकर छोड़ें।"),
             ("Check how the columns were matched. For any column that is wrong, choose the correct “Column in this file”, or choose “do not fill this column”.", "देखें कि कॉलम कैसे मिलाए गए। जो कॉलम ग़लत हो उसके लिए सही “Column in this file” चुनें, या “do not fill this column” चुनें।"),
             ("Tick **Add a “Source file” column** if you want to know which row came from which file.", "यदि जानना हो कि कौन-सी पंक्ति किस फ़ाइल से आई, तो **“Source file” कॉलम जोड़ें** पर निशान लगाएँ।"),
             ("Press the combine button. The table opens in the editor.", "जोड़ने का बटन दबाएँ। तालिका संपादक में खुल जाती है।")]),
  ("tip", "If the result would be too big for the editor, save the files as CSV and open them in Large File mode instead.",
          "यदि परिणाम संपादक के लिए बहुत बड़ा हो, तो फ़ाइलों को CSV में सहेजकर बड़ी फ़ाइल मोड में खोलें।"),
 ]),
 # ------------------------------------------------------------------ 6
 dict(id="charts", icon="📊", en="Charts and the table", hi="चार्ट और तालिका", blocks=[
  ("p", "Click **Charts** (or Home → **Charts for my data**). The **Chart Studio** opens beside the table with the best chart for your data already drawn, and a sentence below it explaining what it shows — written from the real numbers.",
        "**Charts** दबाएँ (या Home → **मेरे डेटा के चार्ट**)। तालिका के बगल में **चार्ट स्टूडियो** खुलता है, जिसमें आपके डेटा का सबसे उपयुक्त चार्ट पहले से बना होता है और नीचे एक वाक्य बताता है कि वह क्या दिखाता है — असली संख्याओं से लिखा हुआ।"),
  ("p", "**25 chart types:** column, bar, stacked, 100% stacked, column + line, Pareto (80/20), waterfall, line, area, stacked area, calendar heat map, pie, donut, rose, funnel, treemap, sunburst, scatter (with trend line), bubble, heat map, flow (Sankey), radar, histogram, box plot and a single-number gauge.",
        "**25 प्रकार के चार्ट:** स्तंभ, पट्टी, स्टैक, 100% स्टैक, स्तंभ + रेखा, पैरेटो (80/20), वॉटरफ़ॉल, रेखा, क्षेत्र, स्टैक क्षेत्र, कैलेंडर हीट मैप, पाई, डोनट, गुलाब, फ़नल, ट्रीमैप, सनबर्स्ट, बिखराव (ट्रेंड रेखा सहित), बबल, हीट मैप, प्रवाह (सैंकी), रडार, हिस्टोग्राम, बॉक्स प्लॉट और एक-संख्या वाला गेज।"),
  ("steps", [("Pick a **chart type** from the gallery.", "गैलरी से **चार्ट का प्रकार** चुनें।"),
             ("Under **What to show**, choose the category (or date), the measure (total, average, count, smallest, largest, median) and, if you want, **Split / colour by**.", "**क्या दिखाएँ** में श्रेणी (या तारीख), माप (योग, औसत, गिनती, न्यूनतम, अधिकतम, माध्यिका) और चाहें तो **इसके अनुसार बाँटें / रंग** चुनें।"),
             ("For dates choose **Group dates by**: day, month, quarter, **financial year (Apr–Mar)**, year or weekday.", "तारीख के लिए **तारीख इस प्रकार समूहित** चुनें: दिन, माह, तिमाही, **वित्त वर्ष (अप्रैल–मार्च)**, वर्ष या सप्ताह का दिन।"),
             ("Use **Show only the top** (5, 10, 15…) to keep the biggest groups; the rest are combined as “Others”.", "सबसे बड़े समूह रखने के लिए **केवल शीर्ष दिखाएँ** (5, 10, 15…) उपयोग करें; बाकी “अन्य” में जुड़ जाते हैं।")]),
  ("p", "**Charts are alive:**", "**चार्ट सजीव हैं:**"),
  ("list", [("**Click** a bar, slice, cell or dot → the table shows exactly those rows. **Ctrl+click** adds more. Click again, or press **Show all rows**, to undo.", "किसी पट्टी, टुकड़े, खाने या बिंदु पर **क्लिक** → तालिका में ठीक वही पंक्तियाँ दिखती हैं। **Ctrl+क्लिक** और जोड़ता है। वापस जाने के लिए फिर क्लिक करें या **सभी पंक्तियाँ दिखाएँ** दबाएँ।"),
            ("**Drag** over a scatter chart or histogram (use the select tool at the top right of the chart) to pick a range.", "बिखराव चार्ट या हिस्टोग्राम पर (चार्ट के ऊपर दाएँ चयन औज़ार से) **खींचकर** दायरा चुनें।"),
            ("When you filter the table, the chart redraws from the filtered rows.", "तालिका फ़िल्टर करने पर चार्ट फ़िल्टर की हुई पंक्तियों से दोबारा बनता है।"),
            ("Hold **Ctrl** and scroll to zoom. Hover for exact numbers.", "ज़ूम के लिए **Ctrl** दबाकर स्क्रॉल करें। सटीक संख्याओं के लिए माउस ऊपर ले जाएँ।"),
            ("**Picture** saves the chart as a PNG, **Copy** copies it for Word or PowerPoint, **Data (CSV)** downloads the chart's numbers.", "**चित्र** चार्ट को PNG में सहेजता है, **कॉपी** उसे वर्ड या पावरपॉइंट के लिए कॉपी करता है, **डेटा (CSV)** चार्ट की संख्याएँ उतारता है।")]),
  ("p", "**Auto charts (Insights board).** Press **✨ Auto charts**: Stellura suggests several charts for your data, each with the reason (“Where *station* and *status* overlap most”). Click one to open it. Press **Pin to board** in the Studio to keep the charts you like.",
        "**ऑटो चार्ट (इनसाइट्स बोर्ड)।** **✨ ऑटो चार्ट** दबाएँ: Stellura आपके डेटा के लिए कई चार्ट सुझाता है, हर एक का कारण सहित (“*थाना* और *स्थिति* कहाँ सबसे अधिक मिलते हैं”)। किसी पर क्लिक करके खोलें। पसंद के चार्ट रखने के लिए स्टूडियो में **बोर्ड पर लगाएँ** दबाएँ।"),
  ("p", "**In the table.** Every column heading has an **ⓘ**: facts (filled, blank, different values, total, average, median, unusual values), a spread picture whose bars are clickable filters, the most common values (click one to see only those rows), and for dates the earliest, latest and rows per month. **Right-click a heading** for **data bars**, **colour scale**, **traffic lights**, **Chart this column**, and **Trend line in each row** (a tiny line chart in every row across a block of number columns such as Jan … Dec). Active filters show as chips above the table; press × on a chip to remove it.",
        "**तालिका में।** हर कॉलम के शीर्षक पर **ⓘ** होता है: तथ्य (भरे, खाली, अलग मान, योग, औसत, माध्यिका, असामान्य मान), एक फैलाव-चित्र जिसकी पट्टियाँ क्लिक करने योग्य फ़िल्टर हैं, सबसे आम मान (क्लिक करें तो केवल वही पंक्तियाँ), और तारीख के लिए सबसे पुरानी, सबसे नई और प्रति माह पंक्तियाँ। **शीर्षक पर राइट-क्लिक** करके **डेटा बार**, **रंग-पैमाना**, **ट्रैफ़िक लाइट**, **इस कॉलम का चार्ट** और **हर पंक्ति में ट्रेंड लाइन** (जन … दिस जैसे संख्या-कॉलमों के खंड में हर पंक्ति में छोटा रेखा-चित्र) चुनें। सक्रिय फ़िल्टर तालिका के ऊपर चिप के रूप में दिखते हैं; हटाने के लिए चिप पर × दबाएँ।"),
  ("tip", "Charts always sit on a white card with dark text, so a picture you copy into Word or PowerPoint is easy to read.", "चार्ट हमेशा सफ़ेद कार्ड पर गहरे अक्षरों में रहते हैं, ताकि वर्ड या पावरपॉइंट में चिपकाया चित्र आसानी से पढ़ा जा सके।"),
 ]),
 # ------------------------------------------------------------------ 6a
 dict(id="drivers", icon="🔎", en="What explains this? Bands and % of rows", hi="इसे क्या समझाता है? समूह और % पंक्तियाँ", blocks=[
  ("p", "**🔍 What explains this?** ranks every column by how much of the differences in one number it goes with (for example: what goes with plate waste — the age group, the transport, the province?). The share is **ω² (omega squared)**, corrected for chance, so a column with many values does not win just by having many values.",
        "**🔍 इसे क्या समझाता है?** हर कॉलम को इस आधार पर क्रम देता है कि किसी एक संख्या के अंतर उससे कितने जुड़े हैं (जैसे: थाली में बचे भोजन से क्या जुड़ा है — आयु समूह, वाहन, प्रांत?)। हिस्सा **ω² (ओमेगा स्क्वेयर्ड)** है, जो संयोग के लिए सुधारा गया है, ताकि बहुत मानों वाला कॉलम केवल इसी कारण आगे न आए।"),
  ("steps", [("In the Chart Studio or on the Auto charts board press **🔍 What explains this?** (or Ctrl+K and type “explains”).", "चार्ट स्टूडियो या ऑटो चार्ट बोर्ड पर **🔍 इसे क्या समझाता है?** दबाएँ (या Ctrl+K दबाकर “explains” लिखें)।"),
             ("Choose **the number to explain**. Number columns take part in five equal-count bands.", "**समझाने वाली संख्या** चुनें। संख्या वाले कॉलम पाँच बराबर समूहों में भाग लेते हैं।"),
             ("Read the box: the strongest factor with its lowest and highest group, the next ones, and the columns with almost no link.", "बॉक्स पढ़ें: सबसे मज़बूत कारक, उसका सबसे कम और सबसे अधिक समूह, अगले कारक, और लगभग बिना संबंध वाले कॉलम।"),
             ("Press **📊 Chart** to draw a factor, or **⚖ Fair check** to test it against the others.", "किसी कारक का चार्ट बनाने के लिए **📊 चार्ट**, या दूसरों के मुकाबले जाँचने के लिए **⚖ निष्पक्ष जाँच** दबाएँ।")]),
  ("list", [("Columns **calculated from** the number (they share its name, or almost fix it) are listed apart as results, not causes.", "संख्या **से बने** कॉलम (नाम मिलता है, या वे उसे लगभग तय करते हैं) अलग दिखाए जाते हैं — वे परिणाम हैं, कारण नहीं।"),
            ("A column marked **⚠** may be a **label given by** the number — a tier or grade with hard cut-offs (every “Gold” row has waste ≤ 9.9). Fair comparison does not adjust for it by itself.", "**⚠** वाला कॉलम शायद संख्या **से तय लेबल** है — कठोर सीमाओं वाला स्तर या ग्रेड (हर “Gold” पंक्ति में बचा भोजन ≤ 9.9)। निष्पक्ष तुलना इसे अपने-आप समायोजित नहीं करती।"),
            ("**↳ mostly through …** A column can look strong only because it follows a stronger one: calories go with plate waste because older pupils get bigger meals. Stellura checks every factor **inside the groups of every stronger factor**; if almost nothing is left (under 1%) it says “stands in for” and leaves it out of the list of causes. “Partly through” means part of the link is shared.", "**↳ मुख्यतः … के कारण।** कोई कॉलम केवल इसलिए मज़बूत दिख सकता है कि वह किसी मज़बूत कॉलम के साथ चलता है: कैलोरी बचे भोजन से इसलिए जुड़ी है कि बड़े विद्यार्थियों को बड़ा भोजन मिलता है। Stellura हर कारक को **हर मज़बूत कारक के समूहों के भीतर** जाँचता है; यदि लगभग कुछ न बचे (1% से कम) तो वह “का प्रतिबिंब है” कहता है और उसे कारणों में नहीं गिनता। “आंशिक रूप से” का अर्थ है कि संबंध का कुछ भाग साझा है।"),
            ("**🧩 How a label is made.** For a column marked ⚠, Stellura finds the rule behind it and writes it as a **short list read from the top** — the first line that fits gives the label, the rest is “otherwise”: *1. temperature < 48 → Non-compliant  2. waste < 10 and temperature ≥ 60 and sourcing ≥ 75 → Exemplary  3. waste ≥ 20, or temperature < 55, or cost ≥ 14,000 → Marginal  otherwise → Standard*. Cuts are round numbers, so every row falls under exactly one line. Text columns can be used too (“region is North or East”), and a small exact exception the main rules miss (“waste ≥ 30”) is added when it puts at least 3 rows right. The share shown is checked on **every row** of the file, also for very large files (there the list is learned from a sample that keeps every label).", "**🧩 लेबल कैसे बनता है।** ⚠ वाले कॉलम के लिए Stellura उसके पीछे का नियम खोजता है और उसे **ऊपर से पढ़ी जाने वाली छोटी सूची** के रूप में लिखता है — जो पहली पंक्ति मेल खाए वही लेबल देती है, बाकी “अन्यथा”: *1. तापमान < 48 → Non-compliant  2. बचा भोजन < 10 और तापमान ≥ 60 और स्थानीय खरीद ≥ 75 → Exemplary  3. बचा भोजन ≥ 20, या तापमान < 55, या लागत ≥ 14,000 → Marginal  अन्यथा → Standard*। सीमाएँ गोल संख्याएँ हैं, इसलिए हर पंक्ति ठीक एक पंक्ति के अंतर्गत आती है। पाठ कॉलम भी उपयोग हो सकते हैं (“क्षेत्र North या East है”), और मुख्य नियमों से छूटा कोई छोटा सटीक अपवाद (“बचा भोजन ≥ 30”) जोड़ा जाता है यदि वह कम से कम 3 पंक्तियाँ सही करे। दिखाया गया प्रतिशत फ़ाइल की **हर पंक्ति** पर जाँचा जाता है, बहुत बड़ी फ़ाइलों में भी (वहाँ सूची ऐसे नमूने से सीखी जाती है जिसमें हर लेबल हो)।"),
            ("**Made of other columns.** A text column that is fixed by two or three others together (every combination of them has one value of it) is shown as “made of …”: it sums them up and is never the headline cause.", "**दूसरे कॉलमों से बना।** जो पाठ कॉलम दो-तीन दूसरे कॉलमों से मिलकर तय होता है (उनके हर संयोजन में इसका एक ही मान), उसे “… से बना” दिखाया जाता है: यह उनका सार है और कभी मुख्य कारण नहीं बनता।"),
            ("**🧮 How the columns are built.** At the bottom (and on its own with Ctrl+K → “How are the columns built?”) Stellura lists **formulas** it finds between columns — for example *waste_adjusted_cost = total_cost ÷ (1 − waste ÷ 100)* — and **caps and floors**, values where many rows pile up because the real value was cut off (*17% of meals cost exactly 15,000*). A column calculated from the number you are explaining is moved to the results. On very large files every finding is checked on all rows.", "**🧮 कॉलम कैसे बने हैं।** नीचे (और Ctrl+K → “How are the columns built?” से अलग से भी) Stellura कॉलमों के बीच मिले **सूत्र** दिखाता है — जैसे *waste_adjusted_cost = total_cost ÷ (1 − waste ÷ 100)* — और **ऊपरी/निचली सीमाएँ**, ऐसे मान जहाँ बहुत-सी पंक्तियाँ इसलिए जमा हैं कि असली मान काट दिया गया (*17% भोजन ठीक 15,000 के*)। समझाई जा रही संख्या से गणना किया गया कॉलम परिणामों में चला जाता है। बहुत बड़ी फ़ाइलों में हर निष्कर्ष सभी पंक्तियों पर जाँचा जाता है।")]),
  ("p", "**Number bands.** Put a number with many values (temperature, age, distance) on the x axis and the Studio groups it into ranges (30–40, 40–50 …) by itself; choose the number of groups under **Group the numbers into**. Click a band to see its rows.",
        "**संख्या समूह।** बहुत मानों वाली संख्या (तापमान, आयु, दूरी) को x अक्ष पर रखें, स्टूडियो उसे अपने-आप सीमाओं (30–40, 40–50 …) में बाँट देता है; समूहों की संख्या **संख्याओं को समूहों में बाँटें** में चुनें। किसी समूह पर क्लिक करके उसकी पंक्तियाँ देखें।"),
  ("p", "**% of rows where…** As the measure choose **% of rows where…**, then a condition such as *temperature < 60* or *cost = 15000*. The chart shows the share of rows that meet it in every group — for example the % of meals arriving cold by transport mode.",
        "**% पंक्तियाँ जहाँ…** माप में **% पंक्तियाँ जहाँ…** चुनें, फिर शर्त जैसे *तापमान < 60* या *लागत = 15000*। चार्ट हर समूह में शर्त पूरी करने वाली पंक्तियों का हिस्सा दिखाता है — जैसे वाहन के अनुसार ठंडे पहुँचे भोजन का %।"),
 ]),
 # ------------------------------------------------------------------ 6b
 dict(id="fair", icon="⚖️", en="Is a difference real? (Fair comparison)", hi="क्या अंतर असली है? (निष्पक्ष तुलना)", blocks=[
  ("p", "Two groups often differ only because they are **made up differently**. Example: restaurants with online delivery rate *lower* on average — but delivery is common in cheap restaurants, and cheap restaurants rate lower. Compare delivery and non-delivery restaurants **of the same price range** and delivery is slightly *better*. This is called a **mix effect** (Simpson's paradox). Fair comparison checks for it automatically.",
        "दो समूहों में अंतर अक्सर केवल इसलिए होता है कि उनकी **बनावट अलग** है। उदाहरण: ऑनलाइन डिलीवरी वाले रेस्तराँ का औसत रेटिंग *कम* दिखता है — पर डिलीवरी सस्ते रेस्तराँ में आम है और सस्ते रेस्तराँ की रेटिंग कम होती है। **एक ही मूल्य-श्रेणी** के डिलीवरी और बिना-डिलीवरी वाले रेस्तराँ की तुलना करें तो डिलीवरी थोड़ी *बेहतर* निकलती है। इसे **मिश्रण का असर** (सिम्पसन का विरोधाभास) कहते हैं। निष्पक्ष तुलना इसे अपने-आप जाँचती है।"),
  ("steps", [("Make a chart that compares groups (for example the average rating for “Yes” and “No”), then press **⚖ Fair comparison** in the Chart Studio. Or press Ctrl+K and type “fair”.", "ऐसा चार्ट बनाएँ जो समूहों की तुलना करे (जैसे “Yes” और “No” का औसत रेटिंग), फिर चार्ट स्टूडियो में **⚖ निष्पक्ष तुलना** दबाएँ। या Ctrl+K दबाकर “fair” लिखें।"),
             ("Check the two choices at the top: the **measure to compare** (a number) and **compare groups by**.", "ऊपर के दो चुनाव जाँचें: **तुलना का माप** (संख्या) और **समूह इसके अनुसार**।"),
             ("Stellura picks the other factors to **adjust for** (such as price range or city). Tick or untick them. Tick **Ignore zeros** if 0 means “no value”.", "Stellura **समायोजन** के लिए अन्य कारक (जैसे मूल्य-श्रेणी या शहर) स्वयं चुनता है। उन पर निशान लगाएँ या हटाएँ। यदि 0 का अर्थ “कोई मान नहीं” है तो **शून्य छोड़ें** पर निशान लगाएँ।"),
             ("Read the coloured box. It says in plain words whether the gap **holds**, **shrinks**, **disappears**, **reverses**, or was **hidden**, and which factor causes it.", "रंगीन बॉक्स पढ़ें। यह सरल शब्दों में बताता है कि अंतर **बना रहता है**, **घटता है**, **मिट जाता है**, **उलट जाता है** या **छिपा था**, और कौन-सा कारक इसका कारण है।"),
             ("The table gives the **plain gap** and the **like-for-like gap** with its 95% range. The chart shows the gap inside every price range (or whichever factor matters most).", "तालिका में **सीधा अंतर** और **बराबर समूहों में अंतर** (95% सीमा सहित) है। चार्ट हर मूल्य-श्रेणी (या सबसे महत्वपूर्ण कारक) के भीतर अंतर दिखाता है।")]),
  ("list", [("Works on **very large files** too: the engine counts every row, and the same answer is shown.", "**बहुत बड़ी फ़ाइलों** पर भी चलता है: इंजन हर पंक्ति गिनता है और वही उत्तर दिखता है।"),
            ("**Number columns** you adjust for (temperature, distance) are taken in the shape that fits the data best — 5 bands, a straight line or a curve — chosen automatically by AIC and named under the table; you can also pick one under **Number columns to adjust for, as**.", "जिन **संख्या कॉलमों** के लिए समायोजन हो (तापमान, दूरी) वे उस आकार में लिए जाते हैं जो डेटा पर सबसे अच्छा बैठे — 5 समूह, सीधी रेखा या वक्र — AIC से अपने-आप चुना जाता है और तालिका के नीचे लिखा जाता है; आप **समायोजन के संख्या कॉलम, इस रूप में** में खुद भी चुन सकते हैं।"),
            ("It shows an **association, not a cause**. “Delivery rates higher” does not prove delivery makes food better.", "यह **संबंध दिखाता है, कारण नहीं**। “डिलीवरी की रेटिंग अधिक है” का मतलब यह नहीं कि डिलीवरी से भोजन बेहतर होता है।"),
            ("The result depends on what you adjust for. If an important factor is missing from the list, the answer can still be misleading.", "परिणाम इस पर निर्भर है कि आप किसके लिए समायोजन करते हैं। कोई महत्वपूर्ण कारक सूची में न हो तो उत्तर फिर भी भ्रामक हो सकता है।")]),
 ]),
 # ------------------------------------------------------------------ 7
 dict(id="dashboard", icon="📋", en="Dashboard: PowerPoint, PDF and print", hi="डैशबोर्ड: पावरपॉइंट, PDF और प्रिंट", blocks=[
  ("p", "A dashboard puts the charts you pinned on **one page** with a title, headline numbers and a plain-language reading under each chart — ready for a meeting or a report.",
        "डैशबोर्ड आपके पिन किए चार्ट **एक पृष्ठ** पर शीर्षक, मुख्य संख्याओं और हर चार्ट के नीचे सरल भाषा के विवरण के साथ रखता है — बैठक या रिपोर्ट के लिए तैयार।"),
  ("steps", [("In the Chart Studio, make a chart and press **📌 Pin to board**. Repeat for each chart you want.", "चार्ट स्टूडियो में चार्ट बनाकर **📌 बोर्ड पर लगाएँ** दबाएँ। जितने चार्ट चाहिए उतनी बार दोहराएँ।"),
             ("Press **📋 Dashboard** (or Ctrl+K and type “dashboard”). No charts yet? Press **✨ Add suggested charts**.", "**📋 डैशबोर्ड** दबाएँ (या Ctrl+K में “dashboard” लिखें)। अभी चार्ट नहीं हैं? **✨ सुझाए चार्ट जोड़ें** दबाएँ।"),
             ("Type the **title** and the line under it (office, section, period) directly on the page.", "पृष्ठ पर ही **शीर्षक** और उसके नीचे की पंक्ति (कार्यालय, शाखा, अवधि) लिखें।"),
             ("Choose **Columns** 1, 2 or 3. On each chart: ◀ ▶ move it, ↔ makes it wide, ✎ opens it in the Studio, × removes it. You can write a **note** under any chart.", "**कॉलम** 1, 2 या 3 चुनें। हर चार्ट पर: ◀ ▶ उसे खिसकाते हैं, ↔ चौड़ा करता है, ✎ स्टूडियो में खोलता है, × हटाता है। किसी भी चार्ट के नीचे **टिप्पणी** लिख सकते हैं।"),
             ("Press **⬇ PowerPoint**, **⬇ PDF** or **🖨 Print**.", "**⬇ PowerPoint**, **⬇ PDF** या **🖨 प्रिंट** दबाएँ।")]),
  ("list", [("**PowerPoint:** a cover slide (title and headline numbers) and one slide per chart. Titles and readings are real, editable text; the reading is also in the speaker notes.", "**PowerPoint:** एक आवरण स्लाइड (शीर्षक और मुख्य संख्याएँ) और हर चार्ट की एक स्लाइड। शीर्षक और विवरण असली, संपादन योग्य पाठ हैं; विवरण स्पीकर नोट्स में भी है।"),
            ("**PDF:** A4 landscape pages with the title, numbers and charts. Hindi is exact. The pages are pictures, so you cannot select the text.", "**PDF:** शीर्षक, संख्याओं और चार्ट सहित A4 लैंडस्केप पृष्ठ। हिंदी बिल्कुल सही। पृष्ठ चित्र हैं, इसलिए पाठ चुना नहीं जा सकता।"),
            ("**Print:** the browser's print window; choose “Save as PDF” if you want a file with selectable text.", "**प्रिंट:** ब्राउज़र की प्रिंट विंडो; चयन-योग्य पाठ वाली फ़ाइल चाहिए तो “Save as PDF” चुनें।")]),
  ("tip", "The dashboard follows the table's filters. Filter to one district first, and the whole dashboard shows that district.", "डैशबोर्ड तालिका के फ़िल्टर का अनुसरण करता है। पहले एक ज़िले पर फ़िल्टर करें, तो पूरा डैशबोर्ड उसी ज़िले का दिखेगा।"),
 ]),
 # ------------------------------------------------------------------ 8
 dict(id="autopilot", icon="📈", en="Make this month's report (Report Autopilot)", hi="इस माह की रिपोर्ट बनाएँ (रिपोर्ट ऑटोपायलट)", blocks=[
  ("p", "Every month you fill the same Excel proforma from new data. Show Stellura **last month's finished report together with the data it came from, once**. It works out which calculation produced each cell — count of rows per station, how many were pending, totals, averages, percentages, the total row — and **checks each rule against last month's numbers**. From then on, one click fills this month's report in **your own file, with your formatting**.",
        "हर माह आप नए डेटा से वही एक्सेल प्रोफ़ार्मा भरते हैं। Stellura को **पिछले माह की तैयार रिपोर्ट और उसका डेटा एक बार** दिखाएँ। वह पता लगा लेता है कि हर सेल किस गणना से बना — थाना-वार पंक्तियों की गिनती, कितने लंबित थे, योग, औसत, प्रतिशत, कुल की पंक्ति — और **हर नियम को पिछले माह की संख्याओं से जाँचता है**। उसके बाद एक क्लिक से इस माह की रिपोर्ट **आपकी ही फ़ाइल में, आपकी फ़ॉर्मेटिंग के साथ** भर जाती है।"),
  ("steps", [("**Teach it (once).** Home → **Make this month's report** (इस माह की रिपोर्ट बनाएँ). Choose last month's **filled Excel report**, and **the data used for that report**.", "**सिखाएँ (एक बार)।** Home → **इस माह की रिपोर्ट बनाएँ**। पिछले माह की **भरी हुई एक्सेल रिपोर्ट** और **उस रिपोर्ट के लिए इस्तेमाल हुआ डेटा** चुनें।"),
             ("Read **What I learned**: every rule and how it reproduced last month's number. Cells it could not work out are listed — they are left as they are.", "**What I learned** पढ़ें: हर नियम और उसने पिछले माह की संख्या कैसे दोहराई। जो सेल वह समझ नहीं पाया उनकी सूची दिखती है — वे जैसे हैं वैसे रहते हैं।"),
             ("Type a name, for example “Monthly progress report”, and save the **recipe**.", "एक नाम लिखें, जैसे “मासिक प्रगति रिपोर्ट”, और **रेसिपी** सहेजें।"),
             ("**Every month:** open this month's data, choose your recipe, press **Fill the report**, check the preview and the comparison with last month, then **Download the filled report (Excel)**.", "**हर माह:** इस माह का डेटा खोलें, अपनी रेसिपी चुनें, **रिपोर्ट भरें** दबाएँ, पूर्वावलोकन और पिछले माह से तुलना देखें, फिर **भरी रिपोर्ट (एक्सेल) डाउनलोड करें**।")]),
  ("list", [("Formulas and merged cells in your proforma are **not overwritten**.", "आपके प्रोफ़ार्मा के फ़ॉर्मूले और मर्ज किए खाने **अधिलेखित नहीं होते**।"),
            ("The downloaded file also gets a **comparison sheet** and a **summary sheet** written from the numbers.", "डाउनलोड की फ़ाइल में संख्याओं से लिखी **तुलना शीट** और **सार शीट** भी जुड़ती है।"),
            ("Rounding follows Excel (34.45 becomes 34.5).", "पूर्णांकन एक्सेल जैसा है (34.45 → 34.5)।")]),
  ("warn", "If your proforma has **charts or pictures**, filling keeps tables and formatting but the charts and pictures can be lost. Keep the original for those. **Always check the numbers** before you send a report upwards.",
           "यदि आपके प्रोफ़ार्मा में **चार्ट या चित्र** हैं, तो भरने पर तालिकाएँ और फ़ॉर्मेटिंग बनी रहती हैं पर चार्ट और चित्र खो सकते हैं। उनके लिए मूल फ़ाइल सुरक्षित रखें। रिपोर्ट ऊपर भेजने से पहले **संख्याएँ ज़रूर जाँचें**।"),
 ]),
 # ------------------------------------------------------------------ 9
 dict(id="change", icon="🔍", en="What changed since last month? (Change Radar)", hi="पिछले माह से क्या बदला? (बदलाव रडार)", blocks=[
  ("steps", [("Open **this month's** file. Home → **What changed since last month?** (पिछले माह से क्या बदला?).", "**इस माह की** फ़ाइल खोलें। Home → **पिछले माह से क्या बदला?**"),
             ("Choose **last month's file**.", "**पिछले माह की फ़ाइल** चुनें।"),
             ("Read the summary: how each number moved, and **where the movement is concentrated** (“85% of the rise is in 3 of 8 stations…”). The chart shows the biggest movers.", "सार पढ़ें: हर संख्या कैसे बदली और **बदलाव कहाँ केंद्रित है** (“वृद्धि का 85% 8 में से 3 थानों में…”)। चार्ट सबसे बड़े बदलाव दिखाता है।"),
             ("If both files have an ID column (case number, employee code) Stellura finds it and also lists **new, gone and changed records**. Otherwise choose the matching column in **Match records by**.", "यदि दोनों फ़ाइलों में पहचान कॉलम (प्रकरण संख्या, कर्मचारी कोड) है तो Stellura उसे खोजकर **नए, हटे और बदले रिकॉर्ड** भी दिखाता है। नहीं तो **Match records by** में मिलान का कॉलम चुनें।"),
             ("**Copy summary** copies the sentences; **Another file** compares with a different file.", "**Copy summary** वाक्य कॉपी करता है; **Another file** किसी और फ़ाइल से तुलना करता है।")]),
 ]),
 # ------------------------------------------------------------------ 10
 dict(id="pendency", icon="⏳", en="Pending cases by age (Pendency Radar)", hi="आयु के अनुसार लंबित प्रकरण (लंबित रडार)", blocks=[
  ("steps", [("Open the case register. Home → **Pending cases by age** (आयु के अनुसार लंबित प्रकरण).", "प्रकरण रजिस्टर खोलें। Home → **आयु के अनुसार लंबित प्रकरण**।"),
             ("Check the three choices Stellura made in **Settings**: the **registration date** column, the **status** column and **group by** (station, officer…). Change them if needed.", "**Settings** में Stellura के तीन चुनाव जाँचें: **पंजीयन तारीख** का कॉलम, **स्थिति** का कॉलम और **समूह** (थाना, अधिकारी…)। ज़रूरत हो तो बदलें।"),
             ("Under “Which statuses mean pending?” tick the right ones (for example *लंबित* and *जाँच में*).", "“कौन-सी स्थितियाँ लंबित हैं?” में सही वाली चुनें (जैसे *लंबित* और *जाँच में*)।"),
             ("Set the **As on date**, the **Age limits** (default 30, 90, 180, 365 days) and, if you want, a **Deadline** in days.", "**इस तारीख तक**, **आयु सीमाएँ** (डिफ़ॉल्ट 30, 90, 180, 365 दिन) और चाहें तो दिनों में **समय-सीमा** तय करें।"),
             ("Read the numbers (pending cases, average age, oldest, over 180 days) and the stacked chart. **Click a coloured part of a bar** to open exactly those cases in the sheet. **Past deadline** and **Due within … days** open those cases too.", "संख्याएँ (लंबित प्रकरण, औसत आयु, सबसे पुराना, 180 दिन से अधिक) और स्टैक चार्ट पढ़ें। ठीक उन प्रकरणों को शीट में खोलने के लिए **पट्टी के रंगीन भाग पर क्लिक** करें। **समय-सीमा पार** और **… दिन में देय** भी वे प्रकरण खोलते हैं।"),
             ("Each week press **Save this week's snapshot**. After a few weeks the weekly trend appears.", "हर सप्ताह **इस सप्ताह का स्नैपशॉट सहेजें** दबाएँ। कुछ सप्ताह बाद साप्ताहिक प्रवृत्ति दिखने लगती है।")]),
  ("tip", "**Put this table in the sheet** copies the ageing table into the sheet so you can paste it into your report.", "**यह तालिका शीट में रखें** आयु-तालिका को शीट में रख देता है ताकि आप उसे अपनी रिपोर्ट में चिपका सकें।"),
 ]),
 # ------------------------------------------------------------------ 11
 dict(id="letters", icon="✉️", en="Write letters from data", hi="डेटा से पत्र बनाएँ", blocks=[
  ("p", "Write a letter once, with the column names in double curly brackets. Stellura makes **one letter for every row**, or **one covering letter with a list** (annexure) — as a Word file or through Print / Save as PDF.",
        "पत्र एक बार लिखें, कॉलम के नाम दोहरे कर्ली कोष्ठक में। Stellura **हर पंक्ति का एक पत्र**, या **सूची (अनुलग्नक) सहित एक अग्रेषण पत्र** बना देता है — वर्ड फ़ाइल के रूप में या Print / Save as PDF से।"),
  ("steps", [("Open the file that has the names and details. Home → **Write letters from data** (डेटा से पत्र बनाएँ).", "नाम और विवरण वाली फ़ाइल खोलें। Home → **डेटा से पत्र बनाएँ**।"),
             ("Choose **What do you want?**: one letter for every row, or covering letter with list.", "**What do you want?** चुनें: हर पंक्ति का पत्र, या सूची सहित अग्रेषण पत्र।"),
             ("Choose the **Type of letter** (Reminder notice, Show-cause notice…) to get sample text, and choose its language.", "नमूना पाठ के लिए **पत्र का प्रकार** (अनुस्मारक नोटिस, कारण बताओ नोटिस…) और उसकी भाषा चुनें।"),
             ("Click a column name to put it into the letter, e.g. `{{नाम}}`. Edit the text freely. Names that are not columns are flagged in red.", "पत्र में डालने के लिए कॉलम के नाम पर क्लिक करें, जैसे `{{नाम}}`। पाठ खुलकर बदलें। जो नाम कॉलम नहीं हैं वे लाल रंग से बताए जाते हैं।"),
             ("Press the **Word** button, or **Print / Save as PDF**.", "**Word** बटन, या **Print / Save as PDF** दबाएँ।")]),
  ("list", [("Add a style after a bar: `{{राशि|inr}}` shows ₹1,00,000 (Indian style); `{{दिनांक|date}}` shows 03/04/2025; `{{नाम|upper}}` makes capitals; `{{today}}` is today's date.", "बार के बाद शैली जोड़ें: `{{राशि|inr}}` ₹1,00,000 (भारतीय शैली) दिखाता है; `{{दिनांक|date}}` 03/04/2025 दिखाता है; `{{नाम|upper}}` बड़े अक्षर बनाता है; `{{today}}` आज की तारीख है।"),
            ("Filters apply: only the rows you can see become letters (the first 2,000 rows at most).", "फ़िल्टर लागू होते हैं: केवल दिखने वाली पंक्तियों के पत्र बनते हैं (अधिकतम पहली 2,000 पंक्तियाँ)।"),
            ("The Word file is A4, uses a Devanagari font and puts each letter on its own page.", "वर्ड फ़ाइल A4 है, देवनागरी फ़ॉन्ट उपयोग करती है और हर पत्र अलग पृष्ठ पर रखती है।")]),
  ("warn", "Read at least the first two letters before you print or send them all.", "सभी पत्र छापने या भेजने से पहले कम से कम पहले दो पत्र ज़रूर पढ़ें।"),
 ]),
 # ------------------------------------------------------------------ 12
 dict(id="names", icon="👥", en="Find the same person", hi="एक ही व्यक्ति खोजें", blocks=[
  ("p", "Finds the same person written differently: “राहुल शर्मा”, “Rahul Sharma”, “Rahul Sarma”. It uses the father's name, village or place, age and mobile number as extra evidence. **It shows possible matches only — you confirm every match.**",
        "एक ही व्यक्ति को अलग तरह लिखे नामों में खोजता है: “राहुल शर्मा”, “Rahul Sharma”, “Rahul Sarma”। अतिरिक्त प्रमाण के रूप में पिता का नाम, गाँव या स्थान, आयु और मोबाइल नंबर उपयोग करता है। **यह केवल संभावित मिलान दिखाता है — हर मिलान की पुष्टि आप करते हैं।**"),
  ("steps", [("Open the file with the names. Home → **Find the same person** (एक ही व्यक्ति खोजें).", "नामों वाली फ़ाइल खोलें। Home → **एक ही व्यक्ति खोजें**।"),
             ("Choose the **name column**, and, if you have them, the father's name, place, age and mobile columns.", "**नाम का कॉलम** चुनें, और यदि हों तो पिता का नाम, स्थान, आयु और मोबाइल के कॉलम।"),
             ("Choose: **find people entered twice in this file**, or **match this file with another file** (for example a beneficiary list against an employee list).", "चुनें: **इसी फ़ाइल में दो बार दर्ज लोग खोजें**, या **इस फ़ाइल को दूसरी फ़ाइल से मिलाएँ** (जैसे लाभार्थी सूची को कर्मचारी सूची से)।"),
             ("Read the matches, strongest first. Use the **sensitivity** slider if you see too many or too few. Tick the matches you accept (**Tick all / none**).", "मिलान सबसे मज़बूत से पढ़ें। बहुत अधिक या कम दिखें तो **संवेदनशीलता** स्लाइडर बदलें। जिन मिलानों को मानते हैं उन पर निशान लगाएँ (**सभी चुनें / कोई नहीं**)।"),
             ("Then **Mark them in a new column**, **Join the matched rows side by side**, or (within one file) **Remove the later copy of each**. Undo brings the rows back.", "फिर **नए कॉलम में चिह्नित करें**, **मिले हुए पंक्ति साथ-साथ जोड़ें**, या (एक फ़ाइल में) **हर एक की बाद वाली प्रति हटाएँ**। Undo पंक्तियाँ वापस ले आता है।")]),
  ("warn", "Never act against a person only because of a name match. Confirm with the original record.", "केवल नाम मिलने के आधार पर किसी व्यक्ति के विरुद्ध कार्रवाई कभी न करें। मूल अभिलेख से पुष्टि करें।"),
 ]),
 # ------------------------------------------------------------------ 13
 dict(id="large", icon="🗃️", en="Very large files (millions of rows)", hi="बहुत बड़ी फ़ाइलें (लाखों पंक्तियाँ)", blocks=[
  ("p", "Files of 10 MB or more open in **Large File mode**: the file is read by a fast engine on your PC instead of the browser, so it opens in seconds and scrolls smoothly. Or use Home → **Open a large file** (बड़ी फ़ाइल खोलें).",
        "10 MB या अधिक की फ़ाइलें **बड़ी फ़ाइल मोड** में खुलती हैं: फ़ाइल ब्राउज़र की जगह आपके पीसी पर एक तेज़ इंजन से पढ़ी जाती है, इसलिए सेकंडों में खुलती है और आराम से स्क्रॉल होती है। या Home → **बड़ी फ़ाइल खोलें** उपयोग करें।"),
  ("list", [("**Search** all columns, **sort** by clicking a heading, and add **Filters**.", "सभी कॉलम में **खोजें**, शीर्षक पर क्लिक करके **क्रमबद्ध करें**, और **Filters** जोड़ें।"),
            ("**Charts** works on every row. A chart of 3 million rows opens in about a second. Click a bar and the file view filters to those rows (a purple chip shows the filter).", "**Charts** हर पंक्ति पर चलता है। 30 लाख पंक्तियों का चार्ट लगभग एक सेकंड में खुलता है। पट्टी पर क्लिक करें तो फ़ाइल व्यू उन्हीं पंक्तियों पर फ़िल्टर हो जाता है (बैंगनी चिप फ़िल्टर दिखाती है)।"),
            ("The side panel has **Columns** (facts about each column; the 📊 button charts it), **Group & chart** (count, total, average by a column) and **SQL** (a read-only box for experts).", "साइड पैनल में **Columns** (हर कॉलम की जानकारी; 📊 बटन उसका चार्ट बनाता है), **Group & chart** (किसी कॉलम के अनुसार गिनती, योग, औसत) और **SQL** (विशेषज्ञों के लिए केवल-पढ़ने वाला बॉक्स) हैं।"),
            ("**Work on a copy** brings up to **100,000 matching rows** into the full editor, where Clean, Combine, Autopilot, Letters and the other tools work.", "**प्रति पर काम करें** **1,00,000 तक मेल खाती पंक्तियाँ** पूर्ण संपादक में लाता है, जहाँ सफ़ाई, जोड़ना, ऑटोपायलट, पत्र और अन्य उपकरण चलते हैं।"),
            ("**CSV** and **Excel** download the filtered view. **Save project** keeps your place.", "**CSV** और **Excel** फ़िल्टर किया हुआ व्यू उतारते हैं। **Save project** आपकी स्थिति सहेजता है।")]),
  ("tip", "Filter first (for example one district and one year), then press **Work on a copy**. Smaller data means faster everything.", "पहले फ़िल्टर करें (जैसे एक ज़िला और एक वर्ष), फिर **प्रति पर काम करें** दबाएँ। छोटा डेटा यानी सब कुछ तेज़।"),
  ("p", "Your computer needs enough free memory. 8 GB is comfortable for files of several million rows.", "आपके कंप्यूटर में पर्याप्त खाली मेमोरी चाहिए। कई लाख पंक्तियों की फ़ाइलों के लिए 8 GB पर्याप्त है।"),
 ]),
 # ------------------------------------------------------------------ 14
 dict(id="ai", icon="💬", en="Ask a question and the optional AI", hi="प्रश्न पूछें और वैकल्पिक AI", blocks=[
  ("p", "Home → **Ask a question** (प्रश्न पूछें) lets you type a question about your data in plain words. Many questions are answered by calculation alone. For free-form questions and written summaries, Stellura can use a **local AI model** that runs on your computer through a separate program (Ollama). The badge at the top shows **AI Offline** when it is not available.",
        "Home → **प्रश्न पूछें** से आप अपने डेटा के बारे में सरल शब्दों में प्रश्न लिख सकते हैं। कई प्रश्नों का उत्तर केवल गणना से मिल जाता है। खुले प्रश्नों और लिखित सारांश के लिए Stellura एक **स्थानीय AI मॉडल** उपयोग कर सकता है जो अलग प्रोग्राम (Ollama) के ज़रिए आपके कंप्यूटर पर चलता है। उपलब्ध न होने पर ऊपर का बैज **AI Offline** दिखाता है।"),
  ("list", [("The AI model is **optional** and downloaded separately. Everything else in this guide works without it.", "AI मॉडल **वैकल्पिक** है और अलग से डाउनलोड होता है। इस गाइड की बाकी हर सुविधा उसके बिना चलती है।"),
            ("Sizes: about 1 GB (Lite), 4.7 GB (Best) and more; the computer needs 2–3 GB and about 8 GB of memory respectively. See the installer's AI pack page.", "आकार: लगभग 1 GB (Lite), 4.7 GB (Best) और अधिक; कंप्यूटर में क्रमशः 2–3 GB और लगभग 8 GB मेमोरी चाहिए। इंस्टॉलर का AI पैक पृष्ठ देखें।"),
            ("Your questions and data do not leave your computer.", "आपके प्रश्न और डेटा आपके कंप्यूटर से बाहर नहीं जाते।")]),
  ("warn", "AI answers can be wrong or invented. Treat them as suggestions and check the numbers in the table.", "AI के उत्तर ग़लत या गढ़े हुए हो सकते हैं। उन्हें सुझाव मानें और तालिका में संख्याएँ जाँचें।"),
 ]),
 # ------------------------------------------------------------------ 15
 dict(id="keys", icon="⌨️", en="Quick keys", hi="त्वरित कुंजियाँ", blocks=[
  ("keys", [("Ctrl + K", "Search every action", "हर सुविधा खोजें"),
            ("Click / Ctrl + click", "On a chart: show those rows / add more", "चार्ट पर: वही पंक्तियाँ दिखाएँ / और जोड़ें"),
            ("Ctrl + scroll", "Zoom a chart", "चार्ट ज़ूम करें"),
            ("Esc", "Close a window, or clear a chart selection", "विंडो बंद करें, या चार्ट का चयन हटाएँ"),
            ("Ctrl + Z / Ctrl + Y", "Undo / Redo", "पूर्ववत / फिर से करें"),
            ("Ctrl + O", "Open a file", "फ़ाइल खोलें"),
            ("Ctrl + G", "Go to a cell, e.g. A500", "किसी सेल पर जाएँ, जैसे A500"),
            ("Ctrl + D", "Light / dark appearance", "हल्का / गहरा रंग-रूप"),
            ("Right-click a heading", "Data bars, colour scale, traffic lights, chart, trend line", "डेटा बार, रंग-पैमाना, ट्रैफ़िक लाइट, चार्ट, ट्रेंड लाइन")]),
 ]),
 # ------------------------------------------------------------------ 16
 dict(id="help", icon="🛟", en="Problems and answers", hi="समस्याएँ और उत्तर", blocks=[
  ("list", [("**Nothing opens in the browser.** Make sure the black Stellura window is still open. Open `http://127.0.0.1:5000` in your browser. To stop Stellura use **stop.bat**.", "**ब्राउज़र में कुछ नहीं खुलता।** देखें कि काली Stellura विंडो खुली है। ब्राउज़र में `http://127.0.0.1:5000` खोलें। Stellura बंद करने के लिए **stop.bat** उपयोग करें।"),
            ("**Hindi shows as boxes or broken letters in a PDF.** Use **Print / Save as PDF**, a Word file, or the dashboard PDF. The older toolbar **PDF** button cannot shape Hindi.", "**PDF में हिंदी डिब्बों या टूटे अक्षरों में दिखती है।** **Print / Save as PDF**, वर्ड फ़ाइल या डैशबोर्ड PDF उपयोग करें। टूलबार का पुराना **PDF** बटन हिंदी सही नहीं बना पाता।"),
            ("**Old Hindi font (Krutidev) looks like English symbols.** Use Home → **Clean a messy file**; it converts it to Unicode Hindi.", "**पुराने फ़ॉन्ट (कृतिदेव) का हिंदी अंग्रेज़ी चिह्नों जैसा दिखता है।** Home → **बिगड़ी फ़ाइल साफ़ करें** उपयोग करें; वह उसे यूनिकोड हिंदी में बदल देता है।"),
            ("**A tool says “works on the editor”.** You are in Large File mode. Press **Work on a copy** first.", "**कोई उपकरण “संपादक पर चलता है” कहता है।** आप बड़ी फ़ाइल मोड में हैं। पहले **प्रति पर काम करें** दबाएँ।"),
            ("**A chart shows fewer groups than I expected.** Check **Show only the top** and the table filters; the caption says when groups are combined as “Others”.", "**चार्ट में अपेक्षा से कम समूह हैं।** **केवल शीर्ष दिखाएँ** और तालिका के फ़िल्टर देखें; विवरण बताता है कि कब समूह “अन्य” में जोड़े गए।"),
            ("**I changed something by mistake.** Press **Undo**. The **Steps** list shows what was done; your original file on disk is never changed.", "**ग़लती से कुछ बदल गया।** **Undo** दबाएँ। **Steps** सूची बताती है कि क्या किया गया; डिस्क पर आपकी मूल फ़ाइल कभी नहीं बदलती।")]),
  ("p", "Questions or ideas: Neeraj Purohit, purohitneeraj87@gmail.com", "प्रश्न या सुझाव: नीरज पुरोहित, purohitneeraj87@gmail.com"),
 ]),
 # ------------------------------------------------------------------ 17
 dict(id="privacy", icon="🔒", en="Your data and your responsibility", hi="आपका डेटा और आपकी ज़िम्मेदारी", blocks=[
  ("list", [("Stellura works **offline**. Your files, reports and questions are not sent anywhere. The page you see is served by a small program on your own computer (address 127.0.0.1).", "Stellura **ऑफ़लाइन** चलता है। आपकी फ़ाइलें, रिपोर्ट और प्रश्न कहीं नहीं भेजे जाते। जो पृष्ठ आप देखते हैं वह आपके अपने कंप्यूटर के एक छोटे प्रोग्राम से आता है (पता 127.0.0.1)।"),
            ("Protect your files: use a password on the computer, keep backups, and keep confidential projects (**.stellura**) in a safe folder.", "अपनी फ़ाइलों की सुरक्षा करें: कंप्यूटर पर पासवर्ड रखें, बैकअप रखें और गोपनीय प्रोजेक्ट (**.stellura**) सुरक्षित फ़ोल्डर में रखें।"),
            ("**Check important results yourself** before sending a report, taking action against a person, or presenting numbers to others. Stellura helps you work faster; the responsibility for the result stays with you.", "रिपोर्ट भेजने, किसी व्यक्ति के विरुद्ध कार्रवाई करने या दूसरों को संख्याएँ दिखाने से पहले **महत्वपूर्ण परिणाम स्वयं जाँचें**। Stellura आपका काम तेज़ करता है; परिणाम की ज़िम्मेदारी आपकी ही रहती है।"),
            ("Please read the **End User License Agreement** (EULA) that came with Stellura.", "कृपया Stellura के साथ आया **अंतिम उपयोगकर्ता लाइसेंस समझौता** (EULA) पढ़ें।")]),
 ]),
]
