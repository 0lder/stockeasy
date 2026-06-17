import { useNavigate } from "react-router-dom";
import StrategyPanel from "../components/StrategyPanel";

export default function StrategyPage() {
  const navigate = useNavigate();

  const handleRunStrategy = (query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return <StrategyPanel onRunStrategy={handleRunStrategy} />;
}
