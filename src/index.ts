import Dashboard, { getDeployBody } from "./components/StaticSiteDashboard";
import { runService } from "./components/ServiceComponents";
import addStyle from "roamjs-components/dom/addStyle";
import runExtension from "roamjs-components/util/runExtension";
import apiPost from "roamjs-components/util/apiPost";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import toConfigPageName from "roamjs-components/util/toConfigPageName";
import registerSmartBlocksCommand from "roamjs-components/util/registerSmartBlocksCommand";

const ID = "static-site";

export default runExtension(async () => {
  const style = addStyle(`.bp3-tab-panel {
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

  const unload = runService({
    id: ID,
    Dashboard,
  });

  const deploy = () =>
    apiPost(
      "deploy-website",
      getDeployBody(getPageUidByPageTitle(toConfigPageName(ID)))
    );

  window.roamjs.extension.staticSite = {
    deploy,
  };

  const unregisterCommand = registerSmartBlocksCommand({
    text: "DEPLOYSITE",
    handler: () => () =>
      deploy()
        .then(() => "Successfully deployed website!")
        .catch((e) => "Error generating the report: " + e.message),
  });
  return () => {
    style.remove();
    unregisterCommand();
    unload();
  };
});
