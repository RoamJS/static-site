import { Handler } from "aws-lambda";
import { cf, graphToStackName } from "./common/common";

export const handler: Handler<{
  roamGraph: string;
  diffs: { key: string; value: string }[];
}> = async ({ roamGraph, diffs }) => {
  const StackName = graphToStackName(roamGraph);
  const originalParameters = await cf
    .describeStacks({ StackName })
    .promise()
    .then((s) => s.Stacks[0].Parameters);
  const diffObject = Object.fromEntries(
    diffs.map(({ key, value }) => [key, value])
  );
  await cf
    .updateStack({
      StackName,
      Parameters: originalParameters.map(({ ParameterKey }) =>
        diffObject[ParameterKey]
          ? {
              ParameterKey,
              ParameterValue: diffObject[ParameterKey],
            }
          : {
              ParameterKey,
              UsePreviousValue: true,
            }
      ),
      UsePreviousTemplate: true,
    })
    .promise();
  return { success: true };
};
