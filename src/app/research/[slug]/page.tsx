import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, ArrowRight, FlaskConical } from "lucide-react";
import { connectDB } from "@/lib/mongodb";
import { PublicResearchModel } from "@/models/PublicResearch";
import AnswerRenderer from "@/components/answer/AnswerRenderer";

interface Props {
  params: { slug: string };
}

// Strip [CITATION:xxx] markers and collapse whitespace
function stripCitations(text: string): string {
  return text
    .replace(/\[CITATION:[a-z0-9]+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

type ResearchDoc = {
  slug: string;
  query: string;
  answer: string;
  papers: {
    id?: string;
    title: string;
    authors: string[];
    year?: number;
    journal?: string;
    source?: string;
    doi?: string;
    url?: string;
    abstract?: string;
    citationCount?: number;
    badges?: string[];
  }[];
  evidenceIdToPaperId: Record<string, string>;
  createdAt: string;
};

async function getResearch(slug: string): Promise<ResearchDoc | null> {
  try {
    await connectDB();
    const doc = await PublicResearchModel.findOne({ slug }, { __v: 0 }).lean();
    if (!doc) {
      console.log("[research/page] No document found for slug:", slug);
      return null;
    }
    // Serialize BSON types so they're safe to pass as RSC props
    return JSON.parse(JSON.stringify(doc)) as ResearchDoc;
  } catch (err) {
    console.error("[research/page] getResearch error for slug:", slug, err);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = await getResearch(params.slug);
  if (!doc) return { title: "Research Not Found — Researchly" };

  const description = stripCitations(doc.answer).slice(0, 160);
  const pageUrl = `https://researchly.in/research/${params.slug}`;

  return {
    title: `${doc.query} — Researchly`,
    description,
    openGraph: {
      title: doc.query,
      description,
      url: pageUrl,
      siteName: "Researchly",
      type: "article",
    },
    twitter: {
      card: "summary",
      title: doc.query,
      description,
    },
    alternates: {
      canonical: pageUrl,
    },
  };
}

export default async function PublicResearchPage({ params }: Props) {
  console.log("[research/page] rendering slug:", params.slug);
  const doc = await getResearch(params.slug);
  console.log("[research/page] doc found:", !!doc);
  if (!doc) notFound();

  // Explicit cast: notFound() throws (returns never) so doc is guaranteed non-null here,
  // but TypeScript needs the assertion to avoid "Object is possibly null" at runtime.
  const data = doc as ResearchDoc;

  const publishedDate = new Date(data.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <style>{`
        .pr-page {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text-primary);
          font-family: var(--font-ui, -apple-system, sans-serif);
        }

        /* ── NAV ── */
        .pr-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 28px;
          border-bottom: 1px solid var(--border);
          position: sticky; top: 0; z-index: 50;
          background: rgba(20,20,20,0.92);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .pr-logo {
          display: flex; align-items: center; gap: 8px;
          text-decoration: none;
        }
        .pr-logo-box {
          width: 28px; height: 28px; border-radius: 8px;
          background: var(--brand);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .pr-logo-text {
          font-size: 15px; font-weight: 600;
          color: var(--text-primary); letter-spacing: -0.01em;
        }
        .pr-nav-cta {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 600;
          color: #000;
          padding: 7px 14px; border-radius: 8px;
          background: var(--brand); border: none;
          cursor: pointer; text-decoration: none;
          transition: background 0.15s;
        }
        .pr-nav-cta:hover { background: var(--brand-hover, #b8a589); }

        /* ── MAIN CONTENT ── */
        .pr-main {
          max-width: 780px;
          margin: 0 auto;
          padding: 48px 24px 80px;
        }

        /* ── BREADCRUMB ── */
        .pr-breadcrumb {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; color: var(--text-muted);
          margin-bottom: 28px;
        }
        .pr-breadcrumb a {
          color: var(--text-muted); text-decoration: none;
        }
        .pr-breadcrumb a:hover { color: var(--text-secondary); }
        .pr-breadcrumb-sep { opacity: 0.4; }

        /* ── QUERY HEADER ── */
        .pr-query-label {
          display: flex; align-items: center; gap: 7px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--brand);
          margin-bottom: 14px;
        }
        .pr-query-label svg { opacity: 0.75; }
        .pr-query-h1 {
          font-size: clamp(1.45rem, 3.5vw, 2rem);
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.03em;
          line-height: 1.25;
          margin-bottom: 10px;
        }
        .pr-meta {
          font-size: 12px; color: var(--text-muted);
          margin-bottom: 36px;
        }

        /* ── ANSWER CARD ── */
        .pr-answer-card {
          background: var(--bg-raised);
          border: 1px solid var(--border-mid);
          border-radius: 16px;
          padding: 32px 36px;
          margin-bottom: 48px;
        }
        @media (max-width: 600px) {
          .pr-answer-card { padding: 20px 16px; }
          .pr-main { padding: 32px 16px 60px; }
          .pr-nav { padding: 12px 16px; }
        }

        /* ── CTA BANNER ── */
        .pr-cta-banner {
          background: var(--brand-dim);
          border: 1px solid var(--brand-border);
          border-radius: 14px;
          padding: 28px 32px;
          display: flex; align-items: center;
          justify-content: space-between; gap: 20px;
          flex-wrap: wrap;
        }
        .pr-cta-text h2 {
          font-size: 16px; font-weight: 700;
          color: var(--text-primary); letter-spacing: -0.02em;
          margin-bottom: 5px;
        }
        .pr-cta-text p {
          font-size: 13px; color: var(--text-muted); line-height: 1.5;
        }
        .pr-cta-link {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 13.5px; font-weight: 600;
          color: #000; background: var(--brand);
          padding: 10px 20px; border-radius: 9px;
          text-decoration: none; white-space: nowrap;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .pr-cta-link:hover { background: var(--brand-hover, #b8a589); }

        /* ── FOOTER ── */
        .pr-footer {
          max-width: 780px; margin: 0 auto;
          padding: 0 24px 40px;
          font-size: 12px; color: var(--text-faint);
          border-top: 1px solid var(--border);
          padding-top: 20px;
          display: flex; justify-content: space-between;
          align-items: center; flex-wrap: wrap; gap: 8px;
        }
        .pr-footer a {
          color: var(--brand); text-decoration: none;
        }
        .pr-footer a:hover { text-decoration: underline; }
      `}</style>

      <div className="pr-page">
        {/* ── NAV ── */}
        <nav className="pr-nav">
          <Link href="/" className="pr-logo">
            <div className="pr-logo-box">
              <BookOpen size={14} style={{ color: "#000" }} strokeWidth={2.5} />
            </div>
            <span className="pr-logo-text">Researchly</span>
          </Link>
          <Link href="/search" className="pr-nav-cta">
            Try free <ArrowRight size={13} />
          </Link>
        </nav>

        {/* ── MAIN ── */}
        <main className="pr-main">
          {/* Breadcrumb */}
          <div className="pr-breadcrumb">
            <Link href="/">Home</Link>
            <span className="pr-breadcrumb-sep">/</span>
            <Link href="/search">Research</Link>
            <span className="pr-breadcrumb-sep">/</span>
            <span style={{ color: "var(--text-secondary)" }}>
              {data.query.length > 50
                ? data.query.slice(0, 50) + "…"
                : data.query}
            </span>
          </div>

          {/* Query header */}
          <div className="pr-query-label">
            <FlaskConical size={12} />
            AI Research Answer
          </div>
          <h1 className="pr-query-h1">{data.query}</h1>
          <p className="pr-meta">
            {data.papers.length > 0 && (
              <>{data.papers.length} cited papers · </>
            )}
            {publishedDate} · Powered by Researchly AI
          </p>

          {/* Answer */}
          <div className="pr-answer-card">
            <AnswerRenderer
              content={data.answer}
              citedPapers={data.papers as any}
              evidenceIdToPaperId={data.evidenceIdToPaperId}
              streaming={false}
            />
          </div>

          {/* CTA Banner */}
          <div className="pr-cta-banner">
            <div className="pr-cta-text">
              <h2>Research any topic with AI-powered citations</h2>
              <p>
                Search 200M+ academic papers, generate literature reviews, and
                get cited answers in seconds.
              </p>
            </div>
            <Link href="/search" className="pr-cta-link">
              Try Researchly free <ArrowRight size={14} />
            </Link>
          </div>
        </main>

        {/* ── FOOTER ── */}
        <footer className="pr-footer">
          <span>© 2026 Researchly · Made in India 🇮🇳</span>
          <a href="mailto:hello.researchly@gmail.com">
            hello.researchly@gmail.com
          </a>
        </footer>
      </div>
    </>
  );
}
