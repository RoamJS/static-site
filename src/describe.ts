import { Handler } from "aws-lambda";
import { cf } from "./common";

export const handler: Handler<{
  roamGraph: string;
}> = async ({ roamGraph }) => {
  return cf
    .describeStacks({ StackName: `roamjs-${roamGraph}` })
    .promise()
    .then((c) =>
      Object.fromEntries(
        c.Stacks[0].Parameters.map((p) => [p.ParameterKey, p.ParameterValue])
      )
    );
};
