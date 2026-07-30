import Link from "next/link";

export function PhenotypeSubnav({ active }: { active: "profiles" | "outcomes" }) {
  return (
    <nav className="phenotype-subnav" aria-label="Phenotype section">
      <div>
        <span>Phenotypes</span>
        <strong>Cross-domain OSA research taxonomy</strong>
      </div>
      <div>
        <Link href="/phenotypes" aria-current={active === "profiles" ? "page" : undefined}>
          Profiles &amp; clusters
        </Link>
        <Link href="/phenotypes/outcomes" aria-current={active === "outcomes" ? "page" : undefined}>
          Outcome panels
          <span>168</span>
        </Link>
      </div>
    </nav>
  );
}
