import { useNavigate } from "react-router-dom";
import ConditionBuilder from "../components/ConditionBuilder";

export default function BuilderPage() {
  const navigate = useNavigate();

  const handleQuery = (q: string) => {
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return <ConditionBuilder onQuery={handleQuery} />;
}
