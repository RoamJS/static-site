import { APIGatewayProxyHandler } from "aws-lambda";
import { createLogStatus, lambda } from "./common/common";
import headers from "roamjs-components/backend/headers";
import { awsGetRoamJSUser } from "roamjs-components/backend/getRoamJSUser";

export const handler: APIGatewayProxyHandler = awsGetRoamJSUser<{
  graph: string;
  diffs: [];
}>(async (user, { graph, diffs }) => {
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

  const { websiteGraph } = user;
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
});
