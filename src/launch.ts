import AWS from "aws-sdk";
import { Handler } from "aws-lambda";
import { v4 } from "uuid";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const cf = new AWS.CloudFormation({ apiVersion: "2010-05-15", credentials });
const dynamo = new AWS.DynamoDB({ apiVersion: "2012-08-10", credentials });
const lambda = new AWS.Lambda({ apiVersion: "2015-03-31", credentials });
const route53 = new AWS.Route53({ apiVersion: "2013-04-01", credentials });
const domains = new AWS.Route53Domains({
  apiVersion: "2014-05-15",
  credentials,
});

const getHostedZoneIdByName = async (domain: string) => {
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
      return zone.Id.replace(/\/hostedzone\//, "");
    }
    finished = !IsTruncated;
    Marker = NextMarker;
  }

  throw new Error(`Could not find zone for ${domain}`);
};

export const handler: Handler<{ roamGraph: string; domain: string }> = async ({
  roamGraph,
  domain,
}) => {
  const logStatus = async (S: string) =>
    await dynamo
      .putItem({
        TableName: "RoamJSWebsiteStatuses",
        Item: {
          uuid: {
            S: v4(),
          },
          action_graph: {
            S: `launch_${roamGraph}`,
          },
          date: {
            S: new Date().toJSON(),
          },
          status: {
            S,
          },
        },
      })
      .promise();

  const domainParts = domain.split(".");
  const HostedZoneName = domainParts.slice(domainParts.length - 2).join(".");
  const available = await domains
    .checkDomainAvailability({ DomainName: HostedZoneName })
    .promise()
    .then((r) => r.Availability === "AVAILABLE");
  if (available) {
    await logStatus("BUYING DOMAIN");

    const Contact = {
      ContactType: "PERSON",
      CountryCode: "US",
      Email: "dvargas92495@gmail.com",
      FirstName: "David",
      LastName: "Vargas",
      ...JSON.parse(process.env.CONTACT_DETAIL),
    };
    const OperationId = await domains
      .registerDomain({
        TechContact: Contact,
        RegistrantContact: Contact,
        AdminContact: Contact,
        DomainName: HostedZoneName,
        DurationInYears: 1,
      })
      .promise()
      .then((r) => r.OperationId);

      await logStatus(`REGISTERED ${OperationId}`);
  }
  const HostedZoneId = await getHostedZoneIdByName(HostedZoneName);

  await logStatus("CREATING WEBSITE");
  const Tags = [
    {
      Key: "Application",
      Value: "Roam JS Extensions",
    },
  ];
  const AliasTarget = {
    HostedZoneId: "Z2FDTNDATAQYW2",
    DNSName: {
      "Fn::GetAtt": ["CloudfrontDistribution", "DomainName"],
    },
  };
  const Payload = JSON.stringify({
    roamGraph,
    domain,
  });
  await cf
    .createStack({
      NotificationARNs: [process.env.SNS_TOPIC_ARN],
      RoleARN: process.env.CLOUDFORMATION_ROLE_ARN,
      StackName: `roamjs-${roamGraph}`,
      Tags,
      TemplateBody: JSON.stringify({
        Resources: {
          AcmCertificate: {
            Type: "AWS::CertificateManager::Certificate",
            Properties: {
              DomainName: domain,
              Tags,
              ValidationMethod: "DNS",
              DomainValidationOptions: [
                {
                  DomainName: domain,
                  HostedZoneId,
                },
              ],
            },
          },
          CloudfrontDistribution: {
            Type: "AWS::CloudFront::Distribution",
            Properties: {
              DistributionConfig: {
                Aliases: [domain],
                Comment: `CloudFront CDN for ${domain}`,
                CustomErrorResponses: [
                  {
                    ErrorCode: 404,
                    ResponseCode: 200,
                    ResponsePagePath: "/404.html",
                  },
                  {
                    ErrorCode: 403,
                    ResponseCode: 200,
                    ResponsePagePath: "/index.html",
                  },
                ],
                DefaultCacheBehavior: {
                  AllowedMethods: ["GET", "HEAD", "OPTIONS"],
                  CachedMethods: ["GET", "HEAD", "OPTIONS"],
                  Compress: true,
                  DefaultTTL: 86400,
                  ForwardedValues: {
                    Cookies: {
                      Forward: "none",
                    },
                    QueryString: false,
                  },
                  LambdaFunctionAssociations: [
                    {
                      EventType: "origin-request",
                      IncludeBody: false,
                      LambdaFunctionARN: process.env.ORIGIN_LAMBDA_ARN,
                    },
                  ],
                  MaxTTL: 31536000,
                  MinTTL: 0,
                  TargetOriginId: `S3-${domain}`,
                  ViewerProtocolPolicy: "redirect-to-https",
                },
                DefaultRootObject: `${roamGraph}/index.html`,
                Enabled: true,
                IPV6Enabled: true,
                Origins: [
                  {
                    CustomOriginConfig: {
                      HTTPPort: 80,
                      HTTPSPort: 443,
                      OriginProtocolPolicy: "http-only",
                      OriginSSLProtocols: ["TLSv1", "TLSv1.2"],
                    },
                    DomainName: domain,
                    Id: `S3-${domain}`,
                    OriginCustomHeaders: [
                      {
                        HeaderName: "User-Agent",
                        HeaderValue: process.env.CLOUDFRONT_SECRET,
                      },
                      {
                        HeaderName: "X-Roam-Graph",
                        HeaderValue: roamGraph,
                      },
                    ],
                  },
                ],
                PriceClass: "PriceClass_All",
                ViewerCertificate: {
                  AcmCertificateArn: {
                    Ref: "AcmCertificate",
                  },
                  MinimumProtocolVersion: "TLSv1_2016",
                  SslSupportMethod: "sni-only",
                },
              },
              Tags,
            },
          },
          Route53ARecord: {
            Type: "AWS::Route53::RecordSet",
            Properties: {
              AliasTarget,
              HostedZoneId,
              Name: domain,
              Type: "A",
            },
          },
          Route53AAAARecord: {
            Type: "AWS::Route53::RecordSet",
            Properties: {
              AliasTarget,
              HostedZoneId,
              Name: domain,
              Type: "AAAA",
            },
          },
          CloudwatchRule: {
            Type: "AWS::Events::Rule",
            Properties: {
              Description: `RoamJS Static Site Deploy for ${roamGraph}`,
              ScheduleExpression: "cron(0 4 ? * * *)",
              Name: `RoamJS-${roamGraph}`,
              RoleArn: process.env.CLOUDWATCH_ROLE_ARN,
              State: "ENABLED",
              Targets: [
                {
                  Id: "DeployLambda",
                  Input: Payload,
                  Arn: process.env.DEPLOY_LAMBDA_ARN,
                },
              ],
            },
          },
        },
      }),
    })
    .promise();

  await lambda
    .invoke({
      FunctionName: "RoamJS_deploy",
      InvocationType: "Event",
      Payload,
    })
    .promise();

  return { success: true };
};
