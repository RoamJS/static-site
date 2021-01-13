import AWS from "aws-sdk";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  credentials,
});

const lambda = new AWS.Lambda({ apiVersion: "2015-03-31", credentials });

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

  await lambda
    .invokeAsync({
      FunctionName: "RoamJS_deploy",
      InvokeArgs: {
        roamGraph: event.roamGraph,
      },
    })
    .promise();

  return { success: true };
};
