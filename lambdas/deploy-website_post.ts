import { v4 } from "uuid";
import format from "date-fns/format";
import { APIGatewayProxyHandler } from "aws-lambda";
import { dynamo, invokeLambda, s3 } from "./common/common";
import { awsGetRoamJSUser } from "roamjs-components/backend/getRoamJSUser";
import headers from "roamjs-components/backend/headers";

export const handler: APIGatewayProxyHandler = awsGetRoamJSUser(
  async (user, { data }) => {
    const { websiteGraph } = user;
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

    await invokeLambda({
      path: "deploy",
      data: {
        roamGraph: websiteGraph,
        key: Key,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
      headers,
    };
  }
);
