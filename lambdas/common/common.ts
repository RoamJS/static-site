import AWS, { Route53 } from "aws-sdk";
import axios from "axios";
import { awsGetRoamJSUser } from "roamjs-components/backend/getRoamJSUser";
import headers from "roamjs-components/backend/headers";
import { v4 } from "uuid";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
export const dynamo = new AWS.DynamoDB({
  apiVersion: "2012-08-10",
  credentials,
});
export const cf = new AWS.CloudFormation({
  apiVersion: "2010-05-15",
  credentials,
});
export const route53 = new AWS.Route53({
  apiVersion: "2013-04-01",
  credentials,
});
export const cloudfront = new AWS.CloudFront({
  apiVersion: "2020-05-31",
  credentials,
});
export const lambda = new AWS.Lambda({ apiVersion: "2015-03-31", credentials });
export const s3 = new AWS.S3({ apiVersion: "2006-03-01", credentials });
export const ses = new AWS.SES({ apiVersion: "2010-12-01", credentials });

type InvokeLambdaProps = { path: string; data: Record<string, unknown> };
export const invokeLambda =
  process.env.NODE_ENV === "production"
    ? ({ path, data }: InvokeLambdaProps) =>
        lambda
          .invoke({
            FunctionName: `RoamJS_${path}`,
            InvocationType: "Event",
            Payload: JSON.stringify(data),
          })
          .promise()
    : ({ path, data }: InvokeLambdaProps) =>
        axios.post(`http://localhost:3003/dev/${path}`, data);

export const SHUTDOWN_CALLBACK_STATUS = "PREPARING TO DELETE STACK";

export const getActionGraph = (graph: string, type = "launch") =>
  `${type}_${graphToStackName(graph).replace(/^roamjs-/, "")}`;

export const createLogStatus =
  (roamGraph: string, type = "launch") =>
  async (S: string, props?: string) =>
    await dynamo
      .putItem({
        TableName: "RoamJSWebsiteStatuses",
        Item: {
          uuid: {
            S: v4(),
          },
          action_graph: {
            S: getActionGraph(roamGraph, type),
          },
          date: {
            S: new Date().toJSON(),
          },
          status: {
            S,
          },
          ...(props ? { status_props: { S: props } } : {}),
        },
      })
      .promise();

export const getStackSummaries = (StackName: string) =>
  cf
    .listStackResources({ StackName })
    .promise()
    .then((r) => r.StackResourceSummaries);

export const waitForChangeToSync = ({
  Id,
  count = 0,
}: {
  Id: string;
  count?: number;
}) => {
  route53
    .getChange({ Id })
    .promise()
    .then((r) =>
      r.ChangeInfo.Status === "INSYNC"
        ? Promise.resolve()
        : count === 500
        ? Promise.reject(
            `Timed out waiting for change: ${Id}. Last status: ${r.ChangeInfo.Status}`
          )
        : new Promise((resolve) =>
            setTimeout(
              () => resolve(waitForChangeToSync({ Id, count: count + 1 })),
              1000
            )
          )
    );
};

export const clearRecordsById = async (HostedZoneId?: string) => {
  if (HostedZoneId) {
    const CNAME = await route53
      .listResourceRecordSets({ HostedZoneId })
      .promise()
      .then((sets) => sets.ResourceRecordSets.find((r) => r.Type === "CNAME"));
    if (CNAME) {
      await route53
        .changeResourceRecordSets({
          HostedZoneId,
          ChangeBatch: {
            Changes: [{ Action: "DELETE", ResourceRecordSet: CNAME }],
          },
        })
        .promise()
        .then((r) => waitForChangeToSync({ Id: r.ChangeInfo.Id }));
    }
  }
};

export const clearRecords = async (StackName: string) => {
  const summaries = await getStackSummaries(StackName);
  const HostedZoneId = summaries.find(
    (s) => s.LogicalResourceId === "HostedZone"
  )?.PhysicalResourceId;
  await clearRecordsById(HostedZoneId);
};

export const getStackParameter = (key: string, StackName: string) =>
  cf
    .describeStacks({ StackName })
    .promise()
    .then(
      (c) =>
        c.Stacks[0].Parameters.find(({ ParameterKey }) => ParameterKey === key)
          .ParameterValue
    )
    .catch(() => "");

export const graphToStackName = (graph: string) =>
  `roamjs-${graph.replace("_", "-")}`;

export const getHostedZone = async (
  domain: string
): Promise<string | undefined> => {
  let finished = false;
  let Marker: string = undefined;
  while (!finished) {
    const { HostedZones, IsTruncated, NextMarker } = await route53
      .listHostedZones({ Marker })
      .promise();
    const zone = HostedZones.find((i) => i.Name === `${domain}.`);
    if (zone) {
      return zone.Id;
    }
    finished = !IsTruncated;
    Marker = NextMarker;
  }

  return undefined;
};

export const getHostedZoneByStackName = async (StackName: string) => {
  const isCustomDomain = await getStackParameter("CustomDomain", StackName);
  const domain = await getStackParameter("DomainName", StackName);
  if (isCustomDomain === "true") {
    return await getHostedZone(domain).then((HostedZoneId) => ({
      HostedZoneId,
      domain,
    }));
  } else if (isCustomDomain === "false") {
    return { HostedZoneId: process.env.ROAMJS_ZONE_ID, domain };
  } else {
    return { HostedZoneId: "", domain: "" };
  }
};

export const getHostedZoneByGraphName = (graph: string) =>
  getHostedZoneByStackName(graphToStackName(graph));

export const changeRecordHandler = (Action: Route53.ChangeAction) =>
  awsGetRoamJSUser<{
    name: string;
    value: string;
    type: Route53.RRType;
  }>(async ({ websiteGraph }, record) => {
    if (!websiteGraph) {
      return {
        statusCode: 204,
        body: JSON.stringify({ success: false }),
        headers,
      };
    }

    return getHostedZoneByGraphName(websiteGraph as string)
      .then(async ({ HostedZoneId, domain }) => {
        if (HostedZoneId) {
          const Name =
            record.name === domain
              ? `${domain}.`
              : `${record.name.replace(/\.$/, "")}.${domain}.`;
          const allExisting = await route53
            .listResourceRecordSets({ HostedZoneId })
            .promise();
          const existing = allExisting.ResourceRecordSets.find(
            (r) => r.Name === Name && r.Type === record.type
          );
          if ((Action === "UPSERT" || Action === "DELETE") && !existing) {
            throw new Error(`Cannot update nonexistant record`);
          }
          const Changes =
            Action === "CREATE" && existing
              ? [
                  {
                    Action: "UPSERT",
                    ResourceRecordSet: {
                      Name,
                      Type: record.type,
                      ResourceRecords: existing.ResourceRecords.concat([{ Value: record.value }]),
                      TTL: 300,
                    },
                  },
                ]
              : [
                  {
                    Action,
                    ResourceRecordSet: {
                      Name,
                      Type: record.type,
                      ResourceRecords: [{ Value: record.value }],
                      TTL: 300,
                    },
                  },
                ];
          return route53
            .changeResourceRecordSets({
              HostedZoneId,
              ChangeBatch: {
                Changes,
              },
            })
            .promise();
        } else throw new Error(`Could not find Hosted Zone`);
      })
      .then((r) => {
        return waitForChangeToSync({ Id: r.ChangeInfo.Id });
      })
      .then(() => ({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
        headers,
      }))
      .catch((e) => {
        console.error(e);
        return { statusCode: 500, body: e.mesage, headers };
      });
  });
