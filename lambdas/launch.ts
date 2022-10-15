import { Handler } from "aws-lambda";
import emailError from "roamjs-components/backend/emailError";
import { createLogStatus, cf, graphToStackName } from "./common/common";

// Remix Cache Policy ID
const CachePolicyId = "b66124f0-5072-4fc7-b1c8-805a29798e82";

export const handler: Handler<{
  roamGraph: string;
  domain: string;
  email: string;
}> = async ({ roamGraph, domain, email }) => {
  const logStatus = createLogStatus(roamGraph);
  try {
    await logStatus("ALLOCATING HOST");
    const isCustomDomain = !domain.endsWith(".roamjs.com");

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
    const DomainName = { Ref: "DomainName" };

    await cf
      .createStack({
        NotificationARNs: [process.env.SNS_TOPIC_ARN],
        Parameters: [
          {
            ParameterKey: "Email",
            ParameterValue: email,
          },
          {
            ParameterKey: "CustomDomain",
            ParameterValue: `${isCustomDomain}`,
          },
          {
            ParameterKey: "DomainName",
            ParameterValue: domain,
          },
          {
            ParameterKey: "RoamGraph",
            ParameterValue: roamGraph,
          },
        ],
        RoleARN: process.env.CLOUDFORMATION_ROLE_ARN,
        StackName: graphToStackName(roamGraph),
        Tags,
        TemplateBody: JSON.stringify({
          Parameters: {
            Email: {
              Type: "String",
            },
            CustomDomain: {
              Type: "String",
            },
            DomainName: {
              Type: "String",
            },
            RoamGraph: {
              Type: "String",
            },
          },
          Conditions: {
            HasCustomDomain: {
              "Fn::Equals": [
                {
                  Ref: "CustomDomain",
                },
                "true",
              ],
            },
            HasRoamjsDomain: {
              "Fn::Equals": [
                {
                  Ref: "CustomDomain",
                },
                "false",
              ],
            },
          },
          Resources: {
            HostedZone: {
              Type: "AWS::Route53::HostedZone",
              Condition: "HasCustomDomain",
              Properties: {
                HostedZoneConfig: {
                  Comment: `RoamJS Static Site For ${roamGraph}`,
                },
                Name: DomainName,
              },
            },
            AcmCertificate: {
              Type: "AWS::CertificateManager::Certificate",
              Condition: "HasCustomDomain",
              Properties: {
                DomainName,
                SubjectAlternativeNames: [],
                Tags,
                ValidationMethod: "DNS",
                DomainValidationOptions: [
                  {
                    DomainName,
                    HostedZoneId: { "Fn::GetAtt": ["HostedZone", "Id"] },
                  },
                ],
              },
            },
            AcmCertificateRoamjs: {
              Type: "AWS::CertificateManager::Certificate",
              Condition: "HasRoamjsDomain",
              Properties: {
                DomainName,
                SubjectAlternativeNames: [],
                Tags,
                ValidationMethod: "DNS",
                DomainValidationOptions: [
                  {
                    DomainName,
                    HostedZoneId: process.env.ROAMJS_ZONE_ID,
                  },
                ],
              },
            },
            CloudfrontDistribution: {
              Type: "AWS::CloudFront::Distribution",
              Condition: "HasCustomDomain",
              Properties: {
                DistributionConfig: {
                  Aliases: [DomainName],
                  Comment: `CloudFront CDN for RoamJS ${roamGraph}`,
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
                    CachePolicyId,
                    Compress: true,
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
                      DomainName: process.env.S3_WEBSITE_ENDPOINT,
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
            CloudfrontDistributionRoamjs: {
              Type: "AWS::CloudFront::Distribution",
              Condition: "HasRoamjsDomain",
              Properties: {
                DistributionConfig: {
                  Aliases: [DomainName],
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
                    CachePolicyId,
                    Compress: true,
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
                      DomainName: process.env.S3_WEBSITE_ENDPOINT,
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
                      Ref: "AcmCertificateRoamjs",
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
              Condition: "HasCustomDomain",
              Properties: {
                AliasTarget,
                HostedZoneId: { "Fn::GetAtt": ["HostedZone", "Id"] },
                Name: DomainName,
                Type: "A",
              },
            },
            Route53AAAARecord: {
              Type: "AWS::Route53::RecordSet",
              Condition: "HasCustomDomain",
              Properties: {
                AliasTarget,
                HostedZoneId: { "Fn::GetAtt": ["HostedZone", "Id"] },
                Name: DomainName,
                Type: "AAAA",
              },
            },
            Route53ARecordRoamjs: {
              Type: "AWS::Route53::RecordSet",
              Condition: "HasRoamjsDomain",
              Properties: {
                AliasTarget: {
                  HostedZoneId: "Z2FDTNDATAQYW2",
                  DNSName: {
                    "Fn::GetAtt": [
                      "CloudfrontDistributionRoamjs",
                      "DomainName",
                    ],
                  },
                },
                HostedZoneId: process.env.ROAMJS_ZONE_ID,
                Name: DomainName,
                Type: "A",
              },
            },
            Route53AAAARecordRoamjs: {
              Type: "AWS::Route53::RecordSet",
              Condition: "HasRoamjsDomain",
              Properties: {
                AliasTarget: {
                  HostedZoneId: "Z2FDTNDATAQYW2",
                  DNSName: {
                    "Fn::GetAtt": [
                      "CloudfrontDistributionRoamjs",
                      "DomainName",
                    ],
                  },
                },
                HostedZoneId: process.env.ROAMJS_ZONE_ID,
                Name: DomainName,
                Type: "AAAA",
              },
            },
          },
        }),
      })
      .promise();

    return { success: true };
  } catch (e) {
    await logStatus("FAILURE", JSON.stringify({ message: e.message }));
    await emailError("Launch Failed", e);
    return { success: false };
  }
};
