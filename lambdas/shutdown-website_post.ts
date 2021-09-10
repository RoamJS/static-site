import AWS from "aws-sdk";
import { v4 } from "uuid";
import randomstring from "randomstring";
import { APIGatewayProxyHandler } from "aws-lambda";
import { createLogStatus, getRoamJSUser, headers, putRoamJSUser } from "./common/common";

const lambda = new AWS.Lambda({ apiVersion: "2015-03-31" });
const dynamo = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

export const handler: APIGatewayProxyHandler = async (event) => {
  const { graph } = JSON.parse(event.body || "{}");
  const user = await getRoamJSUser(event).then((r) => r.data);

  await createLogStatus(graph)("SHUTTING DOWN");

  const callbackToken = randomstring.generate();
  await putRoamJSUser(event, {
    websiteToken: callbackToken,
  });

  await lambda
    .invoke({
      FunctionName: "RoamJS_shutdown",
      InvocationType: "Event",
      Payload: JSON.stringify({
        roamGraph: graph,
        shutdownCallback: {
          callbackToken,
          url: `${process.env.API_URL}/finish-shutdown-website`,
          userId: user.id,
        },
      }),
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
    headers,
  };
};
