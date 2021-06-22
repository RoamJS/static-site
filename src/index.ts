import Dashboard from "./components/StaticSiteDashboard";
import { runService } from "roamjs-components";

runService({
  id: "static-site",
  Dashboard,
});
