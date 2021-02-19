import AWS from "aws-sdk";
import { v4 } from "uuid";
import { getStackSummaries } from "./common";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
const s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  credentials,
});
const dynamo = new AWS.DynamoDB({ apiVersion: "2012-08-10", credentials });
const cf = new AWS.CloudFormation({ apiVersion: "2010-05-15", credentials });
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
  const logStatus = async (S: string) =>
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
            S,
          },
        },
      })
      .promise();

  const Bucket = `roamjs-static-sites`;
  await logStatus("EMPTYING HOST");
  await emptyBucket({ Bucket, Prefix: event.roamGraph });

  await logStatus("DELETE RECORD");
  const StackName = `roamjs-${event.roamGraph}`;
  const summaries = await getStackSummaries(StackName);
  const HostedZoneId = summaries.find(
    (s) => s.LogicalResourceId === "HostedZone"
  ).PhysicalResourceId;
  const CNAME = await route53
    .listResourceRecordSets({ HostedZoneId })
    .promise()
    .then((sets) => sets.ResourceRecordSets.find((r) => r.Type === "CNAME"));
  await route53
    .changeResourceRecordSets({
      HostedZoneId,
      ChangeBatch: {
        Changes: [{ Action: "DELETE", ResourceRecordSet: CNAME }],
      },
    })
    .promise();

  await cf
    .updateStack({
      StackName,
      Parameters: [
        {
          ParameterKey: "ShutdownCallback",
          ParameterValue: JSON.stringify(event.shutdownCallback),
        },
      ],
    })
    .promise();

  await new Promise<void>((resolve, reject) => {
    let count = 0;
    const checkUpdate = () =>
      cf
        .describeStacks({ StackName })
        .promise()
        .then((r) => r.Stacks[0].StackStatus)
        .then((s) => {
          count++;
          if (s === "UPDATE_COMPLETE") {
            resolve();
          } else if (count === 100) {
            reject(`Timed out waiting for update. Current status: ${s}`);
          } else {
            setTimeout(checkUpdate, 1000);
          }
        });
    return checkUpdate();
  });

  await cf
    .deleteStack({
      StackName,
    })
    .promise();

  return { success: true };
};
