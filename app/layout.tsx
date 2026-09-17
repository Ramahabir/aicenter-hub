import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Service Hub | AI Center Hub",
  description: "Private digital services for AI Center Universitas Brawijaya.",
  icons: {
    icon: [
      { url: "/service-hub/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/service-hub/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
