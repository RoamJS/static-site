import { Handler } from "aws-lambda";
import { cf, graphToStackName } from "./common/common";

export const handler: Handler<{
  roamGraph: string;
}> = async ({ roamGraph }) => {
  return cf
    .describeStacks({ StackName: graphToStackName(roamGraph) })
    .promise()
    .then((c) =>
      Object.fromEntries(
        c.Stacks[0].Parameters.map((p) => [p.ParameterKey, p.ParameterValue])
      )
    );
};
