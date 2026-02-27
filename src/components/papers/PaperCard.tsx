"use client";
import { ExternalLink, BookmarkPlus, BookmarkCheck, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Paper } from "@/types";

const SRC: Record<string,string> = { "Semantic Scholar":"#5c9ae0", "OpenAlex":"#5db87a", "arXiv":"#e05c5c" };

export default function PaperCard({ paper, index }: { paper: Paper; index?: number }) {
  const [saved, setSaved]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [exp, setExp]       = useState(false);
  const { data: session }   = useSession();

  const save = async () => {
    if (!session) { toast.error("Sign in to save"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/papers", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(paper) });
      const d = await r.json() as { saved: boolean };
      setSaved(d.saved);
      toast.success(d.saved ? "Saved to library" : "Removed");
    } catch { toast.error("Failed"); } finally { setSaving(false); }
  };

  const c = SRC[paper.source] ?? "var(--text-muted)";

  return (
    <div className="paper-item">
      <div style={{ display:"flex", gap:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          {/* Meta row */}
          <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:5, marginBottom:6 }}>
            {index !== undefined && <span className="badge badge-brand">[{index}]</span>}
            <span style={{ fontSize:10, fontWeight:600, padding:"2px 7px", borderRadius:99, background:`${c}14`, color:c, border:`1px solid ${c}25` }}>{paper.source}</span>
            {(paper.citationCount ?? 0) > 0 && <span style={{ fontSize:10, color:"var(--text-faint)" }}>{paper.citationCount?.toLocaleString()} cited</span>}
            {paper.year && <span style={{ fontSize:10, color:"var(--text-faint)" }}>{paper.year}</span>}
          </div>

          {/* Title */}
          <p style={{ fontSize:12.5, fontWeight:600, color:"var(--text-primary)", lineHeight:1.4, marginBottom:3 }}>
            {paper.url
              ? <a href={paper.url} target="_blank" rel="noopener noreferrer" style={{ color:"inherit", textDecoration:"none" }} onMouseEnter={e=>(e.currentTarget.style.color="var(--brand)")} onMouseLeave={e=>(e.currentTarget.style.color="var(--text-primary)")}>{paper.title}</a>
              : paper.title}
          </p>

          {/* Authors */}
          <p style={{ fontSize:10.5, color:"var(--text-faint)", marginBottom:5 }}>
            {paper.authors.slice(0,4).join(", ")}{paper.authors.length>4?" et al.":""}
            {paper.journal ? ` · ${paper.journal}` : ""}
          </p>

          {/* Abstract */}
          {paper.abstract && <>
            <p style={{ fontSize:11.5, color:"var(--text-secondary)", lineHeight:1.6, overflow:exp?"visible":"hidden", display:exp?"block":"-webkit-box", WebkitLineClamp:exp?undefined:2, WebkitBoxOrient:"vertical" }}>{paper.abstract}</p>
            {paper.abstract.length > 160 && (
              <button onClick={() => setExp(!exp)} style={{ fontSize:10.5, color:"var(--brand)", background:"none", border:"none", cursor:"pointer", marginTop:3, display:"flex", alignItems:"center", gap:2 }}>
                {exp ? <><ChevronUp size={10}/>Less</> : <><ChevronDown size={10}/>More</>}
              </button>
            )}
          </>}
        </div>

        {/* Actions */}
        <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
          {paper.url && <a href={paper.url} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Open"><ExternalLink size={12}/></a>}
          <button onClick={() => void save()} disabled={saving} className="icon-btn" title={saved?"Remove":"Save"} style={{ color:saved?"var(--brand)":undefined }}>
            {saved ? <BookmarkCheck size={12}/> : <BookmarkPlus size={12}/>}
          </button>
        </div>
      </div>
    </div>
  );
}
