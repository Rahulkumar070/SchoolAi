"use client";
import { useState, useRef } from "react";
import Shell from "@/components/layout/Shell";
import PaperCard from "@/components/papers/PaperCard";
import CitationPanel from "@/components/papers/CitationPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ArrowUp, Download, Copy, Check, Lock, FileText } from "lucide-react";
import { useSession } from "next-auth/react";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Paper } from "@/types";

interface Result { review: string; papers: Paper[]; topic: string; }

export default function ReviewPage() {
  const [input,   setInput]   = useState("");
  const [result,  setResult]  = useState<Result|null>(null);
  const [loading, setLoading] = useState(false);
  const [tab,     setTab]     = useState<"review"|"sources"|"cite">("review");
  const [copied,  setCopied]  = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { data: session } = useSession();

  const resize = () => { const el = taRef.current; if(!el) return; el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,140)+"px"; };

  const generate = async () => {
    if(!input.trim()||loading) return;
    setLoading(true); setResult(null);
    try {
      const r = await fetch("/api/review",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({topic:input.trim()}) });
      const d = await r.json() as Result & { error?: string };
      if(!r.ok){ toast.error(d.error??"Failed"); return; }
      setResult(d); setTab("review");
    } catch { toast.error("Network error"); } finally { setLoading(false); }
  };

  const copy = () => {
    if(!result) return;
    void navigator.clipboard.writeText(result.review);
    setCopied(true); toast.success("Copied"); setTimeout(()=>setCopied(false),2000);
  };
  const dl = () => {
    if(!result) return;
    const a = Object.assign(document.createElement("a"),{ href:URL.createObjectURL(new Blob([result.review],{type:"text/plain"})), download:`review-${result.topic.slice(0,25).replace(/\s+/g,"-")}.md` });
    a.click(); toast.success("Downloaded");
  };

  return (
    <Shell>
      <div className="chat-col" style={{ display:"flex", flexDirection:"column" }}>
        <div style={{ flex:1, overflowY:"auto", padding:"28px 20px" }}>
          <div style={{ maxWidth:740, margin:"0 auto" }}>

            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", gap:11, marginBottom:24 }}>
              <div style={{ width:36,height:36,borderRadius:9,background:"rgba(93,184,122,.1)",border:"1px solid rgba(93,184,122,.18)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <BookOpen size={16} style={{ color:"#5db87a" }}/>
              </div>
              <div>
                <h1 style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:600, color:"var(--text-primary)" }}>Literature Review Generator</h1>
                <p style={{ fontSize:11.5, color:"var(--text-faint)", marginTop:2 }}>Structured academic reviews from 200M+ papers · Requires sign in</p>
              </div>
            </div>

            {/* Auth gate */}
            {!session && (
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px", background:"var(--brand-dim)", border:"1px solid var(--brand-border)", borderRadius:10, marginBottom:22 }}>
                <Lock size={14} style={{ color:"var(--brand)", flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)" }}>Sign in required</p>
                  <p style={{ fontSize:11.5, color:"var(--text-secondary)" }}>Account needed to generate reviews</p>
                </div>
                <Link href="/auth/signin" className="btn btn-brand" style={{ padding:"7px 14px", textDecoration:"none", flexShrink:0, fontSize:12.5 }}>Sign In</Link>
              </div>
            )}

            {/* Plan gate — free users can't use this */}
            {session && session.user?.plan === "free" && (
              <div style={{ background:"var(--surface)", border:"1px solid var(--brand-border)", borderRadius:14, padding:"28px 24px", textAlign:"center", marginBottom:22 }}>
                <div style={{ width:48, height:48, borderRadius:12, background:"var(--brand-dim)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
                  <Sparkles size={22} style={{ color:"var(--brand)" }}/>
                </div>
                <p style={{ fontSize:16, fontWeight:700, color:"var(--text-primary)", marginBottom:6 }}>Paid Feature</p>
                <p style={{ fontSize:13.5, color:"var(--text-secondary)", marginBottom:20, lineHeight:1.65 }}>
                  Literature Review is available on <strong>Student</strong> and <strong>Pro</strong> plans.<br/>
                  Get 500 searches/month + full literature reviews for just ₹199/mo.
                </p>
                <Link href="/pricing" className="btn btn-brand" style={{ textDecoration:"none", padding:"10px 28px", fontSize:14, fontWeight:700 }}>
                  Upgrade to Student ₹199/mo →
                </Link>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div style={{ display:"flex", gap:12, marginBottom:24 }}>
                <div style={{ width:28,height:28,borderRadius:7,background:"rgba(93,184,122,.1)",border:"1px solid rgba(93,184,122,.18)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                  <BookOpen size={12} style={{ color:"#5db87a" }}/>
                </div>
                <div>
                  <p style={{ fontSize:12.5, color:"var(--text-secondary)", marginBottom:10 }}>
                    Generating review for <em style={{ color:"var(--brand)" }}>{input}</em>…
                  </p>
                  {["Searching 200M+ papers…","Synthesising findings…","Writing structured review…"].map((s,i)=>(
                    <div key={s} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6 }}>
                      <div className="shimmer-line" style={{ width:13,height:13,borderRadius:"50%",animationDelay:`${i*.3}s` }}/>
                      <p style={{ fontSize:12, color:"var(--text-muted)" }}>{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="anim-in">
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                  <div className="tab-row" style={{ width:"auto" }}>
                    <button className={`tab${tab==="review"?" on":""}`}   onClick={()=>setTab("review")}>Review</button>
                    <button className={`tab${tab==="sources"?" on":""}`}  onClick={()=>setTab("sources")}>Sources ({result.papers.length})</button>
                    <button className={`tab${tab==="cite"?" on":""}`}     onClick={()=>setTab("cite")}>Cite</button>
                  </div>
                  <div style={{ display:"flex", gap:5 }}>
                    <button onClick={copy} className="icon-btn" title="Copy">{copied?<Check size={13}/>:<Copy size={13}/>}</button>
                    <button onClick={dl}   className="icon-btn" title="Download"><Download size={13}/></button>
                  </div>
                </div>

                {tab === "review" && (
                  <div className="card" style={{ padding:26 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}
                      components={{
                        h2:({children})=><h2 style={{ fontFamily:"var(--font-display)", fontSize:"1.05rem", color:"var(--text-primary)", margin:"1.4em 0 .5em", fontWeight:600 }}>{children}</h2>,
                        h3:({children})=><h3 style={{ fontSize:".93rem", color:"var(--text-primary)", fontWeight:600, margin:"1em 0 .3em" }}>{children}</h3>,
                        p:({children})=><p style={{ marginBottom:".85em", lineHeight:1.82, fontSize:14.5, color:"var(--text-secondary)" }}>{children}</p>,
                        strong:({children})=><strong style={{ color:"var(--text-primary)", fontWeight:600 }}>{children}</strong>,
                        ul:({children})=><ul style={{ paddingLeft:"1.3em", marginBottom:".7em" }}>{children}</ul>,
                        li:({children})=><li style={{ marginBottom:".3em", fontSize:14.5, color:"var(--text-secondary)" }}>{children}</li>,
                      }}>
                      {result.review}
                    </ReactMarkdown>
                  </div>
                )}
                {tab === "sources" && result.papers.map((p,i) => <PaperCard key={p.id} paper={p} index={i+1}/>)}
                {tab === "cite"    && <CitationPanel papers={result.papers}/>}
              </div>
            )}

            {/* Empty */}
            {!result && !loading && (
              <div style={{ textAlign:"center", paddingTop:40, opacity:.5 }}>
                <FileText size={36} style={{ color:"var(--text-faint)", margin:"0 auto 12px", display:"block" }}/>
                <p style={{ fontSize:13.5, color:"var(--text-muted)" }}>Enter a research topic and I&apos;ll write a full literature review</p>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="input-bar-wrap">
          <div className="input-bar">
            <textarea ref={taRef} value={input}
              onChange={e=>{ setInput(e.target.value); resize(); }}
              onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); void generate(); } }}
              placeholder="e.g. Social media effects on adolescent mental health…"
              className="input-textarea" rows={1} disabled={loading||!session||session?.user?.plan==="free"}/>
            <button onClick={() => void generate()} disabled={loading||!input.trim()||!session}
              className={`send-btn${input.trim()&&!loading&&session&&session?.user?.plan!=="free"?" ready":" idle"}`}>
              {loading ? <span className="spinner"/> : <ArrowUp size={14} style={{ color:input.trim()&&session?"#000":"var(--text-faint)" }}/>}
            </button>
          </div>
          <p className="input-hint">Generates ~1300 word structured review · Searches 3 academic databases</p>
        </div>
      </div>
    </Shell>
  );
}
