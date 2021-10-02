import { APIGatewayProxyHandler } from "aws-lambda";
import AWS from "aws-sdk";
import {
  dynamo,
  getActionGraph,
  getRoamJSUser,
  headers,
} from "./common/common";

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

export const handler: APIGatewayProxyHandler = async (event) => {
  return getRoamJSUser(event)
    .then((r) => r.data.websiteGraph)
    .then(async (graph) => {
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
          body: "There's already a live static site with this token",
          headers,
        };
      }

      const statuses = await dynamo
        .query({
          TableName: "RoamJSWebsiteStatuses",
          KeyConditionExpression: "action_graph = :a",
          ExpressionAttributeValues: {
            ":a": {
              S: getActionGraph(graph),
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
              S: getActionGraph(graph, 'deploy'),
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

      return {
        statusCode: 200,
        body: JSON.stringify({
          graph,
          status: statuses.Items ? statuses.Items[0].status.S : "INITIALIZING",
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
    })
    .catch((e) => ({
      statusCode: e.response?.status || 500,
      body: e.response?.data || e.message,
      headers,
    }));
};
