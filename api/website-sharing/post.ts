import type { APIGatewayProxyHandler } from "aws-lambda";
import { awsGetRoamJSUser } from "roamjs-components/backend/getRoamJSUser";
import headers from "roamjs-components/backend/headers";
import { v4 } from "uuid";
import { dynamo } from "../../lambdas/common/common";

export const handler: APIGatewayProxyHandler = awsGetRoamJSUser(
  async ({ websiteGraph }, { method, ...rest }) => {
    switch (method) {
      case "GET":
        return dynamo
          .query({
            TableName: "RoamJSWebsiteStatuses",
            IndexName: "primary-index",
            ExpressionAttributeNames: {
              "#a": "action_graph",
            },
            ExpressionAttributeValues: {
              ":a": { S: `sharing_${websiteGraph}` },
            },
            KeyConditionExpression: "#a = :a",
          })
          .promise()
          .then((r) => ({
            statusCode: 200,
            body: JSON.stringify({
              perms: (r.Items || []).map((s) => ({
                uuid: s.uuid?.S,
                permission: s.status?.S,
                user: s.status_props?.S,
                date: s.date?.S, // Need date bc it's part of the table's primary key
              })),
            }),
            headers,
          }))
          .catch((e) => ({
            body: e.message,
            statusCode: 500,
            headers,
          }));
      case "UPDATE":
        const perms = rest as {
          permission: string;
          uuid: string;
          date: string;
        };
        return dynamo
          .updateItem({
            TableName: "RoamJSWebsiteStatuses",
            Key: {
              uuid: { S: perms.uuid },
              date: { S: perms.date },
            },
            UpdateExpression: "SET #p = :p",
            ExpressionAttributeNames: {
              "#p": "status",
            },
            ExpressionAttributeValues: {
              ":p": { S: perms.permission },
            },
          })
          .promise()
          .then(() => ({
            statusCode: 200,
            body: JSON.stringify({ success: true }),
            headers,
          }))
          .catch((e) => ({
            body: e.message,
            statusCode: 500,
            headers,
          }));
      case "CREATE":
        const user = {
          uuid: v4(),
          user: rest.user as string,
          date: new Date().toJSON(),
          permission: "NONE",
        };
        return dynamo
          .putItem({
            TableName: "RoamJSWebsiteStatuses",
            Item: {
              uuid: { S: user.uuid },
              date: { S: user.date },
              status: { S: user.permission },
              status_props: { S: user.user },
              action_graph: { S: `sharing_${websiteGraph}` },
            },
          })
          .promise()
          .then(() => ({
            statusCode: 200,
            body: JSON.stringify(user),
            headers,
          }))
          .catch((e) => ({
            body: e.message,
            statusCode: 500,
            headers,
          }));
      case "DELETE":
        const uuid = rest.uuid as string;
        const date = rest.date as string;
        return dynamo
          .deleteItem({
            TableName: "RoamJSWebsiteStatuses",
            Key: { uuid: { S: uuid }, date: { S: date } },
          })
          .promise()
          .then(() => ({
            statusCode: 200,
            body: JSON.stringify({ success: true }),
            headers,
          }))
          .catch((e) => ({
            body: e.message,
            statusCode: 500,
            headers,
          }));
      default:
        return {
          statusCode: 400,
          body: `Unsupported method ${method}`,
          headers,
        };
    }
  }
);
