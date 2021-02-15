import AWS from "aws-sdk";
import { v4 } from "uuid";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
const dynamo = new AWS.DynamoDB({ apiVersion: "2012-08-10", credentials });
const cf = new AWS.CloudFormation({ apiVersion: "2010-05-15", credentials });

export const ZONE_COMMENT_PREFIX = "RoamJS Static Site For ";

export const createLogStatus = (roamGraph: string) => async (
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
          S: `launch_${roamGraph}`,
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
