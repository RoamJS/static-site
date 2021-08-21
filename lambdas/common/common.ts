import AWS from "aws-sdk";
import { v4 } from "uuid";
import { JSDOM } from "jsdom";
import { TreeNode } from "roam-client";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
export const dynamo = new AWS.DynamoDB({
  apiVersion: "2012-08-10",
  credentials,
});
export const cf = new AWS.CloudFormation({
  apiVersion: "2010-05-15",
  credentials,
});
export const route53 = new AWS.Route53({
  apiVersion: "2013-04-01",
  credentials,
});
export const cloudfront = new AWS.CloudFront({
  apiVersion: "2020-05-31",
  credentials,
});

export const SHUTDOWN_CALLBACK_STATUS = "PREPARING TO DELETE STACK";

export const createLogStatus =
  (roamGraph: string, type = "launch") =>
  async (S: string, props?: string) =>
    await dynamo
      .putItem({
        TableName: "RoamJSWebsiteStatuses",
        Item: {
          uuid: {
            S: v4(),
          },
          action_graph: {
            S: `${type}_${roamGraph}`,
          },
          date: {
            S: new Date().toJSON(),
          },
          status: {
            S,
          },
          ...(props ? { status_props: { S: props } } : {}),
        },
      })
      .promise();

export const getStackSummaries = (StackName: string) =>
  cf
    .listStackResources({ StackName })
    .promise()
    .then((r) => r.StackResourceSummaries);

export const clearRecordsById = async (HostedZoneId?: string) => {
  if (HostedZoneId) {
    const CNAME = await route53
      .listResourceRecordSets({ HostedZoneId })
      .promise()
      .then((sets) => sets.ResourceRecordSets.find((r) => r.Type === "CNAME"));
    if (CNAME) {
      await route53
        .changeResourceRecordSets({
          HostedZoneId,
          ChangeBatch: {
            Changes: [{ Action: "DELETE", ResourceRecordSet: CNAME }],
          },
        })
        .promise();
    }
  }
};

export const clearRecords = async (StackName: string) => {
  const summaries = await getStackSummaries(StackName);
  const HostedZoneId = summaries.find(
    (s) => s.LogicalResourceId === "HostedZone"
  )?.PhysicalResourceId;
  await clearRecordsById(HostedZoneId);
};

export const getStackParameter = (key: string, StackName: string) =>
  cf
    .describeStacks({ StackName })
    .promise()
    .then(
      (c) =>
        c.Stacks[0].Parameters.find(({ ParameterKey }) => ParameterKey === key)
          .ParameterValue
    );

export const graphToStackName = (graph: string) =>
  `roamjs-${graph.replace("_", "-")}`;

export type HydratedTreeNode = Omit<TreeNode, "children"> & {
  references: { title: string; uid: string }[];
  children: HydratedTreeNode[];
};

export type RenderFunction = (
  dom: JSDOM,
  props: Record<string, string[]>,
  context: {
    convertPageNameToPath: (s: string) => string;
    references: { title: string; node: HydratedTreeNode }[];
    pageName: string;
  }
) => void;

export const ensureReact = (document: Document, head = document.head): void => {
  if (!document.getElementById("roamjs-react")) {
    const react = document.createElement("script");
    react.id = "roamjs-react";
    react.src = "https://unpkg.com/react@17/umd/react.production.min.js";
    const reactdom = document.createElement("script");
    reactdom.id = "roamjs-react-dom";
    reactdom.src =
      "https://unpkg.com/react-dom@17/umd/react-dom.production.min.js";
    head.appendChild(react);
    head.appendChild(reactdom);
  }
};

export const ensureBlueprint = (
  document: Document,
  head = document.head
): void => {
  if (!document.getElementById("roamjs-blueprint")) {
    const bp = document.createElement("link");
    bp.id = "roamjs-blueprint";
    bp.href =
      "https://unpkg.com/@blueprintjs/core@^3.10.0/lib/css/blueprint.css";
    const normalize = document.createElement("link");
    normalize.id = "roamjs-blueprint-normalize";
    normalize.href = "https://unpkg.com/normalize.css@^7.0.0";
    bp.rel = normalize.rel = "stylesheet";
    head.appendChild(normalize);
    head.appendChild(bp);
  }
};

export const ensureScript = (
  id: string,
  componentProps: Record<string, unknown>,
  document: Document,
  head = document.head
): void => {
  const propScript = document.createElement("script");
  propScript.innerHTML = `window.roamjsProps = {
    ...window.roamjsProps,
    "${id}": ${JSON.stringify(componentProps)}
  }`;
  propScript.type = "text/javascript";
  head.appendChild(propScript);
  const componentScript = document.createElement("script");
  componentScript.src = `https://roamjs.com/static-site/${id}.js`;
  componentScript.defer = true;
  head.appendChild(componentScript);
};
