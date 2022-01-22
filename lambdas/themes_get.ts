import { APIGatewayProxyHandler } from "aws-lambda";
import headers from "roamjs-components/backend/headers";
import { awsGetRoamJSUser } from "roamjs-components/backend/getRoamJSUser";

export const handler: APIGatewayProxyHandler = awsGetRoamJSUser(async () => ({
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
}));
