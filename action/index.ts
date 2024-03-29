import { run } from "../lambdas/deploy";
import { setFailed, info, getInput, error } from "@actions/core";
import path from "path";
import fs from "fs";

const runAll = (): Promise<void> => {
  const configPath = path.join(
    process.env.GITHUB_WORKSPACE || __dirname,
    getInput("config_path")
  );
  info(`Config Path: ${configPath}`);
  return run({
    roamUsername: getInput("roam_username"),
    roamPassword: getInput("roam_password"),
    roamGraph: getInput("roam_graph"),
    logger: { info, error },
    inputConfig: fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath).toString())
      : {},
  })
    .then((input) =>
      info(`Done! Config Used: ${JSON.stringify(input, null, 4)}`)
    )
    .catch((e) => {
      setFailed(e.message);
      process.exit(1);
    });
};

if (process.env.NODE_ENV !== "test") {
  runAll();
}

export default runAll;
