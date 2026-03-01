"use client";
import { useState, useRef, useCallback } from "react";
import Shell from "@/components/layout/Shell";
import ReactMarkdown from "react-markdown";
import { FileText, Upload, ArrowUp, X, Lock, BookOpen, User, AlertCircle, MessageSquare, Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ChatMessage } from "@/types";

const QUICK = [
  "What is the main research question?",
  "What methodology was used?",
  "What are the key findings?",
  "What are the limitations?",
  "How does this compare to prior work?",
  "Summarise the conclusions",
];

// Pure JS PDF text extraction — no external library needed
function extractPDF(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const textParts: string[] = [];

  // Decode to latin1 for regex processing
  let raw = "";
  for (let i = 0; i < Math.min(bytes.length, 600_000); i++) {
    const c = bytes[i];
    raw += c >= 32 && c < 127 ? String.fromCharCode(c) : c === 10 || c === 13 ? "\n" : " ";
  }

  // Extract text from BT...ET blocks (PDF text operators)
  const btRe = /BT([\s\S]{1,2000}?)ET/g;
  let m: RegExpExecArray | null;
  while ((m = btRe.exec(raw)) !== null) {
    const block = m[1];
    // Extract strings in () and <>
    const strRe = /\(([^)]{1,300})\)/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRe.exec(block)) !== null) {
      const s = sm[1].trim();
      if (s.length > 1 && /[a-zA-Z]{2,}/.test(s)) textParts.push(s);
    }
  }

  // Also extract stream text
  const streamRe = /stream\r?\n([\s\S]{1,50000}?)\r?\nendstream/g;
  while ((m = streamRe.exec(raw)) !== null) {
    const chunk = m[1].replace(/[^\x20-\x7e\n]/g, " ").replace(/\s+/g, " ").trim();
    if (chunk.length > 30) textParts.push(chunk);
  }

  const combined = textParts.join(" ").replace(/\s+/g, " ").trim();
  return combined.slice(0, 55_000);
}

export default function UploadPage() {
  const [file,     setFile]     = useState<File|null>(null);
  const [pdfText,  setPdfText]  = useState("");
  const [parsing,  setParsing]  = useState(false);
  const [parseErr, setParseErr] = useState("");
  const [msgs,     setMsgs]     = useState<ChatMessage[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [drag,     setDrag]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef  = useRef<HTMLDivElement>(null);
  const taRef   = useRef<HTMLTextAreaElement>(null);
  const { data: session } = useSession();
  const isFree = !session || (session?.user?.plan ?? "free") === "free";

  const scrollDown = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior:"smooth" }), 80);
  const resize = () => { const el = taRef.current; if(!el) return; el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,140)+"px"; };

  const processFile = useCallback(async (f: File) => {
    if (!f.name.endsWith(".pdf") && !f.type.includes("pdf")) { toast.error("Please upload a PDF"); return; }
    if (f.size > 25*1024*1024) { toast.error("Max 25MB"); return; }

    setFile(f); setParsing(true); setParseErr(""); setMsgs([]); setPdfText("");

    try {
      const buf = await f.arrayBuffer();
      let text = extractPDF(buf);

      // Fallback: raw text decode
      if (text.length < 80) {
        text = new TextDecoder("utf-8", { fatal:false }).decode(buf)
          .replace(/[^\x20-\x7e\n]/g, " ").replace(/\s{3,}/g, " ").trim().slice(0, 55_000);
      }

      if (text.length < 80) {
        setParseErr("Could not extract text. This PDF may be image-based (scanned). Try a text-based PDF.");
        setParsing(false); setFile(null); return;
      }

      setPdfText(text);
      setMsgs([{ role:"assistant", content:`I've read **"${f.name}"** (${(f.size/1024).toFixed(0)}KB, ${text.length.toLocaleString()} characters extracted). I'm ready to answer questions about this paper. What would you like to know?` }]);
      toast.success("PDF ready!");
    } catch (e) {
      console.error(e);
      setParseErr("Failed to read this PDF. Try another file.");
      setFile(null);
    } finally { setParsing(false); }
  }, []);

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void processFile(f); };

  const send = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || loading || !pdfText) return;
    setMsgs(prev => [...prev, { role:"user", content:question }]);
    setInput(""); if (taRef.current) taRef.current.style.height="auto";
    setLoading(true); scrollDown();
    try {
      const r = await fetch("/api/upload",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ question, pdfText, history:msgs.slice(-8) }) });
      const d = await r.json() as { answer?:string; error?:string };
      if (!r.ok) toast.error(d.error??"Failed");
      else { setMsgs(prev => [...prev, { role:"assistant", content:d.answer??"" }]); scrollDown(); }
    } catch { toast.error("Network error"); } finally { setLoading(false); }
  };

  // Left panel content
  const LeftPanel = (
    <div style={{ padding:14, display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:9 }}>
        <div style={{ width:26,height:26,borderRadius:7,background:"var(--brand-dim)",border:"1px solid var(--brand-border)",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <FileText size={12} style={{ color:"var(--brand)" }}/>
        </div>
        <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)" }}>PDF Chat</p>
      </div>

      {!session ? (
        <div style={{ padding:12, background:"var(--brand-dim)", border:"1px solid var(--brand-border)", borderRadius:9 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:7 }}>
            <Lock size={11} style={{ color:"var(--brand)" }}/>
            <p style={{ fontSize:12, fontWeight:600, color:"var(--text-primary)" }}>Sign in required</p>
          </div>
          <p style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:9, lineHeight:1.5 }}>Account needed to use PDF Chat</p>
          <Link href="/auth/signin" className="btn btn-brand" style={{ width:"100%", justifyContent:"center", textDecoration:"none", padding:"7px 10px", fontSize:12 }}>Sign In</Link>
        </div>
      ) : isFree ? (
        <div style={{ padding:14, background:"var(--surface)", border:"1px solid var(--brand-border)", borderRadius:10 }}>
          <div style={{ width:34, height:34, borderRadius:9, background:"var(--brand-dim)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
            <Sparkles size={16} style={{ color:"var(--brand)" }}/>
          </div>
          <p style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)", textAlign:"center", marginBottom:5 }}>Paid Feature</p>
          <p style={{ fontSize:11.5, color:"var(--text-secondary)", textAlign:"center", marginBottom:12, lineHeight:1.55 }}>
            PDF Chat requires Student or Pro plan
          </p>
          <Link href="/pricing" className="btn btn-brand" style={{ width:"100%", justifyContent:"center", textDecoration:"none", padding:"8px 10px", fontSize:12.5, fontWeight:700 }}>
            Upgrade ₹199/mo →
          </Link>
        </div>
      ) : !file ? (
        <div className={`drop-zone${drag?" active":""}`}
          onDrop={onDrop} onDragOver={e=>{ e.preventDefault(); setDrag(true); }} onDragLeave={()=>setDrag(false)}
          onClick={() => fileRef.current?.click()}>
          <Upload size={20} style={{ color:drag?"var(--brand)":"var(--text-faint)", margin:"0 auto 8px", display:"block" }}/>
          <p style={{ fontSize:12.5, fontWeight:600, color:drag?"var(--brand)":"var(--text-secondary)", marginBottom:3 }}>{drag?"Drop here":"Upload PDF"}</p>
          <p style={{ fontSize:11, color:"var(--text-faint)" }}>Click or drag & drop · Max 25MB</p>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display:"none" }}
            onChange={e=>{ const f=e.target.files?.[0]; if(f) void processFile(f); e.target.value=""; }}/>
        </div>
      ) : (
        <div>
          <div style={{ padding:"10px 11px", background:"var(--bg-overlay)", border:"1px solid var(--border-mid)", borderRadius:9, marginBottom:9 }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
              <div style={{ width:26,height:26,borderRadius:6,background:"var(--brand-dim)",border:"1px solid var(--brand-border)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <FileText size={11} style={{ color:"var(--brand)" }}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p className="truncate-1" style={{ fontSize:11.5, fontWeight:600, color:"var(--text-primary)" }}>{file.name}</p>
                <p style={{ fontSize:10, color:"var(--text-faint)", marginTop:1 }}>{(file.size/1024).toFixed(0)}KB</p>
                {parsing && <p style={{ fontSize:10, color:"var(--brand)", marginTop:3 }}>Extracting text…</p>}
                {pdfText && !parsing && <p style={{ fontSize:10, color:"var(--green)", marginTop:3 }}>✓ Ready · {pdfText.length.toLocaleString()} chars</p>}
                {parseErr && <p style={{ fontSize:10, color:"var(--red)", marginTop:3 }}>{parseErr}</p>}
              </div>
              <button onClick={()=>{ setFile(null); setPdfText(""); setMsgs([]); setParseErr(""); }}
                style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-faint)", padding:2 }}>
                <X size={12}/>
              </button>
            </div>
          </div>
          <button onClick={()=>fileRef.current?.click()} className="btn btn-outline" style={{ width:"100%", justifyContent:"center", padding:"7px 8px", fontSize:11, marginBottom:14 }}>
            <Upload size={11}/> Change PDF
          </button>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display:"none" }}
            onChange={e=>{ const f=e.target.files?.[0]; if(f) void processFile(f); e.target.value=""; }}/>
        </div>
      )}

      {/* Quick questions */}
      {pdfText && (
        <>
          <p className="label-xs">Quick Questions</p>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {QUICK.map(q=>(
              <button key={q} onClick={()=>void send(q)}
                style={{ padding:"7px 9px", borderRadius:7, background:"var(--bg-overlay)", border:"1px solid var(--border)", color:"var(--text-secondary)", fontFamily:"var(--font-ui)", fontSize:11.5, lineHeight:1.4, cursor:"pointer", textAlign:"left", transition:"all .13s" }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor="var(--brand-border)"; e.currentTarget.style.color="var(--text-primary)"; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.color="var(--text-secondary)"; }}>
                {q}
              </button>
            ))}
          </div>
        </>
      )}

      {parseErr && (
        <div style={{ padding:"10px 11px", background:"rgba(224,92,92,.07)", border:"1px solid rgba(224,92,92,.16)", borderRadius:9 }}>
          <div style={{ display:"flex", gap:6 }}>
            <AlertCircle size={12} style={{ color:"var(--red)", flexShrink:0, marginTop:1 }}/>
            <p style={{ fontSize:11, color:"var(--red)", lineHeight:1.5 }}>{parseErr}</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Shell>
      <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>
        {/* Left mini panel */}
        <div style={{ width:220, flexShrink:0, borderRight:"1px solid var(--border)", overflowY:"auto", background:"var(--bg-raised)" }}>
          {LeftPanel}
        </div>

        {/* Chat */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
          <div className="chat-col">
            {msgs.length === 0 && !loading ? (
              <div className="welcome">
                <div className="welcome-mark"><MessageSquare size={22} style={{ color:"var(--brand)" }}/></div>
                <h2 style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:400, color:"var(--text-primary)", marginBottom:8 }}>
                  {session ? "Upload a PDF to start chatting" : "Sign in to use PDF Chat"}
                </h2>
                <p style={{ fontSize:13.5, color:"var(--text-secondary)", maxWidth:340, lineHeight:1.65 }}>
                  {session
                    ? "Upload any academic paper and ask about its methods, findings, statistics or conclusions."
                    : isFree
                    ? "PDF Chat is a paid feature. Upgrade to Student or Pro to upload and chat with academic papers."
                    : "PDF Chat requires a free account. Sign in with Google or GitHub — it takes 10 seconds."}
                </p>
                {!session && <Link href="/auth/signin" className="btn btn-brand" style={{ textDecoration:"none", padding:"10px 22px", marginTop:10 }}>Sign In Free</Link>}
              </div>
            ) : (
              <div className="messages-wrap">
                {msgs.map((m, i)=>(
                  <div key={i} className={`msg-row${m.role==="user"?" user":""}`}>
                    {m.role === "assistant" && (
                      <div className="msg-avatar"><BookOpen size={12} style={{ color:"var(--brand)" }}/></div>
                    )}
                    {m.role === "user" ? (
                      <div className="msg-bubble">{m.content}</div>
                    ) : (
                      <div className="msg-ai-content">
                        <ReactMarkdown components={{
                          p:({children})=><p style={{ marginBottom:".65em", lineHeight:1.72 }}>{children}</p>,
                          strong:({children})=><strong style={{ color:"var(--text-primary)", fontWeight:600 }}>{children}</strong>,
                          code:({children})=><code style={{ fontFamily:"var(--font-mono)", fontSize:11.5, background:"var(--surface-2)", color:"var(--brand)", padding:"2px 5px", borderRadius:4 }}>{children}</code>,
                          ul:({children})=><ul style={{ paddingLeft:"1.2em", marginBottom:".5em" }}>{children}</ul>,
                          li:({children})=><li style={{ marginBottom:".2em" }}>{children}</li>,
                        }}>{m.content}</ReactMarkdown>
                      </div>
                    )}
                    {m.role === "user" && (
                      <div style={{ width:28,height:28,borderRadius:7,background:"var(--surface-2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                        <User size={12} style={{ color:"var(--text-muted)" }}/>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="msg-row">
                    <div className="msg-avatar"><BookOpen size={12} style={{ color:"var(--brand)" }}/></div>
                    <div style={{ padding:"10px 13px", background:"var(--bg-overlay)", border:"1px solid var(--border)", borderRadius:"4px 12px 12px 12px", display:"flex", alignItems:"center", gap:4 }}>
                      <span className="typing-dot"/><span className="typing-dot"/><span className="typing-dot"/>
                    </div>
                  </div>
                )}
                <div ref={endRef}/>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="input-bar-wrap">
            <div className="input-bar">
              <textarea ref={taRef} value={input}
                onChange={e=>{ setInput(e.target.value); resize(); }}
                onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); void send(); } }}
                placeholder={pdfText?"Ask about this paper…":"Upload a PDF first"}
                className="input-textarea" rows={1} disabled={!pdfText||loading}/>
              <button onClick={()=>void send()} disabled={!pdfText||!input.trim()||loading}
                className={`send-btn${pdfText&&input.trim()&&!loading?" ready":" idle"}`}>
                {loading?<span className="spinner"/>:<ArrowUp size={14} style={{ color:pdfText&&input.trim()?"#000":"var(--text-faint)" }}/>}
              </button>
            </div>
            <p className="input-hint">Analyses methods, findings, statistics · Powered by Claude AI</p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
