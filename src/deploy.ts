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

export const handler = async (event: { roamGraph: string }): Promise<void> =>
  build({
    ...event,
    pathRoot: "/tmp",
    roamUsername: "support@roamjs.com",
    roamPassword: process.env.SUPPORT_ROAM_PASSWORD,
  }).then(async () => {
    console.log("Finished building! Starting deploy...");
    const Bucket = `roamjs-${event.roamGraph}`;
    const ContentType = "text/html";
    const filesToUpload = fs.readdirSync(path.join("/tmp", "out"));

    console.log("Delete existing keys that are no longer in graph");
    const fileSet = new Set(filesToUpload);
    const keysToDelete = new Set<string>();
    let finished = false;
    let ContinuationToken: string = undefined;
    while (!finished) {
      const {
        Contents,
        IsTruncated,
        NextContinuationToken,
      } = await s3.listObjectsV2({ Bucket, ContinuationToken }).promise();
      Contents.map(({ Key }) => Key)
        .filter((k) => !fileSet.has(k))
        .forEach((k) => keysToDelete.add(k));
      finished = !IsTruncated;
      ContinuationToken = NextContinuationToken;
    }
    if (keysToDelete.size) {
      const DeleteObjects = Array.from(keysToDelete).map((Key) => ({ Key }));
      for (let i = 0; i < DeleteObjects.length; i += 1000) {
        await s3
          .deleteObjects({
            Bucket,
            Delete: { Objects: DeleteObjects.slice(i, i + 1000) },
          })
          .promise();
      }
      console.log("Deleted", DeleteObjects.length, "objects!");
    } else {
      console.log("No keys to delete, on to uploading.");
    }

    for (const Key of filesToUpload) {
      const Body = fs.createReadStream(path.join("/tmp", "out", Key));
      await s3.upload({ Bucket, Key, Body, ContentType }).promise();
    }
    console.log("Finished deploying!");
  });
