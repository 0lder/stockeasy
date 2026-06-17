import { useNavigate } from "react-router-dom";
import WatchlistPanel from "../components/WatchlistPanel";

export default function WatchlistPage() {
  const navigate = useNavigate();

  const handleSearch = (q: string) => {
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return <WatchlistPanel onSearch={handleSearch} />;
}
