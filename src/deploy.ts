import build from "generate-roam-site";
import path from "path";
import fs from "fs";
import AWS from "aws-sdk";
import "generate-roam-site/dist/aws.tar.br";
import "generate-roam-site/dist/chromium.br";
import "generate-roam-site/dist/swiftshader.tar.br";

const s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const handler = async (event: {
  roamGraph: string;
  roamUsername: string;
  roamPassword: string;
}): Promise<void> =>
  build({ ...event, pathRoot: "/tmp" }).then(async () => {
    console.log("Finished building! Starting deploy...");
    const Bucket = `roamjs-${event.roamGraph}`;
    const filesToUpload = fs.readdirSync(path.join("/tmp", "out"));
    for (const Key of filesToUpload) {
      const Body = fs.readFileSync(path.join("/tmp", "out", Key));
      await s3.upload({ Bucket, Key, Body });
      console.log("Uploaded", Key, "To", Bucket);
    }
    console.log("Finished deploying!");
  });
