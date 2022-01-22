import type { APIGatewayProxyHandler } from "aws-lambda";
import { lambda } from "./common/common";
import { awsGetRoamJSUser } from "roamjs-components/backend/getRoamJSUser";
import headers from "roamjs-components/backend/headers";

export const handler: APIGatewayProxyHandler = awsGetRoamJSUser<{
  graph: string;
}>(async ({ websiteGraph }, { graph }) => {
  if (!websiteGraph) {
    return {
      statusCode: 204,
      body: JSON.stringify({}),
      headers,
    };
  }

  if (websiteGraph !== graph) {
    return {
      statusCode: 401,
      body: "You are not authorized to update the static site tied to this graph",
      headers,
    };
  }

  return lambda
    .invoke({
      FunctionName: "RoamJS_describe",
      InvocationType: "RequestResponse",
      Payload: JSON.stringify({
        roamGraph: graph,
      }),
    })
    .promise()
    .then((c) => ({
      statusCode: 200,
      body: c.Payload as string,
      headers,
    }))
    .catch((e) => ({ statusCode: 500, body: e.mesage, headers }));
});
