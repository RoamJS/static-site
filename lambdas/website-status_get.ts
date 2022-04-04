import { APIGatewayProxyHandler } from "aws-lambda";
import AWS from "aws-sdk";
import { dynamo, getActionGraph } from "./common/common";
import headers from "roamjs-components/backend/headers";
import getRoamJSUser, {
  awsGetRoamJSUser,
} from "roamjs-components/backend/getRoamJSUser";
import putRoamJSUser from "roamjs-components/backend/putRoamJSUser";

const getProgressProps = (
  items?: AWS.DynamoDB.ItemList,
  deployItems?: AWS.DynamoDB.ItemList
) => {
  if (!items) {
    return { progress: 0, progressType: "LAUNCHING" };
  }
  const launchIndex =
    items.findIndex((s) => s.status.S === "INITIALIZING") + 1 ||
    Number.MAX_VALUE;
  const updateIndex =
    items.findIndex((s) => s.status.S === "UPDATING") + 1 || Number.MAX_VALUE;
  const shutdownIndex =
    items.findIndex((s) => s.status.S === "SHUTTING DOWN") + 1 ||
    Number.MAX_VALUE;
  const minIndex = Math.min(launchIndex, updateIndex, shutdownIndex);
  if (launchIndex === minIndex) {
    const deployIndex = deployItems.findIndex((s) =>
      ["SUCCESS", "FAILURE"].includes(s.status.S)
    );
    if (deployIndex) {
      return { progress: deployIndex / 5, progressType: "DEPLOYING" };
    }
    return { progress: launchIndex / 26, progressType: "LAUNCHING" };
  } else if (updateIndex === minIndex) {
    return { progress: updateIndex / 20, progressType: "UPDATING" };
  } else {
    return { progress: shutdownIndex / 18, progressType: "SHUTTING DOWN" };
  }
};

export const handler: APIGatewayProxyHandler = (event) => {
  const token =
    event.headers.Authorization || event.headers.authorization || "";
  return getRoamJSUser(token, "")
    .then((u) => [
      { ...u, token },
      {
        ...event.queryStringParameters,
        ...JSON.parse(event.body || "{}"),
      },
    ])
    .then(async ([user, { graph }]) => {
      const authUser = await getRoamJSUser(
        user.token,
        process.env.ROAMJS_EXTENSION_ID
      )
        .then((u) => ({
          websiteGraph: u.websiteGraph as string,
          authenticated: true,
        }))
        .catch(() =>
          dynamo
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
            .then((r) => r.Items.some((i) => i?.status_props?.S === user.email))
            .then((authenticated) => ({ websiteGraph: graph, authenticated }))
        );
      if (!authUser.authenticated) {
        return {
          statusCode: 403,
          body: `User not authorized to get status of website from graph ${graph}.`,
          headers,
        };
      }
      if (!authUser.websiteGraph) {
        return {
          statusCode: 204,
          body: JSON.stringify({}),
          headers,
        };
      }

      if (graph !== authUser.websiteGraph) {
        return {
          statusCode: 401,
          body: "This user has a deployed website in another graph.",
          headers,
        };
      }

      const statuses = await dynamo
        .query({
          TableName: "RoamJSWebsiteStatuses",
          KeyConditionExpression: "action_graph = :a",
          ExpressionAttributeValues: {
            ":a": {
              S: getActionGraph(graph as string),
            },
          },
          Limit: 100,
          ScanIndexForward: false,
          IndexName: "primary-index",
        })
        .promise()
        .catch((e) => {
          console.error(e);
          return { Items: [] };
        });
      if (!statuses.Items.length) {
        return {
          statusCode: 204,
          body: JSON.stringify({}),
          headers,
        };
      }

      const deployStatuses = await dynamo
        .query({
          TableName: "RoamJSWebsiteStatuses",
          KeyConditionExpression: "action_graph = :a",
          ExpressionAttributeValues: {
            ":a": {
              S: getActionGraph(graph, "deploy"),
            },
          },
          ScanIndexForward: false,
          IndexName: "primary-index",
        })
        .promise();

      const successDeployStatuses = deployStatuses.Items.filter((s) =>
        ["SUCCESS", "FAILURE"].includes(s.status.S)
      );
      const deploys =
        successDeployStatuses[0] === deployStatuses.Items[0]
          ? successDeployStatuses
          : [deployStatuses.Items[0], ...successDeployStatuses];
      const status = statuses.Items
        ? statuses.Items[0].status.S
        : "INITIALIZING";
      if (status === "INACTIVE")
        await putRoamJSUser(user.token, {
          websiteGraph: undefined,
        });

      return {
        statusCode: 200,
        body: JSON.stringify({
          graph,
          status,
          statusProps: statuses.Items
            ? statuses.Items[0].status_props?.S
            : "{}",
          deploys: deploys.slice(0, 10).map((d) => ({
            date: d.date.S,
            status: d.status.S,
            uuid: d.uuid.S,
          })),
          ...getProgressProps(statuses.Items, deployStatuses.Items),
        }),
        headers,
      };
    });
};
