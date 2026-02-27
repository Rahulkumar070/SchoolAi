"use client";
import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { Check, BookOpen, Zap, Crown, Sparkles, ShieldCheck, CreditCard, Smartphone, Building2 } from "lucide-react";
import toast from "react-hot-toast";

declare global {
  interface Window {
    Razorpay: new (opts: RzpOpts) => { open(): void; on(e: string, cb: (r: unknown) => void): void };
  }
}
interface RzpOpts {
  key: string; subscription_id: string; name: string; description: string;
  prefill: { name: string; email: string }; theme: { color: string };
  handler(r: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }): void;
  modal?: { ondismiss?(): void };
}

const PLANS = [
  {
    id:"free",  name:"Free",    inr:"₹0",    period:"",       desc:"Perfect to get started",
    planId:"",  planLabel:"",   highlight:false, icon:Zap,
    iconBg:"var(--surface-2)", iconC:"var(--text-muted)", priceC:"var(--text-primary)",
    features:["10 AI searches / day","Cited answers from 200M+ papers","APA & MLA citations","Save 20 papers","1 PDF upload / month"],
    cta:"Start Free",
  },
  {
    id:"student", name:"Student", inr:"₹199", period:"/month", desc:"For students & researchers",
    planId:process.env.NEXT_PUBLIC_RAZORPAY_STUDENT_PLAN_ID ?? "", planLabel:"Student Plan",
    highlight:true, icon:Sparkles,
    iconBg:"var(--brand-dim)", iconC:"var(--brand)", priceC:"var(--brand)",
    features:["Unlimited AI searches","Full literature reviews","All 6 citation formats","20 PDF uploads / month","Unlimited paper library","Search history","Priority Claude AI"],
    cta:"Subscribe ₹199/mo",
  },
  {
    id:"pro", name:"Pro", inr:"₹499", period:"/month", desc:"For researchers & teams",
    planId:process.env.NEXT_PUBLIC_RAZORPAY_PRO_PLAN_ID ?? "", planLabel:"Pro Plan",
    highlight:false, icon:Crown,
    iconBg:"rgba(92,154,224,.1)", iconC:"#5c9ae0", priceC:"#5c9ae0",
    features:["Everything in Student","Unlimited PDF uploads","Research gap analysis","API access (100 req/day)","Team sharing (5 seats)","Priority email support","Early feature access"],
    cta:"Subscribe ₹499/mo",
  },
];

export default function Pricing() {
  const { data: session } = useSession();
  const router = useRouter();
  const [paying, setPaying] = useState("");

  const subscribe = async (plan: typeof PLANS[0]) => {
    if (plan.id === "free") { router.push(session ? "/search" : "/auth/signin"); return; }
    if (!session) { void signIn(); return; }
    if (!plan.planId) { toast.error("Payment not configured. Add NEXT_PUBLIC_RAZORPAY_STUDENT_PLAN_ID to .env"); return; }

    setPaying(plan.id);
    try {
      const r  = await fetch("/api/razorpay/order", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ planId:plan.planId, planName:plan.planLabel }) });
      const d  = await r.json() as { subscriptionId?:string; razorpayKeyId?:string; userName?:string; userEmail?:string; error?:string };
      if (!r.ok || !d.subscriptionId) { toast.error(d.error ?? "Order failed"); setPaying(""); return; }

      const opts: RzpOpts = {
        key:             d.razorpayKeyId ?? "",
        subscription_id: d.subscriptionId,
        name:            "ScholarAI",
        description:     plan.planLabel,
        prefill:         { name: d.userName ?? "", email: d.userEmail ?? "" },
        theme:           { color: "#e8a045" },
        handler: async (resp) => {
          try {
            const v = await fetch("/api/razorpay/verify", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...resp, planName:plan.planLabel }) });
            const vd = await v.json() as { success?:boolean; error?:string };
            if (vd.success) { toast.success(`🎉 ${plan.name} plan activated!`); router.push("/dashboard?upgraded=1"); }
            else toast.error(vd.error ?? "Verification failed");
          } catch { toast.error("Verification error. Contact support."); }
          finally { setPaying(""); }
        },
        modal: { ondismiss: () => setPaying("") },
      };
      const rzp = new window.Razorpay(opts);
      rzp.on("payment.failed", () => { toast.error("Payment failed. Try again."); setPaying(""); });
      rzp.open();
    } catch (e) { toast.error((e as Error).message); setPaying(""); }
  };

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload"/>
      <div style={{ background:"var(--bg)", minHeight:"100vh" }}>

        {/* Nav */}
        <nav className="landing-nav">
          <Link href="/" style={{ display:"flex", alignItems:"center", gap:9, textDecoration:"none" }}>
            <div className="logo-mark"><BookOpen size={13} color="#000" strokeWidth={2.5}/></div>
            <span style={{ fontWeight:700, fontSize:14, color:"var(--text-primary)" }}>ScholarAI</span>
          </Link>
          <div style={{ display:"flex", gap:8 }}>
            <Link href="/search" style={{ fontSize:12.5, color:"var(--text-secondary)", padding:"5px 10px", textDecoration:"none" }}>Search</Link>
            {session
              ? <Link href="/dashboard" className="btn btn-outline" style={{ padding:"6px 14px", textDecoration:"none", fontSize:12.5 }}>Dashboard</Link>
              : <button onClick={()=>void signIn()} className="btn btn-brand" style={{ padding:"7px 14px", fontSize:12.5 }}>Sign In</button>
            }
          </div>
        </nav>

        <div style={{ maxWidth:980, margin:"0 auto", padding:"60px 20px 72px" }}>

          {/* Header */}
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <p className="label-xs" style={{ marginBottom:10 }}>Pricing</p>
            <h1 style={{ fontFamily:"var(--font-display)", fontSize:"clamp(1.9rem,5vw,3rem)", fontWeight:400, color:"var(--text-primary)", marginBottom:12, lineHeight:1.12 }}>
              Research without limits
            </h1>
            <p style={{ fontSize:14.5, color:"var(--text-secondary)", maxWidth:420, margin:"0 auto 20px", lineHeight:1.7 }}>
              Pay instantly — UPI, card, net banking. No emails, no waiting. Powered by Razorpay.
            </p>
            {/* Payment method pills */}
            <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:8 }}>
              {[[Smartphone,"UPI / GPay / PhonePe"],[CreditCard,"Cards"],[Building2,"Net Banking"],[ShieldCheck,"Razorpay Secured"]].map(([Ic, label]) => {
                const Icon = Ic as React.FC<{ size: number; style: React.CSSProperties }>;
                return (
                  <span key={label as string} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 11px", borderRadius:99, background:"var(--surface)", border:"1px solid var(--border)", fontSize:11.5, color:"var(--text-secondary)" }}>
                    <Icon size={11} style={{ color:"var(--brand)" }}/>{label as string}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Plans */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))", gap:16, marginBottom:52 }}>
            {PLANS.map(plan => {
              const Icon = plan.icon;
              const busy = paying === plan.id;
              return (
                <div key={plan.id}
                  style={{ background:plan.highlight?"var(--surface)":"var(--bg-overlay)", border:`${plan.highlight?"1.5px":"1px"} solid ${plan.highlight?"var(--brand-border)":"var(--border)"}`, borderRadius:16, padding:28, display:"flex", flexDirection:"column", position:"relative", transition:"transform .18s, box-shadow .18s" }}
                  onMouseEnter={e=>{ (e.currentTarget as HTMLDivElement).style.transform="translateY(-3px)"; (e.currentTarget as HTMLDivElement).style.boxShadow="0 10px 32px rgba(0,0,0,.45)"; }}
                  onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.transform=""; (e.currentTarget as HTMLDivElement).style.boxShadow=""; }}>

                  {plan.highlight && (
                    <div style={{ position:"absolute", top:-11, left:"50%", transform:"translateX(-50%)", padding:"3px 14px", borderRadius:99, background:"var(--brand)", color:"#000", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>
                      Most Popular
                    </div>
                  )}

                  {/* Icon + name */}
                  <div style={{ display:"flex", alignItems:"center", gap:11, marginBottom:18 }}>
                    <div style={{ width:36,height:36,borderRadius:9,background:plan.iconBg,display:"flex",alignItems:"center",justifyContent:"center" }}>
                      <Icon size={16} style={{ color:plan.iconC }}/>
                    </div>
                    <div>
                      <p style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)", lineHeight:1 }}>{plan.name}</p>
                      <p style={{ fontSize:11, color:"var(--text-faint)", marginTop:2 }}>{plan.desc}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div style={{ display:"flex", alignItems:"baseline", gap:4, marginBottom:20 }}>
                    <span style={{ fontFamily:"var(--font-display)", fontSize:36, fontWeight:700, color:plan.priceC, lineHeight:1 }}>{plan.inr}</span>
                    {plan.period && <span style={{ fontSize:12, color:"var(--text-faint)" }}>{plan.period}</span>}
                  </div>

                  <div className="divider" style={{ marginBottom:18 }}/>

                  {/* Features */}
                  <ul style={{ listStyle:"none", display:"flex", flexDirection:"column", gap:9, flex:1, marginBottom:24 }}>
                    {plan.features.map(f=>(
                      <li key={f} style={{ display:"flex", alignItems:"flex-start", gap:9, fontSize:13, color:"var(--text-secondary)", lineHeight:1.4 }}>
                        <Check size={12} style={{ color:plan.highlight?"var(--brand)":"var(--green)", flexShrink:0, marginTop:2 }}/>{f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button onClick={()=>void subscribe(plan)} disabled={busy}
                    style={{ width:"100%", padding:"12px 16px", borderRadius:10, border:plan.highlight?"none":"1px solid var(--border-mid)", background:plan.highlight?"var(--brand)":plan.id==="free"?"var(--surface-2)":"var(--surface-2)", color:plan.highlight?"#000":"var(--text-primary)", fontFamily:"var(--font-ui)", fontSize:13, fontWeight:600, cursor:busy?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:7, opacity:busy?.7:1, transition:"all .15s" }}
                    onMouseEnter={e=>{ if(!busy && plan.highlight) (e.currentTarget as HTMLButtonElement).style.background="#d4903a"; }}
                    onMouseLeave={e=>{ if(plan.highlight) (e.currentTarget as HTMLButtonElement).style.background="var(--brand)"; }}>
                    {busy ? <><span className="spinner" style={{ width:13,height:13,borderTopColor:plan.highlight?"#000":"var(--brand)" }}/> Opening checkout…</> : plan.cta}
                  </button>
                </div>
              );
            })}
          </div>

          {/* FAQ */}
          <div style={{ maxWidth:700, margin:"0 auto" }}>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:600, color:"var(--text-primary)", marginBottom:24, textAlign:"center" }}>
              Questions? Answered.
            </h2>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px,1fr))", gap:"20px 36px" }}>
              {[
                { q:"Is payment secure?",              a:"All payments processed by Razorpay — PCI-DSS certified, used by Zomato, Swiggy, 5M+ businesses." },
                { q:"Can I cancel anytime?",           a:"Yes. Cancel from your dashboard. Plan stays active until the billing period ends, then reverts to Free." },
                { q:"Does it auto-renew?",             a:"Yes, monthly. You'll get an email before each charge. Unsubscribe anytime in one click." },
                { q:"Do you store card details?",      a:"No. Razorpay handles all card data securely. We never see your payment information." },
                { q:"What if my payment fails?",       a:"Razorpay retries automatically. If it keeps failing, email us at hello@scholarai.in." },
                { q:"Is there a student discount?",    a:"₹199/mo is already our student-friendly price. Email us with your college ID for special rates." },
              ].map(({q,a})=>(
                <div key={q}>
                  <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", marginBottom:4 }}>{q}</p>
                  <p style={{ fontSize:12.5, color:"var(--text-secondary)", lineHeight:1.65 }}>{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ borderTop:"1px solid var(--border)", padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
          <span style={{ fontSize:11.5, color:"var(--text-faint)" }}>© 2025 ScholarAI · Made in India 🇮🇳</span>
          <span style={{ fontSize:11.5, color:"var(--text-faint)", display:"flex", alignItems:"center", gap:5 }}>
            <ShieldCheck size={11} style={{ color:"var(--green)" }}/> Payments secured by Razorpay
          </span>
        </footer>
      </div>
    </>
  );
}
