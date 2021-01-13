import AWS from "aws-sdk";

const s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const emptyBucket = async (Bucket: string) => {
  const { Contents, IsTruncated } = await s3.listObjects({ Bucket }).promise();
  if (Contents.length > 0) {
    await s3
      .deleteObjects({
        Bucket,
        Delete: {
          Objects: Contents.map(({ Key }) => ({ Key })),
        },
      })
      .promise();
    if (IsTruncated) {
      await emptyBucket(Bucket);
    }
  }
};

export const handler = async (event: { roamGraph: string }) => {
  const Bucket = `roamjs-${event.roamGraph}`;
  await emptyBucket(Bucket);
  await s3
    .deleteBucket({
      Bucket,
    })
    .promise();
  return { success: true };
};
