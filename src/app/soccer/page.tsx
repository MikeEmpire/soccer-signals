import Link from "next/link";
import { Dashboard } from "../ui/dashboard";

export default function SoccerPage() {
  return <><Link className="legacy-link" href="/">← All sports</Link><Dashboard soccerOnly /></>;
}
