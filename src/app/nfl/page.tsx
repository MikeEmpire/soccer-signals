import type { Metadata } from "next";
import { NFLReceivingDashboard } from "../ui/nfl-receiving-dashboard";

export const metadata: Metadata = { title: "NFL Props Research | Sports Signals" };
export default function NFLPage() { return <NFLReceivingDashboard />; }
