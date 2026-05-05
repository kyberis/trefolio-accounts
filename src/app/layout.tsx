import "./globals.css";

import { ImpersonationBanner } from "@/components/ImpersonationBanner";

const isProd = process.env.NODE_ENV === "production";

export const metadata = {
  title: "trefolio accounts · sign in",
  description:
    "Your unified trefolio account. Sign in once and access trefolio, Clara and Will with the same credentials.",
  robots: isProd ? { index: false, follow: false } : { index: false, follow: false },
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
