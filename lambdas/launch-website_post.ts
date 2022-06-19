import { APIGatewayProxyHandler } from "aws-lambda";
import { createLogStatus, invokeLambda } from "./common/common";
import { awsGetRoamJSUser } from "roamjs-components/backend/getRoamJSUser";
import putRoamJSUser from "roamjs-components/backend/putRoamJSUser";
import headers from "roamjs-components/backend/headers";
import meterRoamJSUser from "roamjs-components/backend/meterRoamJSUser";

export const handler: APIGatewayProxyHandler = awsGetRoamJSUser<{
  graph: string;
  domain: string;
}>(async (user, { graph, domain }) => {
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

  const { websiteGraph, email } = user;
  if (websiteGraph) {
    return {
      statusCode: 400,
      body: "There's already a live static site with this token",
      headers,
    };
  }

  await putRoamJSUser({ token: user.token, data: { websiteGraph: graph } });
  // await meterRoamJSUser(user.id, 1);

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
});
