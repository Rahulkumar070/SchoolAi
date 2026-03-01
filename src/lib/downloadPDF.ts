import { Paper } from "@/types";
import { cite } from "./citations";

// Converts markdown to readable HTML for PDF
function mdToHtml(md: string): string {
  return md
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^\* (.+)$/gm, "<li>$1</li>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (s) => `<ul>${s}</ul>`)
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hul])/gm, "")
    .replace(/\[(\d+)\]/g, '<sup class="cite">[$1]</sup>');
}

function buildHTML(
  query: string,
  answer: string,
  papers: Paper[],
  userName?: string,
  forDownload = false,
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const answerHtml = mdToHtml(answer);

  const refsHtml = papers
    .map(
      (p, i) => `
    <div class="ref">
      <span class="ref-num">[${i + 1}]</span>
      <span class="ref-body">${cite(p, "apa").replace(/\*(.*?)\*/g, "<em>$1</em>")}</span>
    </div>
  `,
    )
    .join("");

  const sourcesHtml = papers
    .slice(0, 8)
    .map(
      (p, i) => `
    <div class="source-card">
      <div class="source-num">${i + 1}</div>
      <div class="source-info">
        <p class="source-title">${p.title}</p>
        <p class="source-meta">
          ${p.authors?.slice(0, 3).join(", ")}${(p.authors?.length ?? 0) > 3 ? " et al." : ""}
          ${p.year ? ` · ${p.year}` : ""}
          ${p.journal ? ` · <em>${p.journal}</em>` : ""}
        </p>
        ${p.abstract ? `<p class="source-abstract">${p.abstract.slice(0, 200)}…</p>` : ""}
        ${p.doi ? `<p class="source-doi">DOI: ${p.doi}</p>` : ""}
      </div>
    </div>
  `,
    )
    .join("");

  // Auto-print script only for desktop print method
  const printScript = forDownload
    ? ""
    : `
<script>
  window.onload = function() {
    window.print();
    setTimeout(function() { window.close(); }, 1000);
  };
<\/script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Researchly — ${query.slice(0, 60)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Georgia", Times, serif;
      font-size: 11.5pt;
      color: #1a1a1a;
      background: #fff;
      line-height: 1.7;
    }
    .page { max-width: 210mm; margin: 0 auto; padding: 18mm 22mm 20mm; }

    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding-bottom: 12px;
      border-bottom: 2.5px solid #e8a045;
      margin-bottom: 20px;
    }
    .logo-wrap { display: flex; align-items: center; gap: 10px; }
    .logo-box {
      width: 34px; height: 34px;
      background: #e8a045;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 17px;
    }
    .logo-text { font-family: Georgia, serif; font-size: 17pt; font-weight: bold; color: #111; }
    .logo-text span { color: #e8a045; }
    .meta-right { text-align: right; font-size: 8.5pt; color: #888; line-height: 1.7; }

    .query-block {
      background: #fffbf5;
      border-left: 4px solid #e8a045;
      padding: 14px 18px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 22px;
    }
    .query-label { font-size: 8pt; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; color: #e8a045; margin-bottom: 5px; }
    .query-text  { font-size: 14pt; font-weight: bold; color: #111; line-height: 1.4; }

    .section-title {
      font-size: 10pt;
      font-weight: bold;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: #e8a045;
      margin: 26px 0 12px;
      padding-bottom: 5px;
      border-bottom: 1px solid #f0e0cc;
    }

    .answer p { margin-bottom: 10px; font-size: 11pt; color: #222; line-height: 1.75; }
    .answer h2 { font-size: 13pt; color: #111; margin: 18px 0 8px; }
    .answer h3 { font-size: 11.5pt; color: #333; margin: 14px 0 6px; font-weight: bold; }
    .answer ul { padding-left: 20px; margin-bottom: 10px; }
    .answer li { margin-bottom: 5px; font-size: 11pt; color: #222; }
    .answer strong { color: #111; font-weight: bold; }
    .answer code  { font-family: "Courier New", monospace; font-size: 10pt; background: #f5f5f5; padding: 1px 5px; border-radius: 3px; color: #c47a1a; }
    sup.cite { font-size: 7.5pt; color: #e8a045; font-weight: bold; vertical-align: super; }

    .stats-bar {
      display: flex;
      gap: 20px;
      padding: 10px 16px;
      background: #fffbf5;
      border: 1px solid #f0e0cc;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .stat { text-align: center; }
    .stat-val   { font-size: 14pt; font-weight: bold; color: #e8a045; }
    .stat-label { font-size: 8pt; color: #aaa; margin-top: 1px; }

    .source-card {
      display: flex;
      gap: 12px;
      padding: 11px 14px;
      border: 1px solid #eee;
      border-radius: 7px;
      margin-bottom: 8px;
      page-break-inside: avoid;
    }
    .source-num {
      min-width: 24px; height: 24px;
      background: #e8a045; color: #000;
      font-size: 9pt; font-weight: bold;
      border-radius: 5px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-top: 2px;
    }
    .source-title    { font-size: 10.5pt; font-weight: bold; color: #111; margin-bottom: 3px; line-height: 1.4; }
    .source-meta     { font-size: 9pt; color: #888; margin-bottom: 4px; }
    .source-abstract { font-size: 9.5pt; color: #555; line-height: 1.5; margin-bottom: 3px; }
    .source-doi      { font-size: 8.5pt; color: #aaa; font-family: "Courier New", monospace; }

    .ref { display: flex; gap: 10px; margin-bottom: 10px; page-break-inside: avoid; }
    .ref-num  { font-weight: bold; color: #e8a045; flex-shrink: 0; min-width: 28px; font-size: 10pt; }
    .ref-body { font-size: 10pt; color: #333; line-height: 1.6; flex: 1; }
    .ref-body em { font-style: italic; }

    .footer {
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      font-size: 8.5pt;
      color: #bbb;
    }

    /* Mobile styles */
    @media screen and (max-width: 600px) {
      .page { padding: 8mm 6mm; }
      .header { flex-direction: column; gap: 8px; }
      .meta-right { text-align: left; }
      .stats-bar { flex-wrap: wrap; gap: 12px; }
      .footer { flex-direction: column; gap: 4px; }
    }

    @media print {
      body { padding: 0; }
      .page { padding: 12mm 18mm; }
      @page { margin: 0; size: A4; }
    }
  </style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="logo-wrap">
      <div class="logo-box">📚</div>
      <div>
        <div class="logo-text">Research<span>ly</span></div>
        <div style="font-size:8pt;color:#aaa;margin-top:1px">AI Research Assistant</div>
      </div>
    </div>
    <div class="meta-right">
      Generated: ${dateStr} at ${timeStr}<br/>
      ${userName ? `Researcher: ${userName}<br/>` : ""}
      Sources: ${papers.length} academic papers<br/>
      researchly.in
    </div>
  </div>

  <div class="query-block">
    <div class="query-label">Research Query</div>
    <div class="query-text">${query}</div>
  </div>

  <div class="stats-bar">
    <div class="stat">
      <div class="stat-val">${papers.length}</div>
      <div class="stat-label">Sources Found</div>
    </div>
    <div class="stat">
      <div class="stat-val">${answer.split(" ").length}+</div>
      <div class="stat-label">Word Answer</div>
    </div>
    <div class="stat">
      <div class="stat-val">${(answer.match(/\[\d+\]/g) ?? []).length}</div>
      <div class="stat-label">Citations</div>
    </div>
    <div class="stat">
      <div class="stat-val">APA</div>
      <div class="stat-label">Format</div>
    </div>
  </div>

  <div class="section-title">AI Research Summary</div>
  <div class="answer">
    <p>${answerHtml}</p>
  </div>

  ${
    papers.length > 0
      ? `
  <div class="section-title">Sources (${papers.length} Papers)</div>
  ${sourcesHtml}
  <div class="section-title">References (APA Format)</div>
  ${refsHtml}
  `
      : ""
  }

  <div class="footer">
    <span>Generated by Researchly · AI-powered Academic Research</span>
    <span>researchly.in · ${dateStr}</span>
  </div>

</div>
${printScript}
</body>
</html>`;
}

// Detect if device is mobile
function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

export function downloadResearchPDF(
  query: string,
  answer: string,
  papers: Paper[],
  userName?: string,
) {
  const html = buildHTML(query, answer, papers, userName, isMobile());

  if (isMobile()) {
    // ── MOBILE: Create blob and download as HTML file
    // Works on iOS Safari, Android Chrome, all mobile browsers
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `researchly-${query.slice(0, 30).replace(/\s+/g, "-").toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } else {
    // ── DESKTOP: Open new window and trigger print dialog → Save as PDF
    const win = window.open("", "_blank", "width=900,height=750");
    if (!win) {
      // Fallback if popups blocked — download as HTML
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `researchly-${query.slice(0, 30).replace(/\s+/g, "-").toLowerCase()}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return;
    }
    win.document.write(html);
    win.document.close();
  }
}
