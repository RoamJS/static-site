import AWS from "aws-sdk";
import {
  cf,
  clearRecords,
  createLogStatus,
  SHUTDOWN_CALLBACK_STATUS,
} from "./common";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
const s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  credentials,
});

const emptyBucket = async (props: { Bucket: string; Prefix: string }) => {
  const { Contents, IsTruncated } = await s3.listObjects(props).promise();
  if (Contents.length > 0) {
    await s3
      .deleteObjects({
        Bucket: props.Bucket,
        Delete: {
          Objects: Contents.map(({ Key }) => ({ Key })),
        },
      })
      .promise();
    if (IsTruncated) {
      await emptyBucket(props);
    }
  }
};

export const handler = async (event: {
  roamGraph: string;
  shutdownCallback: string;
}) => {
  const logStatus = createLogStatus(event.roamGraph);

  const Bucket = `roamjs-static-sites`;
  await logStatus("EMPTYING HOST");
  await emptyBucket({ Bucket, Prefix: event.roamGraph });

  await logStatus("DELETING RECORD");
  const StackName = `roamjs-${event.roamGraph}`;
  await clearRecords(StackName);

  await logStatus(
    SHUTDOWN_CALLBACK_STATUS,
    JSON.stringify(event.shutdownCallback)
  );

  await cf
    .deleteStack({
      StackName,
    })
    .promise();

  return { success: true };
};
