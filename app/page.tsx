import type { Metadata } from "next";
import ServiceHub from "./ServiceHub";

export const metadata: Metadata = {
  title: "Service Hub | AI Center UB",
  description: "Private digital services for the AI Center Universitas Brawijaya team.",
};

export default function Home() {
  return <ServiceHub />;
}
