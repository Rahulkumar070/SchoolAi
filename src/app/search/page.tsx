"use client";
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Shell from "@/components/layout/Shell";
import PaperCard from "@/components/papers/PaperCard";
import CitationPanel from "@/components/papers/CitationPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, AlertCircle, ArrowUp, Layers } from "lucide-react";
import { Paper } from "@/types";
import toast from "react-hot-toast";

interface Turn { query: string; answer: string; papers: Paper[]; }

function SearchApp() {
  const params   = useSearchParams();
  const initQ    = params.get("q") ?? "";

  const [turns,   setTurns]   = useState<Turn[]>([]);
  const [input,   setInput]   = useState(initQ);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  // Right panel state
  const [panelTurn, setPanelTurn] = useState<Turn | null>(null);
  const [panelTab,  setPanelTab]  = useState<"sources"|"cite">("sources");

  const taRef  = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior:"smooth" }), 80);

  const resize = () => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 170) + "px";
  };

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true); setError("");
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    try {
      const r = await fetch("/api/search", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ query: q.trim() }) });
      const d = await r.json() as { papers?: Paper[]; answer?: string; error?: string };
      if (!r.ok) { setError(d.error ?? "Search failed"); toast.error(d.error ?? "Search failed"); return; }
      const turn: Turn = { query: q.trim(), answer: d.answer ?? "", papers: d.papers ?? [] };
      setTurns(prev => [...prev, turn]);
      setPanelTurn(turn);
      scrollDown();
    } catch { setError("Network error. Please try again."); toast.error("Network error"); }
    finally { setLoading(false); }
  }, [loading]);

  useEffect(() => { if (initQ) void doSearch(initQ); }, []); // eslint-disable-line

  const SUGGESTIONS = [
    "How does gut microbiome affect mental health?",
    "What are the latest breakthroughs in quantum computing?",
    "Explain RLHF for language model alignment",
    "Long COVID mechanisms and treatments",
  ];

  const RightPanel = panelTurn ? (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div className="panel-header">
        <div className="tab-row">
          <button className={`tab${panelTab==="sources"?" on":""}`} onClick={()=>setPanelTab("sources")}>
            Sources ({panelTurn.papers.length})
          </button>
          <button className={`tab${panelTab==="cite"?" on":""}`} onClick={()=>setPanelTab("cite")}>
            Cite
          </button>
        </div>
      </div>
      <div className="panel-body">
        {panelTab === "sources" ? (
          panelTurn.papers.map((p, i) => <PaperCard key={p.id} paper={p} index={i+1}/>)
        ) : (
          <CitationPanel papers={panelTurn.papers}/>
        )}
      </div>
    </div>
  ) : undefined;

  return (
    <Shell rightPanel={RightPanel}>
      {/* Chat column */}
      <div className="chat-col">
        {turns.length === 0 && !loading ? (
          /* Welcome */
          <div className="welcome">
            <div className="welcome-mark"><BookOpen size={22} style={{ color:"var(--brand)" }}/></div>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:400, color:"var(--text-primary)", marginBottom:8 }}>
              What would you like to research?
            </h2>
            <p style={{ fontSize:14, color:"var(--text-secondary)", maxWidth:400, lineHeight:1.65 }}>
              Ask anything. I&apos;ll search 200M+ academic papers and give you a cited synthesis.
            </p>
            <div className="suggestion-grid">
              {SUGGESTIONS.map(s => (
                <button key={s} className="suggestion-card" onClick={() => void doSearch(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages-wrap">
            {turns.map((turn, i) => (
              <div key={i}>
                {/* User */}
                <div className="msg-row user">
                  <div className="msg-bubble">{turn.query}</div>
                </div>
                {/* AI */}
                <div className="msg-row">
                  <div className="msg-avatar"><BookOpen size={12} style={{ color:"var(--brand)" }}/></div>
                  <div className="msg-ai-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}
                      components={{
                        h2:({children})=><h2 style={{ fontFamily:"var(--font-display)", fontSize:"1rem", color:"var(--text-primary)", margin:"1.3em 0 .45em", fontWeight:600 }}>{children}</h2>,
                        h3:({children})=><h3 style={{ fontSize:".92rem", color:"var(--text-primary)", fontWeight:600, margin:".9em 0 .3em" }}>{children}</h3>,
                        p:({children})=><p style={{ marginBottom:".7em", lineHeight:1.76, fontSize:14.5, color:"var(--text-secondary)" }}>{children}</p>,
                        strong:({children})=><strong style={{ color:"var(--text-primary)", fontWeight:600 }}>{children}</strong>,
                        ul:({children})=><ul style={{ paddingLeft:"1.3em", marginBottom:".7em" }}>{children}</ul>,
                        ol:({children})=><ol style={{ paddingLeft:"1.3em", marginBottom:".7em" }}>{children}</ol>,
                        li:({children})=><li style={{ marginBottom:".25em", fontSize:14.5, color:"var(--text-secondary)" }}>{children}</li>,
                        code:({children})=><code style={{ fontFamily:"var(--font-mono)", fontSize:12, background:"var(--surface-2)", color:"var(--brand)", padding:"2px 5px", borderRadius:4 }}>{children}</code>,
                      }}>
                      {turn.answer}
                    </ReactMarkdown>

                    {/* View sources chip */}
                    {turn.papers.length > 0 && (
                      <button onClick={() => { setPanelTurn(turn); setPanelTab("sources"); }}
                        style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"5px 11px", borderRadius:7, background:"var(--surface)", border:"1px solid var(--border-mid)", color:"var(--text-secondary)", fontSize:11.5, fontFamily:"var(--font-ui)", cursor:"pointer", marginTop:10, fontWeight:500 }}>
                        <Layers size={11}/> {turn.papers.length} sources
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <>
                <div className="msg-row user">
                  <div className="msg-bubble" style={{ opacity:.6 }}>{input || "Searching…"}</div>
                </div>
                <div className="msg-row">
                  <div className="msg-avatar"><BookOpen size={12} style={{ color:"var(--brand)" }}/></div>
                  <div style={{ padding:"10px 14px", background:"var(--bg-overlay)", border:"1px solid var(--border)", borderRadius:"4px 12px 12px 12px", display:"flex", alignItems:"center", gap:4 }}>
                    <span className="typing-dot"/><span className="typing-dot"/><span className="typing-dot"/>
                  </div>
                </div>
              </>
            )}

            {/* Error */}
            {error && !loading && (
              <div style={{ display:"flex", gap:9, padding:"12px 14px", background:"rgba(224,92,92,.07)", border:"1px solid rgba(224,92,92,.18)", borderRadius:10, margin:"0 0 24px" }}>
                <AlertCircle size={14} style={{ color:"var(--red)", flexShrink:0, marginTop:1 }}/>
                <p style={{ fontSize:13.5, color:"var(--red)" }}>{error}</p>
              </div>
            )}
            <div ref={endRef}/>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="input-bar-wrap">
        <div className="input-bar">
          <textarea ref={taRef} value={input}
            onChange={e=>{ setInput(e.target.value); resize(); }}
            onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); void doSearch(input); } }}
            placeholder="Ask a research question… (Enter to send)"
            className="input-textarea" rows={1} disabled={loading}/>
          <button onClick={() => void doSearch(input)} disabled={loading||!input.trim()}
            className={`send-btn${input.trim()&&!loading?" ready":" idle"}`}>
            {loading
              ? <span className="spinner"/>
              : <ArrowUp size={14} style={{ color: input.trim()?"#000":"var(--text-faint)" }}/>}
          </button>
        </div>
        <p className="input-hint">Searches Semantic Scholar · OpenAlex · arXiv simultaneously</p>
      </div>
    </Shell>
  );
}

export default function SearchPage() {
  return <Suspense><SearchApp/></Suspense>;
}
