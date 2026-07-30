import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0].trim();
  const host = forwardedHost || requestHeaders.get("host") || "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProtocol || (host.startsWith("localhost") ? "http" : "https");
  const origin = new URL(`${protocol}://${host}`).origin;
  const socialImage = new URL("/og.png", origin).toString();
  const description =
    "Explore aggregate associations, octant phenotypes, and cumulative-incidence curves linking obstructive sleep apnea with diseases, laboratory patterns, medications, questionnaires, behaviors, procedures, and healthcare use.";

  return {
    title: {
      default: "OSA Association Atlas",
      template: "%s · OSA Association Atlas",
    },
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "OSA Association Atlas",
      description,
      type: "website",
      images: [{ url: socialImage, width: 1732, height: 909, alt: "OSA Association Atlas — Explore the clinical phenome" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "OSA Association Atlas",
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
