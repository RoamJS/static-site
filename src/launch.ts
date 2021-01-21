import AWS from "aws-sdk";
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

export const handler = async (event: { roamGraph: string; domain: string }) => {
  const logStatus = async (S: string) =>
    await dynamo
      .putItem({
        TableName: "RoamJSWebsiteStatuses",
        Item: {
          uuid: {
            S: v4(),
          },
          action_graph: {
            S: `launch_${event.roamGraph}`,
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

  const domainParts = event.domain.split(".");
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

    let status = "SUBMITTED";
    while (status !== "SUCCESSFUL") {
      const { Status, Message } = await domains
        .getOperationDetail({ OperationId })
        .promise();
      if (Status === "ERROR" || Status === "FAILED") {
        throw new Error(`Domain Registration ${Status} - ${Message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const HostedZoneId = await getHostedZoneIdByName(HostedZoneName);

  await logStatus("CREATING WEBSITE");
  const Tags = [
    {
      Key: "Application",
      Value: "Roam JS Extensions",
    },
  ];
  await cf
    .createStack({
      RoleARN: process.env.CLOUDFORMATION_ROLE_ARN,
      StackName: `roamjs-${event.roamGraph}`,
      Tags,
      TemplateBody: JSON.stringify({
        Resources: {
          AcmCertificate: {
            Type: "AWS::CertificateManager::Certificate",
            Properties: {
              DomainName: event.domain,
              Tags,
              ValidationMethod: "DNS",
              DomainValidationOptions: [
                {
                  DomainName: event.domain,
                  HostedZoneId,
                },
              ],
            },
          },
          CloudfrontDistribution: {
            Type: "AWS::CloudFront::Distribution",
            Properties: {
              DistributionConfig: {
                Aliases: [event.domain],
                Comment: `CloudFront CDN for ${event.domain}`,
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
                  TargetOriginId: `S3-${event.domain}`,
                  ViewerProtocolPolicy: "redirect-to-https",
                },
                DefaultRootObject: `${event.roamGraph}/index.html`,
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
                    DomainName: event.domain,
                    Id: `S3-${event.domain}`,
                    OriginCustomHeaders: [
                      {
                        HeaderName: "User-Agent",
                        HeaderValue: process.env.CLOUDFRONT_SECRET,
                      },
                      {
                        HeaderName: "X-Roam-Graph",
                        HeaderValue: event.roamGraph,
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
              AliasTarget: {
                HostedZoneId: "Z2FDTNDATAQYW2",
                DNSName: {
                  "Fn::GetAtt": ["CloudfrontDistribution", "DomainName"],
                },
              },
              HostedZoneId,
              Name: event.domain,
              Type: "A",
            },
          },
          Route53AAAARecord: {
            Type: "AWS::Route53::RecordSet",
            Properties: {
              AliasTarget: {
                HostedZoneId: "Z2FDTNDATAQYW2",
                DNSName: {
                  "Fn::GetAtt": ["CloudfrontDistribution", "DomainName"],
                },
              },
              HostedZoneId,
              Name: event.domain,
              Type: "AAAA",
            },
          },
        },
      }),
    })
    .promise();

  await logStatus("FIRST DEPLOY");
  await lambda
    .invoke({
      FunctionName: "RoamJS_deploy",
      InvocationType: "Event",
      Payload: JSON.stringify({
        roamGraph: event.roamGraph,
        domain: event.domain,
      }),
    })
    .promise();

  return { success: true };
};
