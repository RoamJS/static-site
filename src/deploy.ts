import build from "generate-roam-site";
import path from "path";
import fs from "fs";
import AWS from "aws-sdk";
import { v4 } from "uuid";
import "generate-roam-site/dist/aws.tar.br";
import "generate-roam-site/dist/chromium.br";
import "generate-roam-site/dist/swiftshader.tar.br";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const s3 = new AWS.S3({ apiVersion: "2006-03-01", credentials });
const dynamo = new AWS.DynamoDB({ apiVersion: "2012-08-10", credentials });
const cloudfront = new AWS.CloudFront({
  apiVersion: "2020-05-31",
  credentials,
});

const getDistributionIdByDomain = async (domain: string) => {
  let finished = false;
  let Marker: string = undefined;
  while (!finished) {
    const {
      DistributionList: { IsTruncated, NextMarker, Items },
    } = await cloudfront.listDistributions({ Marker }).promise();
    const distribution = Items.find((i) => i.Aliases.Items.includes(domain));
    if (distribution) {
      return distribution.Id;
    }
    finished = !IsTruncated;
    Marker = NextMarker;
  }

  throw new Error(`Could not find distribution for ${domain}`);
};

export const handler = async (event: {
  roamGraph: string;
  domain: string;
}): Promise<void> => {
  const logStatus = (S: string) =>
    dynamo
      .putItem({
        TableName: "RoamJSWebsiteStatuses",
        Item: {
          uuid: {
            S: v4(),
          },
          action_graph: {
            S: `deploy_${event.roamGraph}`,
          },
          date: {
            S: new Date().toJSON(),
          },
          status: {
            S,
          },
        },
      })
      .promise();

  await logStatus("BUILDING SITE");
  return build({
    ...event,
    pathRoot: "/tmp",
    roamUsername: "support@roamjs.com",
    roamPassword: process.env.SUPPORT_ROAM_PASSWORD,
  })
    .then(async () => {
      await logStatus("DELETING STALE FILES");
      const Bucket = `roamjs-static-sites`;
      const ContentType = "text/html";
      const Prefix = `${event.roamGraph}/`;
      const filesToUpload = fs.readdirSync(path.join("/tmp", "out"));

      const fileSet = new Set(filesToUpload);
      const keysToDelete = new Set<string>();
      let finished = false;
      let ContinuationToken: string = undefined;
      while (!finished) {
        const {
          Contents,
          IsTruncated,
          NextContinuationToken,
        } = await s3
          .listObjectsV2({ Bucket, ContinuationToken, Prefix })
          .promise();
        Contents.map(({ Key }) => Key)
          .filter((k) => !fileSet.has(k.substring(Prefix.length)))
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
      }

      await logStatus("UPLOADING");
      for (const key of filesToUpload) {
        const Body = fs.createReadStream(path.join("/tmp", "out", key));
        const Key = `${Prefix}${key}`;
        await s3.upload({ Bucket, Key, Body, ContentType }).promise();
      }

      const statuses = await dynamo
        .query({
          TableName: "RoamJSWebsiteStatuses",
          KeyConditionExpression: "action_graph = :a",
          ExpressionAttributeValues: {
            ":a": {
              S: `launch_${event.roamGraph}`,
            },
          },
          Limit: 1,
          ScanIndexForward: false,
          IndexName: "primary-index",
        })
        .promise();
      if (statuses.Items && statuses.Items[0].status.S === "FIRST DEPLOY") {
        await dynamo
          .putItem({
            TableName: "RoamJSWebsiteStatuses",
            Item: {
              uuid: {
                S: v4(),
              },
              action_graph: {
                S: `launch_${event.roamGraph}`,
              },
              date: {
                S: new Date().toJSON(),
              },
              status: {
                S: "LIVE",
              },
            },
          })
          .promise();
      } else {
        await logStatus("INVALIDATING CACHE");
        const DistributionId = await getDistributionIdByDomain(event.domain);
        await cloudfront.createInvalidation({
          DistributionId,
          InvalidationBatch: {
            CallerReference: new Date().toJSON(),
            Paths: {
              Quantity: 1,
              Items: ["/*"],
            },
          },
        }).promise();
      }
      await logStatus("SUCCESS");
    })
    .catch(async (e) => {
      await logStatus("FAILURE");
      console.error(e);
    });
};
