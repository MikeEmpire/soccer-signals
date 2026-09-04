import Link from "next/link";
import { Dashboard } from "../ui/soccer-dashboard";

export default function SoccerPage() {
  return <><Link className="legacy-link" href="/">← All sports</Link><Dashboard /></>;
}
