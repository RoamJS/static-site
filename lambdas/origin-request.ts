import type {
  CloudFrontRequestEvent,
  CloudFrontRequestCallback,
  Context,
} from "aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDB({
  region: 'us-east-1'
});

export const handler = async (
  event: CloudFrontRequestEvent,
  _: Context,
  callback: CloudFrontRequestCallback
) => {
  const request = event.Records[0].cf.request;
  const olduri = request.uri;
  const graph = request.origin.custom.customHeaders["x-roam-graph"][0].value;
  const mappedUri = await dynamo
    .query({
      TableName: "RoamJSWebsiteStatuses",
      IndexName: "status-index",
      ExpressionAttributeNames: {
        "#s": "status",
        "#a": "action_graph",
      },
      ExpressionAttributeValues: {
        ":s": { S: olduri },
        ":a": { S: `redirect_${graph}` },
      },
      KeyConditionExpression: "#a = :a AND #s = :s",
    })
    .then((r) => r.Items[0]?.status_props?.S);
  if (mappedUri) {
    return {
      status: "301",
      statusDescription: "Moved Permanently",
      headers: {
        location: [
          {
            key: "Location",
            value: mappedUri,
          },
        ],
      },
    };
  }
  if (olduri !== `/${graph}/index.html`) {
    const newuri = `/${graph}${olduri}${olduri.includes(".") ? "" : ".html"}`;
    request.uri = encodeURI(newuri);
  }
  return callback(null, request);
};
