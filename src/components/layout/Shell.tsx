"use client";
import { useState } from "react";
import Sidebar from "./Sidebar";
import { Menu } from "lucide-react";

export default function Shell({ children, rightPanel }: { children: React.ReactNode; rightPanel?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      {/* Sidebar */}
      <div className={`sidebar${open ? " open" : ""}`}>
        <Sidebar onClose={() => setOpen(false)}/>
      </div>
      {open && <div onClick={() => setOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:49 }}/>}

      {/* Main */}
      <div className="main">
        {/* Mobile bar */}
        <div className="mobile-bar">
          <button className="icon-btn" onClick={() => setOpen(true)}><Menu size={17}/></button>
          <span style={{ fontWeight:700, fontSize:13, color:"var(--text-primary)" }}>ScholarAI</span>
        </div>
        {children}
      </div>

      {/* Right panel */}
      {rightPanel && <div className="right-panel">{rightPanel}</div>}
    </div>
  );
}
