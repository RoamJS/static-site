import type { APIGatewayProxyHandler } from "aws-lambda";
import { awsGetRoamJSUser } from "roamjs-components/backend/getRoamJSUser";
import headers from "roamjs-components/backend/headers";
import { getHostedZoneByGraphName, route53 } from "./common/common";

export const handler: APIGatewayProxyHandler = awsGetRoamJSUser(
  async ({ websiteGraph }) => {
    if (!websiteGraph) {
      return {
        statusCode: 200,
        body: JSON.stringify({ records: [] }),
        headers,
      };
    }

    return getHostedZoneByGraphName(websiteGraph as string)
      .then(({ HostedZoneId, domain }) =>
        HostedZoneId
          ? route53
              .listResourceRecordSets({ HostedZoneId })
              .promise()
              .then((c) => ({
                records: c.ResourceRecordSets.filter((r) =>
                  r.Name.endsWith(`${domain}.`)
                )
                  .map((r) => ({
                    name: r.Name.replace(
                      new RegExp(`\\.?${domain.replace(".", "\\.")}\\.$`),
                      ""
                    ),
                    type: r.Type,
                    value: r.ResourceRecords[0]?.Value || '',
                  }))
                  .filter(({ name }) => !!name),
              }))
          : { records: [] }
      )
      .then((c) => ({
        statusCode: 200,
        body: JSON.stringify(c),
        headers,
      }))
      .catch((e) => ({ statusCode: 500, body: e.mesage, headers }));
  }
);
