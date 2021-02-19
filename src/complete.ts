import AWS from "aws-sdk";
import { SNSEvent } from "aws-lambda";
import { cf, createLogStatus, getStackSummaries } from "./common";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const ses = new AWS.SES({ apiVersion: "2010-12-01" });
const route53 = new AWS.Route53({ apiVersion: "2013-04-01", credentials });
const acm = new AWS.ACM({ apiVersion: "2015-12-08", credentials });
const ACM_START_TEXT = "Content of DNS Record is: ";

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
          summaries,
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
    logStatus("MAKING PROGRESS", JSON.stringify(messageObject));
  }
};
