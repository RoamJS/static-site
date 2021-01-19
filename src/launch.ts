import AWS from "aws-sdk";
import { v4 } from "uuid";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const cf = new AWS.CloudFormation({ apiVersion: "2010-05-15", credentials });
const dynamo = new AWS.DynamoDB({ apiVersion: "2012-08-10", credentials });
const lambda = new AWS.Lambda({ apiVersion: "2015-03-31", credentials });

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

  /*  await logStatus("CREATING HOST");
  const Bucket = `roamjs-${event.roamGraph}`;
  await s3
    .createBucket({
      Bucket,
    })
    .promise();
*/
  await logStatus("CREATING WEBSITE");
  const Tags = [
    {
      Key: "Application",
      Value: "Roam JS Extensions",
    },
  ];
  await cf.createStack({
    RoleARN: "arn:aws:iam::643537615676:role/roamjs_cloudformation",
    StackName: `roamjs-${event.roamGraph}`,
    Tags: [
      {
        Key: "Application",
        Value: "Roam JS Extensions",
      },
    ],
    TemplateBody: JSON.stringify({
      Resources: {
        AcmCertificate: {
          Type: "AWS::CertificateManager::Certificate",
          Properties: {
            DomainName: event.domain,
            Tags,
            ValidationMethod: "DNS",
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
                ForwardedValues: [
                  {
                    Cookies: {
                      Forwrd: "none",
                    },
                    QueryString: false,
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
                  ],
                },
              ],
              PriceClass: "PriceClass_All",
              ViewerCertificate: {
                AcmCertificateArn: {
                  Ref: "AcmCertificate",
                },
                MinimumProtocolVersion: "sni-only",
                SslSupportMethod: "TLSv1_2016",
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
            HostedZoneName: event.domain.split(".").slice(1).join("."),
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
            HostedZoneName: event.domain.split(".").slice(1).join("."),
            Name: event.domain,
            Type: "AAAA",
          },
        },
      },
    }),
  });
  /*  await s3
    .putBucketWebsite({
      Bucket,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: "index.html" },
        ErrorDocument: { Key: "404.html" },
      },
    })
    .promise();

  await logStatus("CREATING POLICY");
  await s3
    .putBucketPolicy({
      Bucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "GetObject",
            Effect: "Allow",
            Principal: { AWS: "*" },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${Bucket}/*`],
          },
        ],
      }),
    })
    .promise();

  await logStatus("CREATING TAGS");
  await s3
    .putBucketTagging({
      Bucket,
      Tagging: {
        TagSet: [
          { Key: "Application", Value: "Roam JS Extensions" },
          { Key: "Service", Value: "Public Garden" },
        ],
      },
    })
    .promise();
*/
  await logStatus("FIRST DEPLOY");
  await lambda
    .invoke({
      FunctionName: "RoamJS_deploy",
      InvocationType: "Event",
      Payload: JSON.stringify({
        roamGraph: event.roamGraph,
      }),
    })
    .promise();

  return { success: true };
};
