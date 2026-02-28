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

export function downloadResearchPDF(
  query: string,
  answer: string,
  papers: Paper[],
  userName?: string,
) {
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

  // Build references list (APA format)
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

  // Build sources summary cards
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>ScholarAI — ${query.slice(0, 60)}</title>
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

    /* ── Header ── */
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
    .logo-text { font-family: Georgia, serif; font-size: 17pt; font-weight: bold; color: #111; letter-spacing: -0.5px; }
    .logo-text span { color: #e8a045; }
    .meta-right { text-align: right; font-size: 8.5pt; color: #888; line-height: 1.7; }

    /* ── Query title ── */
    .query-block {
      background: #fffbf5;
      border-left: 4px solid #e8a045;
      padding: 14px 18px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 22px;
    }
    .query-label { font-size: 8pt; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; color: #e8a045; margin-bottom: 5px; }
    .query-text  { font-size: 14pt; font-weight: bold; color: #111; font-family: Georgia, serif; line-height: 1.4; }

    /* ── Section headings ── */
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

    /* ── Answer content ── */
    .answer p { margin-bottom: 10px; font-size: 11pt; color: #222; line-height: 1.75; }
    .answer h2 { font-size: 13pt; color: #111; margin: 18px 0 8px; font-family: Georgia, serif; }
    .answer h3 { font-size: 11.5pt; color: #333; margin: 14px 0 6px; font-weight: bold; }
    .answer ul { padding-left: 20px; margin-bottom: 10px; }
    .answer li { margin-bottom: 5px; font-size: 11pt; color: #222; }
    .answer strong { color: #111; font-weight: bold; }
    .answer em    { font-style: italic; }
    .answer code  { font-family: "Courier New", monospace; font-size: 10pt; background: #f5f5f5; padding: 1px 5px; border-radius: 3px; color: #c47a1a; }
    sup.cite { font-size: 7.5pt; color: #e8a045; font-weight: bold; vertical-align: super; }

    /* ── Source cards ── */
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
      background: #e8a045;
      color: #000;
      font-size: 9pt;
      font-weight: bold;
      border-radius: 5px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .source-title    { font-size: 10.5pt; font-weight: bold; color: #111; margin-bottom: 3px; line-height: 1.4; }
    .source-meta     { font-size: 9pt; color: #888; margin-bottom: 4px; }
    .source-abstract { font-size: 9.5pt; color: #555; line-height: 1.5; margin-bottom: 3px; }
    .source-doi      { font-size: 8.5pt; color: #aaa; font-family: "Courier New", monospace; }

    /* ── References ── */
    .ref { display: flex; gap: 10px; margin-bottom: 10px; page-break-inside: avoid; }
    .ref-num  { font-weight: bold; color: #e8a045; flex-shrink: 0; min-width: 28px; font-size: 10pt; }
    .ref-body { font-size: 10pt; color: #333; line-height: 1.6; flex: 1; }
    .ref-body em { font-style: italic; }

    /* ── Footer ── */
    .footer {
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      font-size: 8.5pt;
      color: #bbb;
    }

    /* ── Stats bar ── */
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
    .stat-val  { font-size: 14pt; font-weight: bold; color: #e8a045; font-family: Georgia; }
    .stat-label{ font-size: 8pt; color: #aaa; margin-top: 1px; }

    @media print {
      body { padding: 0; }
      .page { padding: 12mm 18mm; }
      @page { margin: 0; size: A4; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="logo-wrap">
      <div class="logo-box">📚</div>
      <div>
        <div class="logo-text">Scholar<span>AI</span></div>
        <div style="font-size:8pt;color:#aaa;margin-top:1px">AI Research Assistant</div>
      </div>
    </div>
    <div class="meta-right">
      Generated: ${dateStr} at ${timeStr}<br/>
      ${userName ? `Researcher: ${userName}<br/>` : ""}
      Sources: ${papers.length} academic papers<br/>
      school-ai-sage.vercel.app
    </div>
  </div>

  <!-- Query -->
  <div class="query-block">
    <div class="query-label">Research Query</div>
    <div class="query-text">${query}</div>
  </div>

  <!-- Stats -->
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

  <!-- AI Answer -->
  <div class="section-title">AI Research Summary</div>
  <div class="answer">
    <p>${answerHtml}</p>
  </div>

  ${
    papers.length > 0
      ? `
  <!-- Sources -->
  <div class="section-title">Sources (${papers.length} Papers)</div>
  ${sourcesHtml}

  <!-- References -->
  <div class="section-title">References (APA Format)</div>
  ${refsHtml}
  `
      : ""
  }

  <!-- Footer -->
  <div class="footer">
    <span>Generated by ScholarAI · AI-powered Academic Research</span>
    <span>school-ai-sage.vercel.app · ${dateStr}</span>
  </div>

</div>
<script>
  window.onload = function() {
    window.print();
    setTimeout(function() { window.close(); }, 800);
  };
</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=750");
  if (!win) {
    alert("Please allow popups to download PDF");
    return;
  }
  win.document.write(html);
  win.document.close();
}
