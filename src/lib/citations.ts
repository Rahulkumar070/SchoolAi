import { Paper, CitationFormat } from "@/types";
const ln = (n: string) => n.trim().split(" ").pop() ?? n;
const ini = (n: string) => n.trim().split(" ").slice(0,-1).map(p=>p[0]+".").join(" ");

export function cite(p: Paper, fmt: CitationFormat): string {
  const y = p.year ?? "n.d.", t = p.title, j = p.journal ?? p.source, d = p.doi ? `https://doi.org/${p.doi}` : (p.url ?? ""), au = p.authors.length ? p.authors : ["Unknown"];
  switch(fmt) {
    case "apa": return `${au.slice(0,6).map(n=>`${ln(n)}, ${ini(n)}`.trim()).join(", ")} (${y}). ${t}. *${j}*.${d?" "+d:""}`;
    case "mla": return `${au.length===1?au[0]:au.length===2?`${au[0]}, and ${au[1]}`:`${au[0]}, et al`}. "${t}." *${j}*, ${y}.${d?" "+d:""}`;
    case "ieee": return `${au.slice(0,6).map(n=>`${ini(n)} ${ln(n)}`.trim()).join(", ")}, "${t}," *${j}*, ${y}.`;
    case "chicago": return `${au.length===1?au[0]:`${au[0]}, et al`}. "${t}." *${j}* (${y}).${d?" "+d:""}`;
    case "vancouver": return `${au.slice(0,6).map(n=>`${ln(n)} ${ini(n).replace(/\./g,"").replace(/ /g,"")}`).join(", ")}. ${t}. ${j}. ${y}.`;
    case "bibtex": return `@article{${ln(au[0]??"")}${y},\n  title   = {${t}},\n  author  = {${au.join(" and ")}},\n  journal = {${j}},\n  year    = {${y}},${p.doi?`\n  doi     = {${p.doi}},`:""}\n}`;
  }
}

export function citeAll(papers: Paper[], fmt: CitationFormat) {
  return papers.map((p, i) => `[${i+1}] ${cite(p, fmt)}`).join("\n\n");
}
