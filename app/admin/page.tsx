import Link from 'next/link';

export default function AdminPage() {
  return <main className="admin-page"><div className="admin-card"><div className="eyebrow">TRADE SCHEME FX</div><h1>Admin workspace</h1><p>This is a starter preview page. Secure administrator sign-in and customer-management functions have not yet been connected.</p><div className="admin-notice">For security, do not use this preview as a live admin portal or enter passwords here.</div><Link className="button" href="/">Back to homepage</Link></div></main>;
}
