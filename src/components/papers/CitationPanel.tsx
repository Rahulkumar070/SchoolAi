"use client";
import { useState } from "react";
import { Copy, Download, Check } from "lucide-react";
import { citeAll } from "@/lib/citations";
import { Paper, CitationFormat } from "@/types";
import toast from "react-hot-toast";

const FMTS: { v: CitationFormat; l: string }[] = [
  {v:"apa",l:"APA"},{v:"mla",l:"MLA"},{v:"ieee",l:"IEEE"},
  {v:"chicago",l:"Chicago"},{v:"vancouver",l:"Vancouver"},{v:"bibtex",l:"BibTeX"},
];

export default function CitationPanel({ papers }: { papers: Paper[] }) {
  const [fmt, setFmt] = useState<CitationFormat>("apa");
  const [ok, setOk]   = useState(false);
  const text = citeAll(papers, fmt);

  const copy = () => { void navigator.clipboard.writeText(text); setOk(true); toast.success("Copied"); setTimeout(()=>setOk(false),2000); };
  const dl   = () => {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text],{type:"text/plain"})), download:`refs.${fmt==="bibtex"?"bib":"txt"}` });
    a.click(); toast.success("Downloaded");
  };

  return (
    <div style={{ padding:14 }}>
      <p className="label-xs" style={{ marginBottom:10 }}>Citation Format</p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:12 }}>
        {FMTS.map(f => (
          <button key={f.v} onClick={() => setFmt(f.v)} style={{ padding:"3px 9px", borderRadius:6, fontSize:11, fontWeight:600, fontFamily:"var(--font-ui)", cursor:"pointer", border:"1px solid", background:fmt===f.v?"var(--brand)":"var(--surface-2)", color:fmt===f.v?"#000":"var(--text-muted)", borderColor:fmt===f.v?"var(--brand)":"var(--border-mid)", transition:"all 0.14s" }}>{f.l}</button>
        ))}
      </div>
      <div style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, padding:10, maxHeight:100, overflowY:"auto", marginBottom:10 }}>
        <pre style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-secondary)", whiteSpace:"pre-wrap" }}>{text.slice(0,350)}{text.length>350?"…":""}</pre>
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <button onClick={copy} className="btn btn-outline" style={{ flex:1, padding:"6px 8px", fontSize:11 }}>{ok?<Check size={11}/>:<Copy size={11}/>} Copy</button>
        <button onClick={dl}   className="btn btn-outline" style={{ flex:1, padding:"6px 8px", fontSize:11 }}><Download size={11}/> Save</button>
      </div>
    </div>
  );
}
