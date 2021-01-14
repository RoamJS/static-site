import AWS from "aws-sdk";
import { v4 } from "uuid";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
const s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  credentials,
});
const dynamo = new AWS.DynamoDB({ apiVersion: "2012-08-10", credentials });

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

  const Bucket = `roamjs-${event.roamGraph}`;
  await logStatus("EMPTYING HOST");
  await emptyBucket(Bucket);

  await logStatus("DELETING HOST");
  await s3
    .deleteBucket({
      Bucket,
    })
    .promise();
    
  await logStatus("INACTIVE");
  return { success: true };
};
