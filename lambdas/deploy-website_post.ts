import { v4 } from "uuid";
import format from "date-fns/format";
import { APIGatewayProxyHandler } from "aws-lambda";
import { dynamo, invokeLambda, s3 } from "./common/common";
import getRoamJSUser from "roamjs-components/backend/getRoamJSUser";
import headers from "roamjs-components/backend/headers";

export const handler: APIGatewayProxyHandler = (event) => {
  const token =
    event.headers.Authorization || event.headers.authorization || "";
  return getRoamJSUser({ token, extensionId: "" })
    .then((u) => [
      { ...u, token },
      {
        ...event.queryStringParameters,
        ...JSON.parse(event.body || "{}"),
      },
    ])
    .then(async ([user, { data, graph }]) => {
      const websiteGraph = await getRoamJSUser({ token })
        .then((u) => u.websiteGraph)
        .catch(() => "");
      if (!websiteGraph || graph !== websiteGraph) {
        const isShared = await dynamo
          .query({
            TableName: "RoamJSWebsiteStatuses",
            IndexName: "status-index",
            ExpressionAttributeNames: {
              "#s": "status",
              "#a": "action_graph",
            },
            ExpressionAttributeValues: {
              ":s": { S: "DEPLOY" },
              ":a": { S: `sharing_${graph}` },
            },
            KeyConditionExpression: "#a = :a AND #s = :s",
          })
          .promise()
          .then((r) => r.Items.some((i) => i?.status_props?.S === user.email));
        if (!isShared && !user.email.endsWith("@roamjs.com")) {
          return {
            statusCode: 403,
            body: `User not authorized to deploy website generated from graph ${websiteGraph}.`,
            headers,
          };
        }
      }
      const date = new Date();
      await dynamo
        .putItem({
          TableName: "RoamJSWebsiteStatuses",
          Item: {
            uuid: {
              S: v4(),
            },
            action_graph: {
              S: `deploy_${graph}`,
            },
            date: {
              S: date.toJSON(),
            },
            status: {
              S: "STARTING DEPLOY",
            },
          },
        })
        .promise();
      const Key =
        data && `static-site/${graph}/${format(date, "yyyyMMddhhmmss")}.json`;
      if (Key) {
        await s3
          .upload({
            Bucket: "roamjs-data",
            Key,
            Body: data,
          })
          .promise();
      }

      await invokeLambda({
        path: "deploy",
        data: {
          roamGraph: graph,
          key: Key,
        },
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
        headers,
      };
    })
    .catch((e) => ({
      statusCode: 401,
      body: e.response?.data,
      headers,
    }));
};
