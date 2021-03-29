import AWS from "aws-sdk";
import { v4 } from "uuid";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
export const dynamo = new AWS.DynamoDB({
  apiVersion: "2012-08-10",
  credentials,
});
export const cf = new AWS.CloudFormation({
  apiVersion: "2010-05-15",
  credentials,
});
export const route53 = new AWS.Route53({ apiVersion: "2013-04-01", credentials });

export const SHUTDOWN_CALLBACK_STATUS = "PREPARING TO DELETE STACK";

export const createLogStatus = (roamGraph: string, type = "launch") => async (
  S: string,
  props?: string
) =>
  await dynamo
    .putItem({
      TableName: "RoamJSWebsiteStatuses",
      Item: {
        uuid: {
          S: v4(),
        },
        action_graph: {
          S: `${type}_${roamGraph}`,
        },
        date: {
          S: new Date().toJSON(),
        },
        status: {
          S,
        },
        ...(props ? { status_props: { S: props } } : {}),
      },
    })
    .promise();

export const getStackSummaries = (StackName: string) =>
  cf
    .listStackResources({ StackName })
    .promise()
    .then((r) => r.StackResourceSummaries);

export const clearRecords = async (StackName: string) => {
  const summaries = await getStackSummaries(StackName);
  const HostedZoneId = summaries.find(
    (s) => s.LogicalResourceId === "HostedZone"
  )?.PhysicalResourceId;
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
};
