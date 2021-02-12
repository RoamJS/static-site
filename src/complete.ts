import AWS from "aws-sdk";
import { v4 } from "uuid";
import { SNSEvent } from "aws-lambda";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const dynamo = new AWS.DynamoDB({ apiVersion: "2012-08-10", credentials });
const ses = new AWS.SES({ apiVersion: "2010-12-01" });
const cf = new AWS.CloudFormation({ apiVersion: "2010-05-15", credentials });

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
    const { StackName } = messageObject; 
    const roamGraph = StackName.match("roamjs-(.*)")[1];
    const summaries = await cf.listStackResources({ StackName })
      .promise()
      .then((r) => r.StackResourceSummaries);
    const roamjsDomain = summaries.find(s => s.LogicalResourceId === 'Route53ARecordRoamJS').PhysicalResourceId
    const domain = summaries.find(s => s.LogicalResourceId === 'Route53ARecord').PhysicalResourceId

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

        await logStatus("LIVE");

        await ses
          .sendEmail({
            Destination: {
              ToAddresses: [lastStatus.email.S],
            },
            Message: {
              Body: {
                Text: {
                  Charset: "UTF-8",
                  Data: `Your static site is live and accessible at ${roamjsDomain}. Follow instructions below to make your site accessible from your custom domain, ${domain}.`,
                },
              },
              Subject: {
                Charset: "UTF-8",
                Data: `Your RoamJS site is now live!`,
              },
            },
            Source: "support@roamjs.com",
          })
          .promise();
      }
    }
  }
};
