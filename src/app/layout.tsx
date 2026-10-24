import type { Metadata, Viewport } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import { siteUrl } from "@/components/layout/site-url";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const DESCRIPTION =
  "Upload an image and receive one of exactly two verdicts, HOT DOG or NOT HOT DOG, backed by published policy, an audit trail and a certificate you can print.";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "HDX · Hot Dog or Not, Enterprise Cloud",
    template: "%s · HDX",
  },
  description: DESCRIPTION,
  applicationName: "HDX",
  openGraph: {
    type: "website",
    siteName: "HDX",
    title: "HDX · Hot Dog or Not, Enterprise Cloud",
    description: DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "HDX · Hot Dog or Not, Enterprise Cloud",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1F3A",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sourceSerif.variable} ${sourceSans.variable}`}>
      <body className="min-h-dvh bg-white font-sans text-body antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-card bg-mustard px-4 py-3 font-bold text-navy focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
