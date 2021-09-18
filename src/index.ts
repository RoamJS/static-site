import Dashboard from "./components/StaticSiteDashboard";
import { runService } from "roamjs-components";
import { addStyle } from "roam-client";

addStyle(`.bp3-tab-panel {
  width: 100%;
}

.roamjs-codemirror-wrapper {
  border: 1px solid lightgray;
  position: relative;
}

.roamjs-codemirror-wrapper .CodeMirror-sizer {
  margin-left: 29px !important;
}

.roamjs-codemirror-wrapper .CodeMirror-linenumbers{
  width: 29px !important;
}`);

runService({
  id: "static-site",
  Dashboard,
});
