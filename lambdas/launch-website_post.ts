import { APIGatewayProxyHandler } from "aws-lambda";
import { v4 } from "uuid";
import {
  createLogStatus,
  dynamo,
  getRoamJSUser,
  headers,
  invokeLambda,
  putRoamJSUser,
} from "./common/common";

export const handler: APIGatewayProxyHandler = (event) => {
  const { graph, domain } = JSON.parse(event.body || "{}") as {
    graph: string;
    domain: string;
  };
  return getRoamJSUser(event)
    .then(async (r) => {
      if (!graph) {
        return {
          statusCode: 400,
          body: "Roam Graph is required",
          headers,
        };
      }

      if (!domain) {
        return {
          statusCode: 400,
          body: "Target Domain is required",
          headers,
        };
      }

      const { websiteGraph, email } = r.data;
      if (websiteGraph) {
        return {
          statusCode: 400,
          body: "There's already a live static site with this token",
          headers,
        };
      }

      await putRoamJSUser(event, { websiteGraph: graph });

      await createLogStatus(graph)("INITIALIZING");

      await invokeLambda({
        path: "launch",
        data: {
          roamGraph: graph,
          domain: domain.toLowerCase(),
          email,
        },
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ graph, domain }),
        headers,
      };
    })
    .catch((e) => {
      console.error(e);
      return {
        statusCode: e.response?.status || 500,
        body: e.response?.data?.message || e.response?.data || e.message,
        headers,
      };
    });
};
