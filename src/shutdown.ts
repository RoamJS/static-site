import AWS from "aws-sdk";
import {
  cf,
  createLogStatus,
  getStackSummaries,
  SHUTDOWN_CALLBACK_STATUS,
} from "./common";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
const s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  credentials,
});
const route53 = new AWS.Route53({ apiVersion: "2013-04-01", credentials });

const emptyBucket = async (props: { Bucket: string; Prefix: string }) => {
  const { Contents, IsTruncated } = await s3.listObjects(props).promise();
  if (Contents.length > 0) {
    await s3
      .deleteObjects({
        Bucket: props.Bucket,
        Delete: {
          Objects: Contents.map(({ Key }) => ({ Key })),
        },
      })
      .promise();
    if (IsTruncated) {
      await emptyBucket(props);
    }
  }
};

export const handler = async (event: {
  roamGraph: string;
  shutdownCallback: string;
}) => {
  const logStatus = createLogStatus(event.roamGraph);

  const Bucket = `roamjs-static-sites`;
  await logStatus("EMPTYING HOST");
  await emptyBucket({ Bucket, Prefix: event.roamGraph });

  await logStatus("DELETING RECORD");
  const StackName = `roamjs-${event.roamGraph}`;
  const summaries = await getStackSummaries(StackName);
  const HostedZoneId = summaries.find(
    (s) => s.LogicalResourceId === "HostedZone"
  ).PhysicalResourceId;
  if (HostedZoneId) {
    const CNAME = await route53
      .listResourceRecordSets({ HostedZoneId })
      .promise()
      .then((sets) => sets.ResourceRecordSets.find((r) => r.Type === "CNAME"));
    if (CNAME) {
      await route53
        .changeResourceRecordSets({
          HostedZoneId,
          ChangeBatch: {
            Changes: [{ Action: "DELETE", ResourceRecordSet: CNAME }],
          },
        })
        .promise();
    }
  }

  await logStatus(
    SHUTDOWN_CALLBACK_STATUS,
    JSON.stringify(event.shutdownCallback)
  );

  await cf
    .deleteStack({
      StackName,
    })
    .promise();

  return { success: true };
};
