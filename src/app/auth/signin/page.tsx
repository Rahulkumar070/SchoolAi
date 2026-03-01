"use client";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BookOpen, Github } from "lucide-react";
import Link from "next/link";

export default function SignIn() {
  const { data: session } = useSession();
  const router = useRouter();
  useEffect(() => { if (session) router.push("/search"); }, [session, router]);

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:340 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <Link href="/" style={{ display:"inline-flex", alignItems:"center", gap:9, textDecoration:"none", marginBottom:22 }}>
            <div className="logo-mark"><BookOpen size={13} color="#000" strokeWidth={2.5}/></div>
            <span style={{ fontWeight:700, fontSize:16, color:"var(--text-primary)" }}>Researchly</span>
          </Link>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:400, color:"var(--text-primary)", marginBottom:7 }}>Welcome back</h1>
          <p style={{ fontSize:13, color:"var(--text-secondary)" }}>Sign in to access your research library</p>
        </div>

        <div className="card" style={{ padding:24, display:"flex", flexDirection:"column", gap:10 }}>
          <button onClick={() => void signIn("google", { callbackUrl:"/search" })}
            style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"11px 16px", borderRadius:10, border:"1px solid var(--border-mid)", background:"var(--surface)", color:"var(--text-primary)", fontFamily:"var(--font-ui)", fontSize:13, fontWeight:500, cursor:"pointer", transition:"all .14s", width:"100%" }}
            onMouseEnter={e=>{e.currentTarget.style.background="var(--surface-2)";e.currentTarget.style.borderColor="var(--border-hi)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="var(--surface)";e.currentTarget.style.borderColor="var(--border-mid)";}}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <button onClick={() => void signIn("github", { callbackUrl:"/search" })}
            style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"11px 16px", borderRadius:10, border:"none", background:"#24292e", color:"#fff", fontFamily:"var(--font-ui)", fontSize:13, fontWeight:500, cursor:"pointer", transition:"background .14s", width:"100%" }}
            onMouseEnter={e=>{e.currentTarget.style.background="#2f363d";}}
            onMouseLeave={e=>{e.currentTarget.style.background="#24292e";}}>
            <Github size={15}/> Continue with GitHub
          </button>

          <div className="divider" style={{ marginTop:4 }}/>
          <p style={{ textAlign:"center", fontSize:11, color:"var(--text-faint)" }}>Free plan · 10 searches/day · No card needed</p>
        </div>

        <p style={{ textAlign:"center", marginTop:16, fontSize:12 }}>
          <Link href="/" style={{ color:"var(--text-muted)", textDecoration:"none" }}>← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
