import AWS from "aws-sdk";
import { SNSEvent } from "aws-lambda";
import axios from "axios";
import {
  cf,
  clearRecords,
  clearRecordsById,
  cloudfront,
  createLogStatus,
  dynamo,
  getStackParameter,
  getStackSummaries,
  SHUTDOWN_CALLBACK_STATUS,
} from "./common";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const ses = new AWS.SES({ apiVersion: "2010-12-01", credentials });
const route53 = new AWS.Route53({ apiVersion: "2013-04-01", credentials });
const acm = new AWS.ACM({ apiVersion: "2015-12-08", credentials });
const ACM_START_TEXT = "Content of DNS Record is: ";

type Status = {
  CREATE_IN_PROGRESS: string;
  CREATE_COMPLETE: string;
  DELETE_IN_PROGRESS: string;
  DELETE_COMPLETE: string;
};

const factory = (resource: string) => ({
  CREATE_IN_PROGRESS: `CREATING ${resource}`,
  CREATE_COMPLETE: `${resource} CREATED`,
  DELETE_IN_PROGRESS: `DELETING ${resource}`,
  DELETE_COMPLETE: `${resource} DELETED`,
});

const STATUSES = {
  HostedZone: factory("ZONE"),
  AcmCertificate: factory("CERTIFICATE"),
  CloudfrontDistribution: factory("NETWORK"),
  Route53ARecord: factory("DOMAIN"),
  Route53AAAARecord: factory("ALTERNATE DOMAIN"),
  AcmCertificateRoamjs: factory("CERTIFICATE"),
  CloudfrontDistributionRoamjs: factory("NETWORK"),
  Route53ARecordRoamjs: factory("DOMAIN"),
  Route53AAAARecordRoamjs: factory("ALTERNATE DOMAIN"),
  CloudwatchRule: factory("DEPLOYER"),
};

const getHostedZone = async (domain: string) => {
  let finished = false;
  let Marker: string = undefined;
  while (!finished) {
    const {
      HostedZones,
      IsTruncated,
      NextMarker,
    } = await route53.listHostedZones({ Marker }).promise();
    const zone = HostedZones.find((i) => i.Name === `${domain}.`);
    if (zone) {
      return zone;
    }
    finished = !IsTruncated;
    Marker = NextMarker;
  }

  return undefined;
};

export const handler = async (event: SNSEvent) => {
  const message = event.Records[0].Sns.Message;
  const messageObject = Object.fromEntries(
    message
      .split("\n")
      .map((l) => l.split("="))
      .map(([key, value]) => [
        key,
        value && value.substring(1, value.length - 1),
      ])
  );
  const {
    StackName,
    LogicalResourceId,
    ResourceStatus,
    ResourceStatusReason,
    PhysicalResourceId,
  } = messageObject;

  const roamGraph = await getStackParameter("RoamGraph", StackName);
  const logStatus = createLogStatus(roamGraph);

  if (LogicalResourceId === StackName) {
    if (
      ResourceStatus === "CREATE_COMPLETE" ||
      ResourceStatus === "UPDATE_COMPLETE"
    ) {
      const domain = await getStackParameter("DomainName", StackName);

      await logStatus("LIVE");
      const email = await getStackParameter("Email", StackName);
      if (domain.split(".").length > 2 && !domain.endsWith(".roamjs.com")) {
        const Id = await getStackSummaries(StackName).then(
          (summaries) =>
            summaries.find(
              (s) => s.LogicalResourceId === "CloudfrontDistribution"
            ).PhysicalResourceId
        );
        const cloudfrontDomain = await cloudfront
          .getDistribution({ Id })
          .promise()
          .then((r) => r.Distribution.DomainName);
        await ses
          .sendEmail({
            Destination: {
              ToAddresses: [email],
            },
            Message: {
              Body: {
                Text: {
                  Charset: "UTF-8",
                  Data: `Now, for your site to be accessible at ${domain}, you will need to add one more DNS record to the settings of your domain:\n\nType: CNAME\nName: ${domain}\nValue: ${cloudfrontDomain}`,
                },
              },
              Subject: {
                Charset: "UTF-8",
                Data: `Your RoamJS site is almost ready!`,
              },
            },
            Source: "support@roamjs.com",
          })
          .promise();
      } else {
        await ses
          .sendEmail({
            Destination: {
              ToAddresses: [email],
            },
            Message: {
              Body: {
                Text: {
                  Charset: "UTF-8",
                  Data: `Your static site is live and accessible at ${domain}.`,
                },
              },
              Subject: {
                Charset: "UTF-8",
                Data: `Your RoamJS site is now live!`,
              },
            },
            Source: "support@roamjs.com",
          })
          .promise();
      }
    } else if (ResourceStatus === "DELETE_COMPLETE") {
      await logStatus("INACTIVE");
      const shutdownCallback = await dynamo
        .query({
          TableName: "RoamJSWebsiteStatuses",
          KeyConditionExpression: "action_graph = :a",
          ExpressionAttributeValues: {
            ":a": {
              S: `launch_${roamGraph}`,
            },
          },
          ScanIndexForward: false,
          IndexName: "primary-index",
        })
        .promise()
        .then(
          (r) =>
            (r.Items || []).find((i) => i.status.S === SHUTDOWN_CALLBACK_STATUS)
              ?.status_props?.S
        );
      if (shutdownCallback) {
        const { url, ...data } = JSON.parse(shutdownCallback);
        await axios
          .post(url, data)
          .then(() => console.log(`successfully called ${url}`))
          .catch((e) =>
            console.error(
              `failed to call ${url}: ${e.response?.data || e.message}`
            )
          );
      } else {
        console.error("Could not find Shutdown Callback Status");
      }
    } else if (ResourceStatus === "CREATE_IN_PROGRESS") {
      await logStatus("CREATING RESOURCES");
    } else if (ResourceStatus === "DELETE_IN_PROGRESS") {
      await logStatus("BEGIN DESTROYING RESOURCES");
    }
  } else if (ResourceStatusReason.startsWith(ACM_START_TEXT)) {
    const isCustomDomain =
      (await getStackParameter("CustomDomain", StackName)) === "true";
    if (isCustomDomain) {
      const domain = await getStackParameter("DomainName", StackName);
      const zone = await getHostedZone(domain);

      if (zone) {
        const sets = await route53
          .listResourceRecordSets({ HostedZoneId: zone.Id })
          .promise();
        const email = await getStackParameter("Email", StackName);
        const domainParts = domain.split(".").length;
        if (domainParts === 2) {
          const set = sets.ResourceRecordSets.find((r) => r.Type === "NS");
          const nameServers = set.ResourceRecords.map((r) =>
            r.Value.replace(/\.$/, "")
          );
          await logStatus(
            "AWAITING VALIDATION",
            JSON.stringify({ nameServers })
          );
          await ses
            .sendEmail({
              Destination: {
                ToAddresses: [email],
              },
              Message: {
                Body: {
                  Text: {
                    Charset: "UTF-8",
                    Data: `Add the following four nameservers to your domain settings.\n\n${nameServers
                      .map((ns) => `- ${ns}\n`)
                      .join(
                        ""
                      )}\nIf the domain is not validated in the next 48 hours, the website will fail to launch and a rollback will begin.`,
                  },
                },
                Subject: {
                  Charset: "UTF-8",
                  Data: `Your RoamJS static site is awaiting validation.`,
                },
              },
              Source: "support@roamjs.com",
            })
            .promise();
        } else if (domainParts > 2) {
          const set = sets.ResourceRecordSets.find((r) => r.Type === "CNAME");
          const cname = {
            name: set.Name.replace(/\.$/, ""),
            value: set.ResourceRecords[0].Value.replace(/\.$/, ""),
          };
          await logStatus(
            "AWAITING VALIDATION",
            JSON.stringify({
              cname,
            })
          );
          await ses
            .sendEmail({
              Destination: {
                ToAddresses: [email],
              },
              Message: {
                Body: {
                  Text: {
                    Charset: "UTF-8",
                    Data: `Add the following DNS Record in the settings for your domain\n\nType: CNAME\nName: ${cname.name}\nValue: ${cname.value}`,
                  },
                },
                Subject: {
                  Charset: "UTF-8",
                  Data: `Your RoamJS static site is awaiting validation.`,
                },
              },
              Source: "support@roamjs.com",
            })
            .promise();
        }
      }
    } else {
      await logStatus("AWAITING VALIDATION");
    }
  } else if (ResourceStatus === "ROLLBACK_IN_PROGRESS") {
    await clearRecords(StackName);
  } else if (ResourceStatus === "ROLLBACK_FAILED") {
    await logStatus("ROLLBACK FAILED. MESSAGE support@roamjs.com FOR HELP");
  } else {
    const loggedStatus =
      STATUSES[LogicalResourceId as keyof typeof STATUSES]?.[
        ResourceStatus as keyof Status
      ];
    if (!loggedStatus) {
      await logStatus(
        "MAKING PROGRESS",
        JSON.stringify(messageObject, null, 4)
      );
    } else {
      await logStatus(loggedStatus);
    }
    if (
      ResourceStatus === "DELETE_IN_PROGRESS" &&
      LogicalResourceId === "HostedZone"
    ) {
      await clearRecordsById(PhysicalResourceId);
    }
  }
};
