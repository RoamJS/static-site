import AWS from "aws-sdk";
import axios from "axios";
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
export const route53 = new AWS.Route53({
  apiVersion: "2013-04-01",
  credentials,
});
export const cloudfront = new AWS.CloudFront({
  apiVersion: "2020-05-31",
  credentials,
});
export const lambda = new AWS.Lambda({ apiVersion: "2015-03-31", credentials });
export const s3 = new AWS.S3({ apiVersion: "2006-03-01", credentials });
export const ses = new AWS.SES({ apiVersion: "2010-12-01", credentials });

type InvokeLambdaProps = { path: string; data: Record<string, unknown> };
export const invokeLambda =
  process.env.NODE_ENV === "production"
    ? ({ path, data }: InvokeLambdaProps) =>
        lambda
          .invoke({
            FunctionName: `RoamJS_${path}`,
            InvocationType: "Event",
            Payload: JSON.stringify(data),
          })
          .promise()
    : ({ path, data }: InvokeLambdaProps) =>
        axios.post(`${process.env.API_URL}/${path}`, data);

export const SHUTDOWN_CALLBACK_STATUS = "PREPARING TO DELETE STACK";

export const getActionGraph = (graph: string, type = "launch") =>
  `${type}_${graphToStackName(graph).replace(/^roamjs-/, "")}`;

export const createLogStatus =
  (roamGraph: string, type = "launch") =>
  async (S: string, props?: string) =>
    await dynamo
      .putItem({
        TableName: "RoamJSWebsiteStatuses",
        Item: {
          uuid: {
            S: v4(),
          },
          action_graph: {
            S: getActionGraph(roamGraph, type),
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

export const clearRecordsById = async (HostedZoneId?: string) => {
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

export const clearRecords = async (StackName: string) => {
  const summaries = await getStackSummaries(StackName);
  const HostedZoneId = summaries.find(
    (s) => s.LogicalResourceId === "HostedZone"
  )?.PhysicalResourceId;
  await clearRecordsById(HostedZoneId);
};

export const getStackParameter = (key: string, StackName: string) =>
  cf
    .describeStacks({ StackName })
    .promise()
    .then(
      (c) =>
        c.Stacks[0].Parameters.find(({ ParameterKey }) => ParameterKey === key)
          .ParameterValue
    );

export const graphToStackName = (graph: string) =>
  `roamjs-${graph.replace("_", "-")}`;
