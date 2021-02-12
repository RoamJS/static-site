import AWS from "aws-sdk";
import { v4 } from "uuid";
import { SNSEvent } from "aws-lambda";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const lambda = new AWS.Lambda({ apiVersion: "2015-03-31", credentials });
const dynamo = new AWS.DynamoDB({ apiVersion: "2012-08-10", credentials });

export const handler = async (event: SNSEvent) => {
  const message = event.Records[0].Sns.Message;
  const messageObject = Object.fromEntries(
    message
      .split("\n")
      .map((l) => l.split("="))
      .map(([key, value]) => [
        key,
        value && value.substring(1, value.length - 1),
      ])
  );

  if (
    messageObject["LogicalResourceId"] === messageObject["StackName"] &&
    messageObject["ResourceStatus"] === "CREATE_COMPLETE"
  ) {
    const roamGraph = messageObject["StackName"].match("roamjs-(.*)")[1];

    const statuses = await dynamo
      .query({
        TableName: "RoamJSWebsiteStatuses",
        KeyConditionExpression: "action_graph = :a",
        ExpressionAttributeValues: {
          ":a": {
            S: `launch_${roamGraph}`,
          },
        },
        Limit: 1,
        ScanIndexForward: false,
        IndexName: "primary-index",
      })
      .promise();

    if (statuses.Items) {
      const lastStatus = statuses.Items[0];
      if (lastStatus.status.S === "CREATING WEBSITE") {
        const logStatus = (S: string) =>
          dynamo
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
              },
            })
            .promise();
        await logStatus("BUILDING WEBSITE");

        await lambda
          .invoke({
            FunctionName: "RoamJS_deploy",
            InvocationType: "Event",
            Payload: JSON.stringify({
              roamGraph,
              domain: lastStatus.domain.S,
              email: lastStatus.email.S,
            }),
          })
          .promise();
      }
    }
  }
};
