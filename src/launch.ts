import AWS from "aws-sdk";

const s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const handler = async (event: { roamGraph: string }) => {
  const Bucket = `roamjs-${event.roamGraph}`;

  await s3
    .createBucket({
      Bucket,
    })
    .promise();

  await s3
    .putBucketWebsite({
      Bucket,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: "index.html" },
        ErrorDocument: { Key: "404.html" },
      },
    })
    .promise();

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

  return { success: true };
};
