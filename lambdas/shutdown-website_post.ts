import AWS from "aws-sdk";
import type { APIGatewayProxyHandler } from "aws-lambda";
import { createLogStatus } from "./common/common";
import headers from "roamjs-components/backend/headers";

const lambda = new AWS.Lambda({ apiVersion: "2015-03-31" });

export const handler: APIGatewayProxyHandler = async (event) => {
  const { graph } = JSON.parse(event.body || "{}");
  await createLogStatus(graph)("SHUTTING DOWN");
  await lambda
    .invoke({
      FunctionName: "RoamJS_shutdown",
      InvocationType: "Event",
      Payload: JSON.stringify({
        roamGraph: graph,
        shutdownCallback: {
          userToken: event.headers.Authorization || event.headers.authorization,
          dev: process.env.NODE_ENV === "development",
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
