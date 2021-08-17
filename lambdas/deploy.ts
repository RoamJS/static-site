import build, { processSiteData, defaultConfig } from "generate-roam-site";
import path from "path";
import fs from "fs";
import AWS from "aws-sdk";
import "chrome-aws-lambda/bin/aws.tar.br";
import "chrome-aws-lambda/bin/chromium.br";
import "chrome-aws-lambda/bin/swiftshader.tar.br";
import {
  cloudfront,
  createLogStatus,
  getStackParameter,
  graphToStackName,
} from "./common/common";

// https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html#invalidation-specifying-objects
const INVALIDATION_MAX = 1499;

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const s3 = new AWS.S3({ apiVersion: "2006-03-01", credentials });

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

  return null;
};

const waitForCloudfront = (props: {
  trial?: number;
  Id: string;
  DistributionId: string;
  resolve: (s: string) => void;
}) => {
  const { trial = 0, resolve, ...args } = props;
  cloudfront
    .getInvalidation(args)
    .promise()
    .then((r) => r.Invalidation.Status)
    .then((status) => {
      if (status === "Completed") {
        resolve("Done!");
      } else if (trial === 60) {
        resolve("Ran out of time waiting for cloudfront...");
      } else {
        console.log(
          "Still waiting for invalidation. Found",
          status,
          "on trial",
          trial
        );
        setTimeout(
          () => waitForCloudfront({ ...args, trial: trial + 1, resolve }),
          1000
        );
      }
    });
};

export const handler = async (event: {
  roamGraph: string;
  key?: string;
  debug?: boolean;
}): Promise<void> => {
  const logStatus = createLogStatus(event.roamGraph, "deploy");
  const pathRoot = "/tmp";
  const buildSite = event.key
    ? () =>
        s3
          .getObject({ Bucket: "roamjs-static-site-data", Key: event.key })
          .promise()
          .then((data) => {
            const { pages, config } = JSON.parse(data.Body.toString());
            const outputPath = path.join(pathRoot, "out");
            fs.mkdirSync(outputPath, { recursive: true });
            return processSiteData({
              pages,
              config: {
                ...defaultConfig,
                ...config,
              },
              outputPath,
              info: console.log,
            });
          })
    : () =>
        build({
          ...event,
          pathRoot,
          roamUsername: "support@roamjs.com",
          roamPassword: process.env.SUPPORT_ROAM_PASSWORD,
        });

  await logStatus("BUILDING SITE");
  return buildSite()
    .then(async () => {
      await logStatus("DELETING STALE FILES");
      const Bucket = `roamjs-static-sites`;
      const ContentType = "text/html;charset=UTF-8";
      const Prefix = `${event.roamGraph}/`;
      const filesToUpload = fs.readdirSync(path.join("/tmp", "out"));

      const fileSet = new Set(filesToUpload);
      const eTags: { [key: string]: string } = {};
      const keysToDelete = new Set<string>();
      let finished = false;
      let ContinuationToken: string = undefined;
      while (!finished) {
        const { Contents, IsTruncated, NextContinuationToken } = await s3
          .listObjectsV2({ Bucket, ContinuationToken, Prefix })
          .promise();
        Contents.map(({ Key, ETag }) => {
          eTags[Key.substring(Prefix.length)] = ETag;
          return Key;
        })
          .filter((k) => !fileSet.has(k.substring(Prefix.length)))
          .forEach((k) => keysToDelete.add(k));
        finished = !IsTruncated;
        ContinuationToken = NextContinuationToken;
      }
      if (keysToDelete.size) {
        console.log("Files to Delete", keysToDelete.size);
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
      const filesToInvalidate = new Set<string>();
      console.log("Files to Upload", filesToUpload.length);
      for (const key of filesToUpload) {
        const Body = fs.createReadStream(path.join("/tmp", "out", key));
        const Key = `${Prefix}${key}`;
        const { ETag } = await s3
          .upload({ Bucket, Key, Body, ContentType })
          .promise();
        if (eTags[key] && ETag !== eTags[key]) {
          filesToInvalidate.add(key);
        }
      }

      console.log("Files to Invalidate", filesToInvalidate.size);
      await logStatus("INVALIDATING CACHE");
      const DistributionId = await getDistributionIdByDomain(
        await getStackParameter("DomainName", graphToStackName(event.roamGraph))
      );
      if (DistributionId) {
        const invalidatingItems =
          filesToInvalidate.size === filesToUpload.length
            ? ["*"]
            : Array.from(filesToInvalidate);
        for (let i = 0; i < invalidatingItems.length; i += INVALIDATION_MAX) {
          const Items = invalidatingItems
            .slice(i, i + INVALIDATION_MAX)
            .flatMap((k) =>
              k === "index.html"
                ? ["/", "/index.html"]
                : [`/${k.replace(/\.html$/, "")}`, `/${k}`]
            );
          await cloudfront
            .createInvalidation({
              DistributionId,
              InvalidationBatch: {
                CallerReference: new Date().toJSON(),
                Paths: {
                  Quantity: Items.length,
                  Items,
                },
              },
            })
            .promise()
            .then(
              (r) =>
                new Promise<string>((resolve) =>
                  waitForCloudfront({
                    Id: r.Invalidation.Id,
                    DistributionId,
                    resolve,
                  })
                )
            )
            .catch((e) => {
              console.error(
                "Failed to invalidate these paths:\n[\n   ",
                Items.join(",\n    "),
                "\n]"
              );
              console.error(e);
            });
        }
      }
      await logStatus("SUCCESS");
    })
    .catch(async (e) => {
      console.error(e);
      await logStatus("FAILURE", JSON.stringify({ message: e.message }));
    });
};
