import { v4 } from "uuid";
import format from "date-fns/format";
import { APIGatewayProxyHandler } from "aws-lambda";
import { dynamo, getRoamJSUser, headers, lambda, s3 } from "./common/common";

export const handler: APIGatewayProxyHandler = (event) => {
  const { data } = JSON.parse(event.body);
  return getRoamJSUser(event)
    .then(async (r) => {
      const { websiteGraph } = r.data;
      const date = new Date();
      await dynamo
        .putItem({
          TableName: "RoamJSWebsiteStatuses",
          Item: {
            uuid: {
              S: v4(),
            },
            action_graph: {
              S: `deploy_${websiteGraph}`,
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
        data && `${websiteGraph}/${format(date, "yyyyMMddhhmmss")}.json`;
      if (Key) {
        await s3
          .upload({
            Bucket: "roamjs-static-site-data",
            Key,
            Body: data,
          })
          .promise();
      }

      await lambda
        .invoke({
          FunctionName: "RoamJS_deploy",
          InvocationType: "Event",
          Payload: JSON.stringify({
            roamGraph: websiteGraph,
            key: Key,
          }),
        })
        .promise();

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
        headers,
      };
    });
};
