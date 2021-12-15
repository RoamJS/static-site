import { APIGatewayProxyHandler } from "aws-lambda";
import { getRoamJSUser, headers, lambda } from "./common/common";

export const handler: APIGatewayProxyHandler = (event) =>
  getRoamJSUser(event)
    .then(() => {
      return {
        statusCode: 200,
        body: JSON.stringify({
          themes: [
            {
              name: "Default",
              description: "A default theme for testing",
              thumbnail: "https://roamjs.com/images/logo.png",
              value: "#content {\n  width: 320px;\n}",
            },
          ],
        }),
        headers,
      };
    })
    .catch((e) => ({
      statusCode: e.response?.status || 500,
      body: e.response?.data || e.message,
      headers,
    }));
