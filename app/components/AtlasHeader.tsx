import Link from "next/link";

export function AtlasHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="wordmark" href="/" aria-label="OSA Association Atlas home">
          <span>OSA</span>
          <i aria-hidden="true" />
          <span>Association Atlas</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/explore">Disease scans</Link>
          <Link href="/was">Other WAS</Link>
          <Link href="/feature?code=401.1">Feature lookup</Link>
          <Link href="/methods">Methods</Link>
        </nav>
        <span className="release-tag">Research preview · R1</span>
      </div>
    </header>
  );
}
