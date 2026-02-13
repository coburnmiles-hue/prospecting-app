import "./globals.css";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
});

export const metadata = {
  title: "Pocket Prospector",
  description: "Prospecting App",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-video-preview': -1,
      'max-image-preview': 'none',
      'max-snippet': -1,
    },
  },
  other: {
    'google-site-verification': 'none',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />
        <meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />
        <meta name="googlebot-news" content="noindex, nofollow" />
        <meta name="bingbot" content="noindex, nofollow, noarchive, nosnippet" />
        <meta name="slurp" content="noindex, nofollow, noarchive, nosnippet" />
        <meta name="duckduckbot" content="noindex, nofollow" />
        <meta name="baiduspider" content="noindex, nofollow" />
        <meta name="yandex" content="noindex, nofollow" />
        <meta name="pinterest" content="nopin" />
      </head>
      <body
        className={`${poppins.variable} antialiased bg-[#020617] text-slate-100`}
        style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
