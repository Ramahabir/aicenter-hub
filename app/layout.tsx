import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Service Hub | AI Center UB",
  description: "Private digital services for AI Center Universitas Brawijaya.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
