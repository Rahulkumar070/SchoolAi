"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { Search, BookOpen, FileText, LayoutDashboard, PlusCircle, LogOut, LogIn, X, Tag } from "lucide-react";
import Image from "next/image";

const NAV = [
  { href:"/search",    label:"Research Search",    icon:Search        },
  { href:"/review",    label:"Literature Review",   icon:BookOpen      },
  { href:"/upload",    label:"PDF Chat",            icon:FileText      },
  { href:"/dashboard", label:"My Library",          icon:LayoutDashboard },
  { href:"/pricing",   label:"Plans",               icon:Tag           },
];

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const path = usePathname();
  const { data: session } = useSession();

  return (
    <>
      {/* Logo */}
      <div className="sidebar-logo" style={{ borderBottom:"1px solid var(--border)", paddingBottom:14 }}>
        <Link href="/" style={{ display:"flex", alignItems:"center", gap:9, flex:1, textDecoration:"none" }}>
          <div className="logo-mark"><BookOpen size={13} color="#000" strokeWidth={2.5}/></div>
          <span style={{ fontFamily:"var(--font-ui)", fontWeight:700, fontSize:14, color:"var(--text-primary)", letterSpacing:"-0.01em" }}>ScholarAI</span>
        </Link>
        {onClose && <button className="icon-btn" onClick={onClose}><X size={15}/></button>}
      </div>

      {/* Body */}
      <div className="sidebar-body">
        <Link href="/search" className="new-chat-btn" style={{ textDecoration:"none" }}>
          <PlusCircle size={14} style={{ color:"var(--brand)" }}/> New Research
        </Link>

        <p className="sidebar-section-label">Tools</p>
        {NAV.map(({ href, label, icon:Icon }) => (
          <Link key={href} href={href} className={`nav-link${path===href?" active":""}`} onClick={onClose} style={{ textDecoration:"none" }}>
            <Icon size={14} className="nav-icon"/> {label}
          </Link>
        ))}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        {session ? (
          <>
            <div className="user-row" style={{ marginBottom:4 }}>
              {session.user?.image
                ? <Image src={session.user.image} alt="avatar" width={28} height={28} style={{ borderRadius:"50%" }}/>
                : <div className="avatar">{(session.user?.name?.[0] ?? "U").toUpperCase()}</div>
              }
              <div style={{ minWidth:0, flex:1 }}>
                <p className="truncate-1" style={{ fontSize:12, fontWeight:600, color:"var(--text-primary)" }}>{session.user?.name ?? "Researcher"}</p>
                <p className="truncate-1" style={{ fontSize:10, color:"var(--text-faint)" }}>{session.user?.email}</p>
              </div>
            </div>
            <button className="nav-link" onClick={() => void signOut()} style={{ color:"var(--text-muted)", marginTop:2 }}>
              <LogOut size={13} className="nav-icon"/> Sign out
            </button>
          </>
        ) : (
          <button className="nav-link" onClick={() => void signIn()} style={{ color:"var(--brand)" }}>
            <LogIn size={13} className="nav-icon"/> Sign in
          </button>
        )}
      </div>
    </>
  );
}
