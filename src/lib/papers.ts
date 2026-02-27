import { Paper } from "@/types";

async function timeout<T>(p: Promise<T>, ms = 9000): Promise<T> {
  return Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
}

async function semanticScholar(q: string, n = 8): Promise<Paper[]> {
  try {
    const u = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${n}&fields=paperId,title,authors,year,abstract,journal,externalIds,citationCount,openAccessPdf,url`;
    const d = await timeout(fetch(u).then(r => r.json())) as { data?: { paperId: string; title: string; authors?: { name: string }[]; year?: number; abstract?: string; journal?: { name: string }; externalIds?: { DOI?: string }; citationCount?: number; openAccessPdf?: { url: string }; url?: string }[] };
    return (d.data ?? []).map(p => ({ id: p.paperId, title: p.title ?? "", authors: (p.authors ?? []).map(a => a.name), year: p.year ?? null, abstract: p.abstract ?? "", journal: p.journal?.name, doi: p.externalIds?.DOI, url: p.openAccessPdf?.url ?? p.url, citationCount: p.citationCount ?? 0, source: "Semantic Scholar" }));
  } catch { return []; }
}

async function openAlex(q: string, n = 8): Promise<Paper[]> {
  try {
    const u = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per_page=${n}&select=id,title,authorships,publication_year,abstract_inverted_index,primary_location,doi,cited_by_count,open_access`;
    const d = await timeout(fetch(u, { headers: { "User-Agent": "ScholarAI/1.0" } }).then(r => r.json())) as { results?: { id: string; title: string; authorships?: { author: { display_name: string } }[]; publication_year?: number; abstract_inverted_index?: Record<string, number[]>; primary_location?: { source?: { display_name: string }; landing_page_url?: string }; doi?: string; cited_by_count?: number; open_access?: { oa_url?: string } }[] };
    return (d.results ?? []).map(p => {
      let abstract = "";
      if (p.abstract_inverted_index) {
        const m: Record<number, string> = {};
        for (const [w, ps] of Object.entries(p.abstract_inverted_index)) for (const pos of ps) m[pos] = w;
        abstract = Object.keys(m).sort((a, b) => +a - +b).map(k => m[+k]).join(" ");
      }
      return { id: p.id, title: p.title ?? "", authors: (p.authorships ?? []).slice(0, 5).map(a => a.author?.display_name), year: p.publication_year ?? null, abstract, journal: p.primary_location?.source?.display_name, doi: p.doi?.replace("https://doi.org/", ""), url: p.open_access?.oa_url ?? p.primary_location?.landing_page_url, citationCount: p.cited_by_count ?? 0, source: "OpenAlex" };
    });
  } catch { return []; }
}

async function arxiv(q: string, n = 4): Promise<Paper[]> {
  try {
    const u = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=${n}&sortBy=relevance`;
    const xml = await timeout(fetch(u).then(r => r.text()));
    const papers: Paper[] = [];
    const re = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const e = m[1];
      const t = e.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim().replace(/\s+/g, " ") ?? "";
      const a = e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim().replace(/\s+/g, " ") ?? "";
      const y = e.match(/<published>([\s\S]*?)<\/published>/)?.[1];
      const id = e.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
      const au = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(x => x[1].trim());
      if (t && a) papers.push({ id, title: t, authors: au, year: y ? parseInt(y.slice(0, 4)) : null, abstract: a, url: id, source: "arXiv", citationCount: 0 });
    }
    return papers;
  } catch { return []; }
}

export async function searchAll(q: string): Promise<Paper[]> {
  const [r1, r2, r3] = await Promise.allSettled([semanticScholar(q), openAlex(q), arxiv(q)]);
  const all = [...(r1.status === "fulfilled" ? r1.value : []), ...(r2.status === "fulfilled" ? r2.value : []), ...(r3.status === "fulfilled" ? r3.value : [])];
  const seen = new Set<string>();
  return all.filter(p => { const k = p.title.toLowerCase().slice(0, 55); if (seen.has(k) || !p.title || !p.abstract) return false; seen.add(k); return true; }).sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0)).slice(0, 14);
}
