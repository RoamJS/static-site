import { APIGatewayProxyHandler } from "aws-lambda";
import { getRoamJSUser, headers, lambda } from "./common/common";

export const handler: APIGatewayProxyHandler = (event) =>
  getRoamJSUser(event)
    .then((r) => r.data.websiteGraph)
    .then((graph) => {
      if (!graph) {
        return {
          statusCode: 204,
          body: JSON.stringify({}),
          headers,
        };
      }

      if (graph !== event.queryStringParameters.graph) {
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
    })
    .catch((e) => ({
      statusCode: e.response?.status || 500,
      body: e.response?.data || e.message,
      headers,
    }));
