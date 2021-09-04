import { APIGatewayProxyHandler } from "aws-lambda";
import { v4 } from "uuid";
import {
  dynamo,
  getRoamJSUser,
  headers,
  lambda,
  putRoamJSUser,
} from "./common/common";

export const handler: APIGatewayProxyHandler = (event) => {
  const { graph, domain } = JSON.parse(event.body || "{}") as {
    graph: string;
    domain: string;
  };
  return getRoamJSUser(event).then(async (r) => {
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

    await dynamo
      .putItem({
        TableName: "RoamJSWebsiteStatuses",
        Item: {
          uuid: {
            S: v4(),
          },
          action_graph: {
            S: `launch_${graph}`,
          },
          date: {
            S: new Date().toJSON(),
          },
          status: {
            S: "INITIALIZING",
          },
        },
      })
      .promise();

    await lambda
      .invoke({
        FunctionName: "RoamJS_launch",
        InvocationType: "Event",
        Payload: JSON.stringify({
          roamGraph: graph,
          domain: domain.toLowerCase(),
          email,
        }),
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ graph, domain }),
      headers,
    };
  });
};
