import Dashboard, { getDeployBody } from "./components/StaticSiteDashboard";
import { runService } from "roamjs-components/components/ServiceComponents";
import addStyle from "roamjs-components/dom/addStyle";
import runExtension from "roamjs-components/util/runExtension";
import apiPost from "roamjs-components/util/apiPost";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import toConfigPageName from "roamjs-components/util/toConfigPageName";

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

.roamjs-codemirror-wrapper .CodeMirror-linenumbers {
  width: 29px !important;
}

.roamjs-codemirror-wrapper .CodeMirror-code::-webkit-scrollbar {
   width: 8px;
}`);

const ID = "static-site";

runExtension(ID, () => {
  runService({
    id: ID,
    Dashboard,
  });

  window.roamjs.extension.staticSite.deploy = () =>
    apiPost(
      "deploy-website",
      getDeployBody(getPageUidByPageTitle(toConfigPageName(ID)))
    );
});
