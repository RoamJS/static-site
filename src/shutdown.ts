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
    .deleteBucket({
      Bucket,
    })
    .promise();
  return { success: true };
};
