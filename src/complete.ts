import AWS from "aws-sdk";
import { SNSEvent } from "aws-lambda";
import axios from "axios";
import { cf, createLogStatus, getStackSummaries } from "./common";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const ses = new AWS.SES({ apiVersion: "2010-12-01" });
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
  AcmCertificate: factory("CERTIFICATE"),
  CloudfrontDistribution: factory("NETWORK"),
  HostedZone: factory("ZONE"),
  Route53ARecord: factory("DOMAIN"),
  Route53AAAARecord: factory("ALTERNATE DOMAIN"),
  Route53ARecordRoamJS: factory("ROAMJS DOMAIN"),
  Route53AAAARecordRoamJS: factory("ALTERNATE ROAMJS DOMAIN"),
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
  } = messageObject;
  const roamGraph = StackName.match("roamjs-(.*)")[1];
  const logStatus = createLogStatus(roamGraph);

  if (LogicalResourceId === StackName) {
    if (ResourceStatus === "CREATE_COMPLETE") {
      const summaries = await getStackSummaries(StackName);
      const roamjsDomain = summaries.find(
        (s) => s.LogicalResourceId === "Route53ARecordRoamJS"
      ).PhysicalResourceId;
      const domain = summaries.find(
        (s) => s.LogicalResourceId === "Route53ARecord"
      ).PhysicalResourceId;

      await logStatus("LIVE");
      const email = await cf
        .describeStacks({ StackName })
        .promise()
        .then(
          (c) =>
            c.Stacks[0].Parameters.find(
              ({ ParameterKey }) => ParameterKey === "Email"
            ).ParameterValue
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
                Data: `Your static site is live and accessible at ${roamjsDomain}. Follow instructions below to make your site accessible from your custom domain, ${domain}.`,
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
    } else if (ResourceStatus === "DELETE_COMPLETE") {
      await logStatus("INACTIVE");
      const shutdownCallback = await cf
        .describeStacks({ StackName })
        .promise()
        .then(
          (c) =>
            c.Stacks[0].Parameters.find(
              ({ ParameterKey }) => ParameterKey === "ShutdownCallback"
            ).ParameterValue
        );
      const { url, ...data } = JSON.parse(shutdownCallback);
      axios.post(url, data);
    } else if (ResourceStatus === "CREATE_IN_PROGRESS") {
      logStatus("CREATING RESOURCES");
    } else if (ResourceStatus === "DELETE_IN_PROGRESS") {
      logStatus("BEGIN DESTROYING RESOURCES");
    }
  } else if (ResourceStatusReason.startsWith(ACM_START_TEXT)) {
    const summaries = await getStackSummaries(StackName);
    const CertificateArn = summaries.find(
      (s) => s.LogicalResourceId === "AcmCertificate"
    ).PhysicalResourceId;
    const domain = await acm
      .describeCertificate({ CertificateArn })
      .promise()
      .then((r) => r.Certificate.DomainName);
    const zone = await getHostedZone(domain);
    console.log(
      "ACM!!!",
      JSON.stringify(
        {
          ...messageObject,
          domain,
          CertificateArn,
          zoneId: zone?.Id,
        },
        null,
        4
      )
    );

    if (zone) {
      const sets = await route53
        .listResourceRecordSets({ HostedZoneId: zone.Id })
        .promise();
      const set = sets.ResourceRecordSets.find((r) => r.Type === "NS");
      const ns = set.ResourceRecords.map((r) => r.Value);
      logStatus("AWAITING VALIDATION", JSON.stringify(ns));
    }
  } else {
    const loggedStatus =
      STATUSES[LogicalResourceId as keyof typeof STATUSES]?.[
        ResourceStatus as keyof Status
      ];
    if (!loggedStatus) {
      logStatus("MAKING PROGRESS", JSON.stringify(messageObject, null, 4));
    } else {
      logStatus(loggedStatus);
    }
  }
};
