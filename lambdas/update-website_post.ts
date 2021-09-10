import { APIGatewayProxyHandler } from "aws-lambda";
import { v4 } from "uuid";
import { createLogStatus, dynamo, getRoamJSUser, headers, lambda } from "./common/common";

export const handler: APIGatewayProxyHandler = async (event) => {
  const { graph, diffs } = JSON.parse(event.body);
  if (!graph) {
    return {
      statusCode: 400,
      body: "Roam Graph is required",
      headers,
    };
  }

  if (!diffs?.length) {
    return {
      statusCode: 400,
      body: "Must have at least one diff to update",
      headers,
    };
  }

  const { websiteGraph } = await getRoamJSUser(event).then((r) => r.data);
  if (websiteGraph !== graph) {
    return {
      statusCode: 401,
      body: "User is unauthorized to update the site to this graph",
      headers,
    };
  }

  await createLogStatus(graph)("UPDATING");

  await lambda
    .invoke({
      FunctionName: "RoamJS_update",
      InvocationType: "Event",
      Payload: JSON.stringify({
        roamGraph: graph,
        diffs,
      }),
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
    headers,
  };
};
