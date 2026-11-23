import Link from "next/link";

export default function Home() {
  return (
    <main style={{
      minHeight: "100svh", display: "grid", placeItems: "center",
      padding: "clamp(16px,4vw,36px)", background:
      "radial-gradient(ellipse at 65% 20%,#15476d 0%,#07192e 45%,#030b18 100%)",
      color: "#f4f8ff", fontFamily: "Arial, sans-serif"
    }}>
      <section aria-label="Trade Scheme FX welcome" style={{
        width: "min(100%,520px)", display: "grid", gap: "18px",
        textAlign: "center", justifyItems: "center"
      }}>
        <p style={{fontSize: "12px", letterSpacing: "0.22em", color: "#8cdbff", margin: 0}}>
          TRADE SCHEME FX
        </p>
        <h1 style={{fontSize: "clamp(32px,7vw,54px)", lineHeight: 1.08, margin: 0}}>
          Your Deriv trading workspace
        </h1>
        <p style={{color: "#b8d1e5", lineHeight: 1.55, margin: 0}}>
          Explore market intelligence and 15 bot strategies in one place.
          Connect your own Deriv account securely for supported Demo features.
        </p>
        <Link href="/login" style={{
          display: "block", width: "100%", maxWidth: "360px", padding: "16px",
          borderRadius: "12px", background: "#4dc4f6", color: "#05162a",
          fontWeight: 800, textDecoration: "none"
        }}>Continue to secure login</Link>
        <p style={{fontSize: "12px", color: "#9eb8ce", margin: 0}}>
          Deriv passwords are entered only on Deriv&apos;s official website when
          connecting your account. Existing workspace sign-in remains available.
        </p>
        <a href="https://home.deriv.com/dashboard/signup" target="_blank"
          rel="noopener noreferrer" style={{fontSize: "13px", color: "#9edfff"}}>
          New to Deriv? Create an account on Deriv
        </a>
        <p style={{fontSize: "11px", lineHeight: 1.5, color: "#92a7bc", margin: 0}}>
          Independent of Deriv. Trading involves risk. Demo funds are virtual.
          Automated broker purchases are not yet verified.
        </p>
      </section>
    </main>
  );
}
