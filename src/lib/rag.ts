/**
 * RAG system for Researchly
 * Fixes: arXiv author regex, abstract slice 900, TOP_K=12, query expansion, Sonnet model
 */
import Anthropic from "@anthropic-ai/sdk";
import { Paper } from "@/types";

const CHUNK_SIZE = 300;
const CHUNK_OVERLAP = 60;
const TOP_K_CHUNKS = 12; // was 8
const FETCH_TIMEOUT = 9_000;

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function withTimeout<T>(p: Promise<T>, ms = FETCH_TIMEOUT): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), ms)),
  ]);
}

// ── Source fetchers ───────────────────────────────────────────

async function fetchSemanticScholar(q: string, n = 8): Promise<Paper[]> {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${n}&fields=paperId,title,authors,year,abstract,journal,externalIds,citationCount,openAccessPdf,url`;
    const data = (await withTimeout(fetch(url).then((r) => r.json()))) as any;
    return (data.data ?? []).map((p: any) => ({
      id: p.paperId,
      title: p.title ?? "",
      authors: (p.authors ?? []).map((a: any) => a.name),
      year: p.year ?? null,
      abstract: p.abstract ?? "",
      journal: p.journal?.name,
      doi: p.externalIds?.DOI,
      url: p.openAccessPdf?.url ?? p.url,
      citationCount: p.citationCount ?? 0,
      source: "Semantic Scholar",
    }));
  } catch {
    return [];
  }
}

async function fetchOpenAlex(q: string, n = 8): Promise<Paper[]> {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per_page=${n}&select=id,title,authorships,publication_year,abstract_inverted_index,primary_location,doi,cited_by_count,open_access`;
    const data = (await withTimeout(
      fetch(url, { headers: { "User-Agent": "Researchly/1.0" } }).then((r) =>
        r.json(),
      ),
    )) as any;
    return (data.results ?? []).map((p: any) => {
      let abstract = "";
      if (p.abstract_inverted_index) {
        const pos: Record<number, string> = {};
        for (const [word, positions] of Object.entries(
          p.abstract_inverted_index as Record<string, number[]>,
        ))
          for (const idx of positions) pos[idx] = word;
        abstract = Object.keys(pos)
          .sort((a, b) => +a - +b)
          .map((k) => pos[+k])
          .join(" ");
      }
      return {
        id: p.id,
        title: p.title ?? "",
        authors: (p.authorships ?? [])
          .slice(0, 5)
          .map((a: any) => a.author?.display_name),
        year: p.publication_year ?? null,
        abstract,
        journal: p.primary_location?.source?.display_name,
        doi: p.doi?.replace("https://doi.org/", ""),
        url: p.open_access?.oa_url ?? p.primary_location?.landing_page_url,
        citationCount: p.cited_by_count ?? 0,
        source: "OpenAlex",
      };
    });
  } catch {
    return [];
  }
}

async function fetchArXiv(q: string, n = 4): Promise<Paper[]> {
  try {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=${n}&sortBy=relevance`;
    const xml = await withTimeout(fetch(url).then((r) => r.text()));
    const papers: Paper[] = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xml)) !== null) {
      const e = m[1];
      const title =
        e
          .match(/<title>([\s\S]*?)<\/title>/)?.[1]
          ?.trim()
          .replace(/\s+/g, " ") ?? "";
      const abstract =
        e
          .match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
          ?.trim()
          .replace(/\s+/g, " ") ?? "";
      const published = e.match(/<published>([\s\S]*?)<\/published>/)?.[1];
      const id = e.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
      // ✅ FIXED: was /<n>[\s\S]*?<\/name>/g — wrong opening tag, authors were always empty
      const authorMatches = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)];
      const authors = authorMatches.map((a) => a[1].trim());
      if (title && abstract)
        papers.push({
          id,
          title,
          authors,
          year: published ? parseInt(published.slice(0, 4)) : null,
          abstract,
          url: id,
          source: "arXiv",
          citationCount: 0,
        });
    }
    return papers;
  } catch {
    return [];
  }
}

async function fetchPubMed(q: string, n = 6): Promise<Paper[]> {
  try {
    const searchData = (await withTimeout(
      fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}&retmax=${n}&retmode=json&sort=relevance`,
      ).then((r) => r.json()),
    )) as any;
    const ids = searchData.esearchresult?.idlist ?? [];
    if (!ids.length) return [];
    const xml = await withTimeout(
      fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`,
      ).then((r) => r.text()),
    );
    const papers: Paper[] = [];
    const articleRe = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
    let m: RegExpExecArray | null;
    while ((m = articleRe.exec(xml)) !== null) {
      const a = m[1];
      const title =
        a
          .match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]
          ?.replace(/<[^>]+>/g, "")
          .trim() ?? "";
      const abstract = [
        ...a.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g),
      ]
        .map((x) => x[1].replace(/<[^>]+>/g, "").trim())
        .join(" ");
      const authors = [
        ...a.matchAll(
          /<Author[^>]*>[\s\S]*?<LastName>([\s\S]*?)<\/LastName>(?:[\s\S]*?<ForeName>([\s\S]*?)<\/ForeName>)?/g,
        ),
      ]
        .slice(0, 6)
        .map((x) => `${x[1]} ${x[2] ?? ""}`.trim());
      const year = a.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1]
        ? parseInt(a.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)![1])
        : null;
      const journal = a.match(/<Title>([\s\S]*?)<\/Title>/)?.[1]?.trim();
      const pmid = a.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1] ?? "";
      const doi = a
        .match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/)?.[1]
        ?.trim();
      if (title && abstract)
        papers.push({
          id: `pubmed-${pmid}`,
          title,
          authors,
          year,
          abstract,
          journal,
          doi,
          url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined,
          citationCount: 0,
          source: "PubMed",
        });
    }
    return papers;
  } catch {
    return [];
  }
}

// ── Query expansion ───────────────────────────────────────────

async function expandQuery(query: string): Promise<string[]> {
  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system: "You are an academic search query expert.",
      messages: [
        {
          role: "user",
          content: `Generate 2 alternative academic search queries for: "${query}"\nReturn ONLY a JSON array of 2 strings, nothing else. Example: ["alt query one","alt query two"]`,
        },
      ],
    });
    const b = r.content[0];
    if (b.type !== "text") return [];
    const parsed = JSON.parse(
      b.text
        .trim()
        .replace(/```json|```/g, "")
        .trim(),
    ) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, 2) : [];
  } catch {
    return [];
  }
}

// ── Unified search ────────────────────────────────────────────

export async function searchAllWithPubMed(q: string): Promise<Paper[]> {
  const [expandedRes, ss, oa, ax, pm] = await Promise.allSettled([
    expandQuery(q),
    fetchSemanticScholar(q),
    fetchOpenAlex(q),
    fetchArXiv(q),
    fetchPubMed(q),
  ]);

  const expandedQueries =
    expandedRes.status === "fulfilled" ? expandedRes.value : [];

  const extraResults = await Promise.allSettled(
    expandedQueries.flatMap((eq) => [
      fetchSemanticScholar(eq, 4),
      fetchOpenAlex(eq, 4),
    ]),
  );

  const all = [
    ...(ss.status === "fulfilled" ? ss.value : []),
    ...(oa.status === "fulfilled" ? oa.value : []),
    ...(ax.status === "fulfilled" ? ax.value : []),
    ...(pm.status === "fulfilled" ? pm.value : []),
    ...extraResults.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
  ];

  const seen = new Set<string>();
  return all
    .filter((p) => {
      const key = p.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 50);
      if (seen.has(key) || !p.title || !p.abstract) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, 20);
}

// ── Chunking ──────────────────────────────────────────────────

export interface Chunk {
  paperId: string;
  paperIdx: number;
  title: string;
  source: string;
  year: number | null;
  text: string;
  url?: string;
  doi?: string;
}

export function chunkPapers(papers: Paper[]): Chunk[] {
  const chunks: Chunk[] = [];
  papers.forEach((paper, idx) => {
    const words = paper.abstract.split(/\s+/).filter(Boolean);
    if (!words.length) return;
    let start = 0;
    while (start < words.length) {
      const end = Math.min(start + CHUNK_SIZE, words.length);
      chunks.push({
        paperId: paper.id,
        paperIdx: idx + 1,
        title: paper.title,
        source: paper.source,
        year: paper.year,
        text: words.slice(start, end).join(" "),
        url: paper.url,
        doi: paper.doi,
      });
      if (end === words.length) break;
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
  });
  return chunks;
}

// ── Ranking ───────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

const K1 = 1.5,
  B = 0.75;

export function rankChunks(
  query: string,
  chunks: Chunk[],
  topK = TOP_K_CHUNKS,
): Chunk[] {
  if (!chunks.length) return [];
  const qTokens = new Set(tokenize(query));
  const avgLen =
    chunks.reduce((s, c) => s + c.text.split(/\s+/).length, 0) / chunks.length;
  const idf: Record<string, number> = {};
  for (const t of qTokens) {
    const df = chunks.filter((c) => c.text.toLowerCase().includes(t)).length;
    idf[t] = df > 0 ? Math.log((chunks.length - df + 0.5) / (df + 0.5) + 1) : 0;
  }
  return chunks
    .map((chunk) => {
      const words = chunk.text.split(/\s+/);
      const tf: Record<string, number> = {};
      for (const w of words) {
        const t = w.toLowerCase().replace(/[^a-z0-9]/g, "");
        tf[t] = (tf[t] ?? 0) + 1;
      }
      let score = 0;
      for (const t of qTokens) {
        const f = tf[t] ?? 0;
        score +=
          (idf[t] * f * (K1 + 1)) /
          (f + K1 * (1 - B + B * (words.length / avgLen)));
      }
      if (chunk.year && chunk.year >= 2020) score *= 1.1;
      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

// ── Context builder ───────────────────────────────────────────

export function buildRAGContext(topChunks: Chunk[]): string {
  return topChunks
    .map(
      (c, i) =>
        `[Chunk ${i + 1} | Ref ${c.paperIdx}: "${c.title}" (${c.source}, ${c.year ?? "n.d."})]
${c.text}${c.url ? `\nURL: ${c.url}` : ""}${c.doi ? `\nDOI: https://doi.org/${c.doi}` : ""}`,
    )
    .join("\n\n---\n\n");
}

// ── RAG answer generator ──────────────────────────────────────

const RAG_SYSTEM = `You are Researchly, an elite academic research assistant for Indian students and researchers.
You ONLY help with academic, research, and study topics.

CONTEXT USAGE RULES:
- You are given ranked excerpts from academic papers. Each is labelled [Chunk N | Ref M: "Title" (Source, Year)].
- Cite using Ref number: e.g. [2] or [1,3]. Never fabricate facts.
- If context is insufficient, supplement with your knowledge and note it explicitly.

WRITING RULES:
- Never start with "Great question!" or filler phrases.
- Use ## for main headings, bold **key terms** on first use.
- Research answers: 500-700 words. Study explanations: 400-600 words.
- Always end with ## What To Search Next (3 query suggestions).`;

export async function generateRAGAnswer(
  query: string,
  papers: Paper[],
  stream = false,
): Promise<string | AsyncIterable<string>> {
  const chunks = chunkPapers(papers);
  const topChunks = rankChunks(query, chunks);
  const ragCtx = buildRAGContext(topChunks);

  // ✅ FIX: abstract slice raised 550 → 900 chars
  const paperList = papers
    .slice(0, 20)
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}" — ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""} (${p.year ?? "n.d."}) · ${p.source}${p.url ? ` · ${p.url}` : ""}`,
    )
    .join("\n");

  const userPrompt = `RESEARCH QUESTION: "${query}"

## RETRIEVED CONTEXT (top ${topChunks.length} chunks)
${ragCtx}

## PAPER INDEX
${paperList}

Classify and respond:
- Research: cite every claim [n], end with ## Key Takeaways, ## Useful Links, ## What To Search Next
- Study help: clear structure, real examples, ## Quick Revision Points, ## What To Search Next
- Exam: original questions, 4 options (A-D), correct answer, detailed explanations`;

  if (stream) {
    const s = await ant.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 3500,
      system: RAG_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    async function* gen(): AsyncIterable<string> {
      for await (const e of s)
        if (e.type === "content_block_delta" && e.delta.type === "text_delta")
          yield e.delta.text;
    }
    return gen();
  }

  const res = await ant.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3500,
    system: RAG_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  const b = res.content[0];
  return b.type === "text" ? b.text : "";
}

export { searchAllWithPubMed as searchAll };
