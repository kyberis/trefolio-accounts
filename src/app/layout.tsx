import type { Metadata } from "next";

import "./globals.css";

import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { getPublicIssuer } from "@/lib/public-url";

const isProd = process.env.NODE_ENV === "production";

export const metadata: Metadata = {
  metadataBase: new URL(getPublicIssuer()),
  title: "trefolio accounts · sign in",
  description:
    "Your unified trefolio account. Sign in once and access trefolio, Clara and Will with the same credentials.",
  robots: isProd ? { index: false, follow: false } : { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon.png", sizes: "48x48", type: "image/png" },
    ],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="app-body">
        <ImpersonationBanner />
        {children}
      </body>
    </html>
  );
}
