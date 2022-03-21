const AWS = require("aws-sdk");

const cloudformation = new AWS.CloudFormation();

const waitForChangeSet = ({ ChangeSetName, trial }) => {
  return cloudformation
    .describeChangeSet({ ChangeSetName })
    .promise()
    .then((c) => {
      if (c.Status === "CREATE_COMPLETE") {
        return Promise.resolve(true);
      } else if (trial > 100) {
        return Promise.reject("Timed out");
      } else if (
        c.Status === "CREATE_IN_PROGRESS" ||
        c.Status === "CREATE_PENDING"
      ) {
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(waitForChangeSet({ ChangeSetName, trial: trial + 1 })),
            5000
          )
        );
      } else {
        return Promise.reject(`Failed with ${c.Status}`);
      }
    });
};

const errors = {};

const migrateStack = (StackName, debug = false) => {
  return cloudformation
    .getTemplate({ StackName })
    .promise()
    .then(async (t) => {
      const template = JSON.parse(t.TemplateBody);
      const hasRoamJS = !!template.Resources.CloudfrontDistributionRoamjs;
      const oldArn =
        template.Resources.CloudfrontDistribution.Properties.DistributionConfig
          .DefaultCacheBehavior.LambdaFunctionAssociations[0].LambdaFunctionARN;
      const oldArnRoamjs = hasRoamJS
        ? template.Resources.CloudfrontDistributionRoamjs.Properties
            .DistributionConfig.DefaultCacheBehavior
            .LambdaFunctionAssociations[0].LambdaFunctionARN
        : "";
      if (!oldArn.endsWith(":20") || !oldArnRoamjs.endsWith(":20")) {
        template.Resources.CloudfrontDistribution.Properties.DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations[0].LambdaFunctionARN =
          oldArn.replace(/:\d{1,2}$/, ":20");
        if (hasRoamJS)
          template.Resources.CloudfrontDistributionRoamjs.Properties.DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations[0].LambdaFunctionARN =
            oldArnRoamjs.replace(/:\d{1,2}$/, ":20");
        console.log(
          "mapping",
          oldArn,
          "to",
          template.Resources.CloudfrontDistribution.Properties
            .DistributionConfig.DefaultCacheBehavior
            .LambdaFunctionAssociations[0].LambdaFunctionARN,
          "for",
          StackName
        );
        if (hasRoamJS)
          console.log(
            "mapping",
            oldArnRoamjs,
            "to",
            template.Resources.CloudfrontDistributionRoamjs.Properties
              .DistributionConfig.DefaultCacheBehavior
              .LambdaFunctionAssociations[0].LambdaFunctionARN,
            "for",
            StackName
          );
        return debug
          ? Promise.resolve(1)
          : cloudformation
              .createChangeSet({
                StackName,
                TemplateBody: JSON.stringify(template),
                ChangeSetName: `OriginUpdate-2022-03-21-11-35`,
                Parameters: await cloudformation
                  .describeStacks({ StackName })
                  .promise()
                  .then((c) => c.Stacks[0].Parameters),
              })
              .promise()
              .then((c) =>
                waitForChangeSet({ ChangeSetName: c.Id, trial: 0 }).then(() =>
                  cloudformation
                    .executeChangeSet({ ChangeSetName: c.Id })
                    .promise()
                )
              )
              .then(() => console.log(StackName, "updated"))
              .then(() => 1);
      }
      console.log(StackName, "already up to date");
      return 0;
    })
    .catch((e) => {
      console.log("Failed to migrate", StackName);
      errors[StackName] = e;
      return 0;
    });
};

const migrate = () =>
  cloudformation
    .listStacks()
    .promise()
    .then((stacks) =>
      stacks.StackSummaries.filter((s) => s.StackStatus !== "DELETE_COMPLETE")
        .map((s) => () => {
          console.log("Migrating", s.StackName, s.StackStatus, "...");
          return migrateStack(s.StackName, false);
        })
        .reduce(
          (p, c) => p.then((t) => c().then((_t) => _t + t)),
          Promise.resolve(0)
        )
    )
    .then((all) => {
      console.log("Migrated:", all);
      console.log("Errors Found:");
      Object.entries(errors).forEach(([n, e]) => console.log(n, "-", e));
    });

migrate().then(() => console.log("done!"));
