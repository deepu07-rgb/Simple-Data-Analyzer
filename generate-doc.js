const { Document, Packer, Paragraph, TextRun, Header, Footer, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, PageNumber, WidthType, ShadingType, BorderStyle,
  PageOrientation, SectionType } = require("docx");
const fs = require("fs");

// Palette - GO-1 Graphite Orange (proposal/product doc)
const P = {
  primary: "1A2330",
  body: "2C3E50",
  secondary: "607080",
  accent: "D4875A",
  surface: "F8F0EB",
  white: "FFFFFF",
  cover: {
    titleColor: "FFFFFF",
    subtitleColor: "B0B8C0",
    metaColor: "90989F",
    footerColor: "687078",
  },
  table: {
    headerBg: "1A2330",
    headerText: "FFFFFF",
    accentLine: "D4875A",
    innerLine: "DDD0C8",
    surface: "F8F0EB",
  },
};

const c = (hex) => hex.replace("#", "");

// Border helpers
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, color: c(P.primary), size: 32, font: { ascii: "Times New Roman", eastAsia: "SimHei" } })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, color: c(P.primary), size: 28, font: { ascii: "Times New Roman", eastAsia: "SimHei" } })],
  });
}

function bodyPara(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })],
  });
}

function bulletPara(text) {
  return new Paragraph({
    spacing: { line: 312, after: 60 },
    indent: { left: 600, hanging: 300 },
    children: [
      new TextRun({ text: "\u2022  ", size: 24, color: c(P.accent), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } }),
      new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } }),
    ],
  });
}

function boldBulletPara(boldText, normalText) {
  return new Paragraph({
    spacing: { line: 312, after: 60 },
    indent: { left: 600, hanging: 300 },
    children: [
      new TextRun({ text: "\u2022  ", size: 24, color: c(P.accent), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } }),
      new TextRun({ text: boldText, bold: true, size: 24, color: c(P.primary), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } }),
      new TextRun({ text: normalText, size: 24, color: c(P.body), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } }),
    ],
  });
}

function spacer(twips = 200) {
  return new Paragraph({ spacing: { before: twips } });
}

// Feature table builder
function featureTable(rows) {
  const headerCells = ["Feature", "Description"].map(text =>
    new TableCell({
      shading: { type: ShadingType.CLEAR, fill: c(P.table.headerBg) },
      margins: { top: 80, bottom: 80, left: 140, right: 140 },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 22, color: c(P.table.headerText), font: { ascii: "Times New Roman", eastAsia: "SimHei" } })] })],
    })
  );

  const dataRows = rows.map((row, idx) =>
    new TableRow({
      children: row.map(text =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: idx % 2 === 0 ? c(P.table.surface) : c(P.white) },
          margins: { top: 60, bottom: 60, left: 140, right: 140 },
          children: [new Paragraph({ children: [new TextRun({ text, size: 21, color: c(P.body), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })] })],
        })
      ),
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: c(P.table.accentLine) },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: c(P.table.accentLine) },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: c(P.table.innerLine) },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({ children: headerCells, tableHeader: true }), ...dataRows],
  });
}

// ─── COVER (R1 Pure Paragraph Left, GO-1 palette) ───
function buildCover() {
  const titleLines = ["Simple Data", "Analyser"];
  const coverChildren = [];

  // Top spacing
  coverChildren.push(new Paragraph({ spacing: { before: 4000 } }));

  // Title
  titleLines.forEach((line, i) => {
    coverChildren.push(new Paragraph({
      spacing: { line: 1012, lineRule: "atLeast", after: i === titleLines.length - 1 ? 100 : 0 },
      children: [new TextRun({ text: line, bold: true, size: 80, color: c(P.cover.titleColor), font: { ascii: "Times New Roman", eastAsia: "SimHei" } })],
    }));
  });

  // Accent line
  coverChildren.push(new Paragraph({
    indent: { left: 100, right: 5600 },
    border: { top: { style: BorderStyle.SINGLE, size: 18, color: c(P.accent), space: 20 } },
    spacing: { before: 200, after: 300 },
  }));

  // Subtitle
  coverChildren.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: "Comprehensive Data Analysis & Visualization Tool", size: 32, color: c(P.cover.subtitleColor), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })],
  }));

  coverChildren.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: "Multilingual Support: Hindi & English", size: 26, color: c(P.cover.metaColor), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })],
  }));

  // Bottom meta
  coverChildren.push(new Paragraph({ spacing: { before: 3000 } }));

  coverChildren.push(new Paragraph({
    children: [new TextRun({ text: "Developed by: Neeraj Purohit", size: 24, color: c(P.cover.footerColor), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })],
  }));

  coverChildren.push(new Paragraph({
    children: [new TextRun({ text: "Senior Assistant, Rajasthan Police", size: 22, color: c(P.cover.footerColor), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })],
  }));

  coverChildren.push(new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({ text: "Version 1.0 | 2026", size: 20, color: c(P.cover.footerColor), font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })],
  }));

  // Wrap in full-page table
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        width: { size: 100, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: c(P.primary) },
        verticalAlign: "top",
        borders: allNoBorders,
        children: coverChildren,
      })],
    })],
  })];
}

// ─── BODY CONTENT ───
function buildBody() {
  const children = [];

  // ─── 1. Introduction ───
  children.push(heading1("1. Introduction"));
  children.push(bodyPara("Simple Data Analyser is a powerful, lightweight, and fully offline data analysis and visualization tool designed to empower government officials, data operators, and analysts with instant spreadsheet-like capabilities directly in their web browser. Built as a single self-contained HTML file, the application requires no installation, no internet connection for core operations, and no specialized software licenses, making it an ideal solution for environments where IT infrastructure is limited or restricted."));
  children.push(bodyPara("The application has been specifically designed keeping in mind the needs of Hindi-speaking government personnel across India, particularly those working in Rajasthan Police and other state departments. It provides full multilingual support for both Hindi and English, including legacy Hindi font encodings such as Krutidev and Devlys, as well as modern Unicode/Mangal fonts, with automatic conversion between these formats. This ensures that data stored in older Hindi encoding systems can be seamlessly processed, analyzed, and converted without requiring any external tools."));
  children.push(bodyPara("With a clean, minimalist interface inspired by professional business intelligence tools like Power BI and Tableau, Simple Data Analyser bridges the gap between complex data analysis software and the practical needs of field-level officers who require quick, reliable data insights without the steep learning curve of enterprise-grade tools."));

  // ─── 2. Problem Statement ───
  children.push(heading1("2. Problem Statement & How This App Helps"));
  children.push(bodyPara("In government offices, particularly in law enforcement and administrative departments across Rajasthan and other Hindi-speaking states, data analysis is typically performed using one of two approaches: manual paper-based calculations or complex software like Microsoft Excel that requires licenses, installations, and significant training. Both approaches present serious challenges that directly impact productivity and decision-making speed."));
  children.push(heading2("2.1 Challenges with Current Workflow"));
  children.push(bulletPara("Manual data processing on paper or in basic text editors is extremely time-consuming. A simple task like finding the average salary across 200 employees, identifying duplicate entries, or filtering records by department can take 30 minutes to several hours when done manually, whereas Simple Data Analyser completes these operations in under 5 seconds."));
  children.push(bulletPara("Microsoft Excel, while powerful, requires software installation, active licenses, and significant training. Many field offices and police stations do not have Excel installed, and procurement of licenses involves bureaucratic delays. Additionally, Excel does not natively support Hindi legacy fonts like Krutidev and Devlys without additional plugins or conversion tools."));
  children.push(bulletPara("Data received from different departments often comes in different Hindi encoding formats. Converting between Krutidev, Devlys, and Unicode requires separate conversion utilities, adding yet another step to an already cumbersome workflow. Officers waste significant time just making data readable before they can even begin analysis."));
  children.push(bulletPara("Generating professional reports with conditional highlighting for PDF or Excel distribution typically requires advanced Excel skills. Most constables and assistant-level staff lack this expertise, forcing them to either submit plain unformatted reports or depend on IT staff, creating bottlenecks."));

  children.push(heading2("2.2 How Simple Data Analyser Solves These Problems"));
  children.push(bodyPara("Simple Data Analyser addresses every one of these pain points through a single, self-contained application that runs in any modern web browser. It eliminates the need for software installation, license procurement, and specialized training. Officers can open the HTML file on any computer, paste their data from any source, and immediately begin analysis."));
  children.push(bulletPara("Reduces data analysis time from hours to seconds. Operations like filtering 10,000 rows by a specific condition, calculating column statistics, or finding duplicate entries are completed instantaneously with a single click, compared to 30-60 minutes of manual work."));
  children.push(bulletPara("Built-in Hindi font conversion between Krutidev, Devlys, and Unicode eliminates the need for separate encoding conversion tools. Officers can import data in any Hindi encoding and convert it to the required format with a single button click."));
  children.push(bulletPara("Conditional formatting with visual color highlighting allows officers to instantly identify data patterns, outliers, and critical values. A simple rule like 'Highlight all salaries above 50,000 in yellow' is applied in seconds and the colors are preserved when exporting to both Excel and PDF."));
  children.push(bulletPara("Professional PDF and Excel export with A4, Letter, and Legal size support means officers can generate distribution-ready reports without any formatting expertise. The exported files maintain all conditional formatting highlights, making reports immediately presentable to senior officials."));
  children.push(bulletPara("Works completely offline after the initial file is saved. No internet connection, no server, no database required. This is critical for police stations and remote offices where connectivity is unreliable."));

  // ─── 3. Multilingual Support ───
  children.push(heading1("3. Multilingual Support: Hindi & English"));
  children.push(bodyPara("One of the most distinctive and valuable features of Simple Data Analyser is its comprehensive multilingual support for both Hindi and English data. In government departments across Rajasthan and other Hindi-speaking states, data is frequently stored and transmitted in Hindi using a variety of font encoding systems. The application supports all major Hindi font encodings and provides automatic conversion between them, making it possible to work with data from any source regardless of its encoding format."));

  children.push(heading2("3.1 Supported Hindi Font Encodings"));
  children.push(boldBulletPara("Krutidev: ", "One of the most widely used legacy Hindi font encodings in Indian government offices. Krutidev uses a non-standard character mapping where Hindi characters are represented using English keyboard positions. Data typed in Krutidev appears as Hindi when viewed with the Krutidev font but shows as garbled English characters when viewed in standard Unicode applications. Simple Data Analyser can automatically convert Krutidev-encoded text to Unicode for proper display and processing."));
  children.push(boldBulletPara("Devlys: ", "Another popular legacy Hindi font encoding, similar in concept to Krutidev but with a different character mapping table. Devlys fonts are commonly found in older government records and police station documents. The application handles Devlys-to-Unicode conversion seamlessly, preserving all character integrity during the process."));
  children.push(boldBulletPara("Unicode / Mangal: ", "The modern standard for Hindi text encoding. Unicode represents Hindi characters using their standardized code points, ensuring compatibility across all modern applications, operating systems, and web browsers. Mangal is the standard Unicode Hindi font pre-installed on most Windows systems. All data processed in Simple Data Analyser can be exported in Unicode format for maximum compatibility."));

  children.push(heading2("3.2 Conversion Capabilities"));
  children.push(bodyPara("The Hindi Font Conversion module allows users to select a source font encoding (Krutidev, Devlys, or Unicode) and a target font encoding, then apply the conversion to a specific column or all text columns simultaneously. This bidirectional conversion capability means that officers can:"));
  children.push(bulletPara("Convert legacy Krutidev or Devlys data to Unicode for use in modern applications and email communication."));
  children.push(bulletPara("Convert Unicode Hindi text back to Krutidev or Devlys when data needs to be entered into older government systems that only support legacy encodings."));
  children.push(bulletPara("Process mixed-encoding datasets where some columns are in Unicode and others are in Krutidev by selectively converting individual columns."));

  // ─── 4. Core Features ───
  children.push(heading1("4. Core Features & Functionalities"));
  children.push(bodyPara("Simple Data Analyser provides a comprehensive suite of data analysis, visualization, and export tools organized into seven core functional modules. Each module is accessible through the intuitive sidebar navigation and has been designed for maximum usability with minimal learning curve."));

  // Feature table
  children.push(featureTable([
    ["Data Import", "Paste CSV/TSV from clipboard, drag-and-drop CSV/Excel files, auto-detect delimiters and column types"],
    ["Hindi Font Support", "Krutidev/Devlys/Unicode bidirectional conversion, per-column or all-columns application"],
    ["Column Analysis", "Min, Max, Average, Sum, Count for numeric columns; frequency analysis for text columns"],
    ["Filtering System", "Per-column value selection, text search, numeric range filters (GT, LT, EQ, Between), multi-layer stacking"],
    ["Conditional Formatting", "Color-based cell highlighting with 6 presets + custom picker, multiple simultaneous rules, visible in exports"],
    ["Data Cleanup", "Remove duplicates, remove empty rows, trim whitespace, find-and-replace across columns"],
    ["Chart Builder", "Bar, Line, Pie, Scatter, Area charts with drag-and-drop column assignment and animated rendering"],
    ["Excel Export", "Export to .xlsx format with conditional formatting colors preserved as cell background fills"],
    ["PDF Export", "Export to PDF with A4/Letter/Legal sizes, landscape/portrait orientation, formatting colors preserved"],
    ["Save/Load", "Persist entire application state to browser localStorage, auto-load on next session"],
    ["Virtual Scrolling", "Handle 10,000+ rows without performance degradation using efficient viewport rendering"],
    ["Responsive Design", "Collapsible sidebar, touch-friendly controls, full functionality on mobile and tablet devices"],
  ]));

  // ─── 5. Detailed Feature Descriptions ───
  children.push(heading1("5. Detailed Feature Descriptions"));

  children.push(heading2("5.1 Data Import & Parsing"));
  children.push(bodyPara("The data import module supports three primary methods of data entry, each designed to accommodate the diverse ways in which government data is typically received and stored. The clipboard paste feature allows officers to copy tabular data from any source, including emails, PDF documents, and other applications, and paste it directly into the analyser. The system automatically detects the delimiter, whether it is commas (CSV), tabs (TSV), or semicolons, and correctly parses quoted fields containing delimiters within the data."));
  children.push(bodyPara("For file-based imports, the drag-and-drop zone accepts CSV, TSV, XLSX, and XLS files. The Excel file parsing uses the SheetJS library to read workbook data directly in the browser, extracting the first sheet automatically. Column types are auto-detected by sampling the first 100 rows: columns where more than 80% of values are numeric are classified as number columns, columns with more than 80% valid date strings are classified as date columns, and all others are treated as text. This automatic classification enables the application to apply appropriate numeric comparisons, sorting, and statistical calculations without any manual configuration."));
  children.push(bodyPara("Row lengths are automatically normalized to match the header count, padding shorter rows with empty values and truncating longer rows. Empty rows are filtered out during import to prevent blank entries from skewing analysis results. A sample dataset of 202 employee records is included for demonstration purposes, allowing new users to immediately explore all features without needing to prepare their own data first."));

  children.push(heading2("5.2 Filtering System"));
  children.push(bodyPara("The filtering module provides a powerful multi-layer filtering system that enables officers to drill down into their data with precision. Filters can be applied on a per-column basis, and multiple filters on different columns stack together, meaning only rows that satisfy all active filter conditions are displayed. This AND-logic stacking allows for highly specific data subsets, such as 'Show all Police department employees with salary between 30,000 and 50,000 who joined after 2020'."));
  children.push(bodyPara("Six filter types are available for each column. The 'Select Values' option displays a checklist of all unique values in the column, allowing users to check or uncheck individual values. The 'Text Contains' filter performs case-insensitive substring matching, useful for finding partial name matches or department keywords. The numeric filters, 'Greater Than', 'Less Than', and 'Equal To', apply mathematical comparisons and automatically handle both numeric and text columns appropriately. The 'Between' filter accepts a minimum and maximum value, creating an inclusive range filter. Active filters are displayed as removable chips below the filter controls, providing clear visibility of which filters are currently applied and allowing one-click removal of individual filters."));

  children.push(heading2("5.3 Conditional Formatting"));
  children.push(bodyPara("Conditional formatting is one of the most impactful features for government reporting, as it allows officers to visually highlight critical data points directly in the table. When a conditional formatting rule is applied, matching cells receive a prominent background color with a left border indicator, making them immediately identifiable at a glance. The formatting is not merely visual decoration; it serves a functional purpose by drawing attention to data that meets specific criteria, such as salaries exceeding a budget threshold, employees above a certain age, or records containing specific keywords."));
  children.push(bodyPara("The system supports six condition types: Greater Than, Less Than, Equal To, Not Equal, Contains, and Between. Each rule can use any of six preset colors (Red, Yellow, Green, Blue, Orange, Purple) or a custom color chosen via the system color picker. Multiple rules can be active simultaneously, and each rule is displayed in the Active Rules panel with its color indicator, condition description, and a delete button for one-click removal. Critically, when data is exported to Excel or PDF, the conditional formatting colors are preserved in the output, ensuring that the visual highlighting created during analysis appears in distributed reports without any additional formatting effort."));

  children.push(heading2("5.4 Chart Builder"));
  children.push(bodyPara("The interactive chart builder enables officers to create professional visualizations from their data using a simple drag-and-drop interface. Five chart types are supported: Bar charts for comparing quantities across categories, Line charts for showing trends over time or sequential data, Pie charts for displaying proportional distribution, Scatter charts for revealing correlations between two numeric variables, and Area charts for emphasizing the magnitude of trends."));
  children.push(bodyPara("Creating a chart requires only two steps: drag a column tag to the X-Axis slot for categories or labels, and drag another column tag to the Y-Axis slot for values. The chart renders immediately with smooth entry animations, including bar growing effects and line drawing animations that provide a polished, professional presentation. Charts automatically reflect the current filter state, meaning that if data is filtered to show only Police department records, the chart updates to visualize only that filtered subset. This dynamic linking between filters and charts enables rapid iterative analysis where officers can explore different data segments without manually rebuilding charts."));

  children.push(heading2("5.5 Data Cleanup Tools"));
  children.push(bodyPara("Real-world government data is frequently messy, containing duplicate entries, empty rows from incomplete data collection, inconsistent spacing from manual data entry, and outdated values that need systematic replacement. The data cleanup module provides four essential tools that address these common data quality issues. 'Remove Duplicate Rows' identifies and removes rows that are identical across all columns, using a hash-based comparison that works efficiently even with thousands of rows. 'Remove Empty Rows' eliminates rows where all columns are blank, which often result from data entry errors or export artifacts."));
  children.push(bodyPara("'Trim Whitespace' removes leading and trailing spaces from all cell values, a surprisingly common issue when data is copied from different sources or entered manually. The 'Find and Replace' tool supports searching across all columns or a specific column, with replacement applied globally throughout the dataset. All cleanup operations are undoable through the undo stack, which preserves the previous state before each modification, allowing officers to experiment with cleanup operations without fear of losing data."));

  children.push(heading2("5.6 Export Capabilities"));
  children.push(bodyPara("The export module produces professional-quality output files that preserve all conditional formatting highlights, making them immediately suitable for distribution to senior officials and other departments. Excel export generates a standard .xlsx file using the SheetJS library, where conditional formatting colors are applied as cell background fills. This means that when the exported Excel file is opened in Microsoft Excel or any compatible application, the highlighted cells appear exactly as they did in the analyser, with their color backgrounds intact."));
  children.push(bodyPara("PDF export uses the jsPDF library with the AutoTable plugin to generate paginated PDF documents. Three paper sizes are supported: A4 (210 x 297 mm), Letter (8.5 x 11 inches), and Legal (8.5 x 14 inches), each available in both portrait and landscape orientation. The PDF includes a header with the application title and credit line, a summary of row and column counts, and the data table with all conditional formatting colors rendered as cell background fills. For datasets exceeding 500 rows, the PDF export automatically limits to the first 500 rows to maintain reasonable file sizes and rendering performance."));

  children.push(heading2("5.7 Save & Load"));
  children.push(bodyPara("The save and load functionality leverages the browser's localStorage to persist the entire application state, including the raw data, headers, column types, active filters, conditional formatting rules, and sort configuration. When the application is opened, it automatically checks for a saved state and restores it if found, allowing officers to close the browser and resume their analysis exactly where they left off. Manual save and load operations are also available through the sidebar icons, providing explicit control over when data is persisted. This feature is particularly valuable in office environments where work may be interrupted by other duties and needs to be resumed later without losing progress."));

  // ─── 6. Time Savings ───
  children.push(heading1("6. Time Savings & Efficiency Impact"));
  children.push(bodyPara("The following table illustrates the dramatic time savings that Simple Data Analyser provides compared to manual methods for common government data analysis tasks. These estimates are based on typical dataset sizes of 200-2,000 records, which represent the most common data volumes encountered in police stations and administrative offices."));

  children.push(featureTable([
    ["Task", "Manual Time", "With This App", "Time Saved"],
    ["Calculate column average/sum", "15-30 minutes", "Under 2 seconds", "99%+"],
    ["Find duplicate entries", "30-60 minutes", "Under 1 second", "99%+"],
    ["Filter by multiple conditions", "20-45 minutes", "Under 3 seconds", "99%+"],
    ["Apply conditional highlighting", "30-90 minutes (Excel skills needed)", "Under 5 seconds", "99%+"],
    ["Convert Hindi font encoding", "20-40 minutes per column", "Under 2 seconds per column", "99%+"],
    ["Generate formatted PDF report", "45-120 minutes (formatting)", "Under 10 seconds", "95%+"],
    ["Create visualization charts", "30-60 minutes (Excel)", "Under 15 seconds", "97%+"],
    ["Find and replace values", "10-20 minutes", "Under 1 second", "99%+"],
  ]));

  children.push(bodyPara("As the data above demonstrates, Simple Data Analyser reduces the time required for virtually every common data analysis task by 95-99%. For an officer who performs these tasks even 3-4 times per week, the cumulative time savings amount to several hours per week, translating to improved productivity, faster decision-making, and more timely report submissions. The elimination of dependency on IT staff for formatting and conversion tasks further reduces organizational bottlenecks and empowers individual officers to work independently and efficiently."));

  // ─── 7. Technical Architecture ───
  children.push(heading1("7. Technical Architecture"));
  children.push(bodyPara("Simple Data Analyser is built as a single, self-contained HTML file with all CSS styles and JavaScript logic embedded directly within the file. The application uses four CDN-loaded JavaScript libraries for specialized functionality: Chart.js for interactive chart rendering with animations, SheetJS (xlsx) for Excel file reading and writing, and jsPDF with the AutoTable plugin for PDF generation. All data processing occurs entirely in the browser using client-side JavaScript, with no data ever being sent to any external server, ensuring complete data privacy and offline operability."));
  children.push(bodyPara("The virtual scrolling implementation renders only the visible rows plus a buffer zone, enabling smooth performance even with 10,000+ row datasets. The application maintains a separation between raw data indices and display indices, allowing filters, sorting, and search to operate as composable transformations on the data view without modifying the underlying dataset. The undo stack preserves complete data snapshots before each modification, supporting full rollback capability. The responsive design uses CSS media queries to adapt the layout for mobile devices, with a collapsible sidebar and full-width panels ensuring complete functionality on smartphones and tablets."));

  // ─── 8. Credits ───
  children.push(heading1("8. Credits & Attribution"));
  children.push(bodyPara("Simple Data Analyser has been developed by Neeraj Purohit, Senior Assistant, Rajasthan Police. The application was created to address the specific data analysis needs of government personnel working in Hindi-speaking regions, with a focus on practical usability, offline functionality, and multilingual support. The tool is designed to serve as a daily productivity enhancer for officers who need to process, analyze, and report on data quickly and accurately without relying on specialized software or IT support."));

  return children;
}

// ─── ASSEMBLE DOCUMENT ───
const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
          size: 24,
          color: c(P.body),
        },
        paragraph: {
          spacing: { line: 312 },
        },
      },
      heading1: {
        run: {
          font: { ascii: "Times New Roman", eastAsia: "SimHei" },
          size: 32,
          bold: true,
          color: c(P.primary),
        },
      },
      heading2: {
        run: {
          font: { ascii: "Times New Roman", eastAsia: "SimHei" },
          size: 28,
          bold: true,
          color: c(P.primary),
        },
      },
    },
  },
  sections: [
    // Section 1: Cover
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
        },
      },
      children: buildCover(),
    },
    // Section 2: Body
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: "decimal" },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Simple Data Analyser  |  Neeraj Purohit, Rajasthan Police  |  Page ", size: 16, color: c(P.secondary), font: { ascii: "Times New Roman" } }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: c(P.secondary), font: { ascii: "Times New Roman" } }),
              ],
            }),
          ],
        }),
      },
      children: buildBody(),
    },
  ],
});

// Generate
Packer.toBuffer(doc).then(buf => {
  const outPath = "/home/z/my-project/download/Simple-Data-Analyser-Details.docx";
  fs.writeFileSync(outPath, buf);
  console.log("Document saved to:", outPath);
});
