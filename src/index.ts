import build from "generate-roam-site";
import { createDeployment } from "@vercel/client";
import path from "path";
import "generate-roam-site/dist/aws.tar.br";
import "generate-roam-site/dist/chromium.br";
import "generate-roam-site/dist/swiftshader.tar.br";

export const handler = async (event: {
  roamGraph: string;
  roamUsername: string;
  roamPassword: string;
}): Promise<void> =>
  build({ ...event, pathRoot: "/tmp" })
    .then(async () => {
      console.log("Finished building! Starting deploy...");
      for await (const e of createDeployment({
        token: process.env.VERCEL_TOKEN,
        path: path.join("/tmp", "out"),
      })) {
        if (e.type === "ready") {
          console.log("Deployment ready!", "-", new Date().toJSON());
          return e.payload;
        } else if (e.type === 'error') {
          console.error("Deployment failed :(", new Date().toJSON());
          throw new Error(e.payload);
        } else {
          console.log("Deployment", e.type, "-", new Date().toJSON());
        }
      }
    })
    .then((data) => {
      console.log("Exiting! Data:", data);
    });
