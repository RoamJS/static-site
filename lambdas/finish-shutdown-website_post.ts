import { APIGatewayProxyHandler } from "aws-lambda";
import { getRoamJSUser, headers, putRoamJSUser, ses } from "./common/common";

export const handler: APIGatewayProxyHandler = async (event) => {
  const { userId, callbackToken, domain } = JSON.parse(event.body);
  if (!userId) {
    return {
      statusCode: 400,
      body: "UserId is required",
      headers,
    };
  }

  const { websiteToken, websiteGraph, email } = await getRoamJSUser(
    event
  ).then((r) => r.data);
  if (!websiteToken) {
    return {
      statusCode: 401,
      body: "User not awaiting a website shutdown.",
      headers,
    };
  }
  if (websiteToken !== callbackToken) {
    return {
      statusCode: 401,
      body: `Unauthorized call to finish website shutdown.`,
      headers,
    };
  }

  await putRoamJSUser(event, {
    websiteGraph: undefined,
    websiteToken: undefined,
  });

  await ses
    .sendEmail({
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Body: {
          Text: {
            Charset: "UTF-8",
            Data: `Your static site is at ${domain} is no longer live. There are no sites connected to your graph ${websiteGraph}.`,
          },
        },
        Subject: {
          Charset: "UTF-8",
          Data: `Your RoamJS site has successfully shutdown.`,
        },
      },
      Source: "support@roamjs.com",
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
    headers,
  };
};
