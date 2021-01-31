import AWS from "aws-sdk";
import { v4 } from "uuid";
import { SNSEvent } from "aws-lambda";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const dynamo = new AWS.DynamoDB({ apiVersion: "2012-08-10", credentials });

export const handler = async (event: SNSEvent) => {
  console.log("event", JSON.stringify(event));
  
  const message = event.Records[0].Sns.Message;
  const logStatus = (S: string) =>
    dynamo
      .putItem({
        TableName: "RoamJSWebsiteStatuses",
        Item: {
          uuid: {
            S: v4(),
          },
          action_graph: {
            S: `launch_${message}`,
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
};
