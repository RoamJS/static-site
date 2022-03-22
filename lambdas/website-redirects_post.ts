import type { APIGatewayProxyHandler } from "aws-lambda";
import { awsGetRoamJSUser } from "roamjs-components/backend/getRoamJSUser";
import headers from "roamjs-components/backend/headers";
import { dynamo } from "./common/common";

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
              ":a": { S: `redirect_${websiteGraph}` },
            },
            KeyConditionExpression: "#a = :a",
          })
          .promise()
          .then((r) => ({
            statusCode: 200,
            body: JSON.stringify({
              redirects: r.Items.map((s) => ({
                uuid: s.uuid?.S,
                from: s.status?.S,
                to: s.status_props?.S,
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
      case "SUBMIT":
        const redirects = rest.redirects as {
          uuid: string;
          from: string;
          to: string;
          date: string;
        }[];
        return dynamo
          .batchWriteItem({
            RequestItems: {
              RoamJSWebsiteStatuses: redirects.map((r) => ({
                PutRequest: {
                  Item: {
                    uuid: { S: r.uuid },
                    date: { S: r.date },
                    status: { S: r.from },
                    status_props: { S: r.to },
                    action_graph: { S: `redirect_${websiteGraph}` },
                  },
                },
              })),
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
