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
const cf = new AWS.CloudFormation({ apiVersion: "2010-05-15", credentials });

const emptyBucket = async (props: {Bucket: string, Prefix: string}) => {
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

  const Bucket = `roamjs-static-sites`;
  await logStatus("EMPTYING HOST");
  await emptyBucket({Bucket, Prefix: event.roamGraph});

  await logStatus("DELETING WEBSITE");
  await cf.deleteStack({
    StackName: `roamjs-${event.roamGraph}`,
  }).promise()
    
  await logStatus("INACTIVE");
  return { success: true };
};
