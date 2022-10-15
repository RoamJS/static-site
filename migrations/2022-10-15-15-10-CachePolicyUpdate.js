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
      if (
        !template.Resources.CloudfrontDistributionRoamjs ||
        !template.Resources.CloudfrontDistribution
      ) {
        console.log(
          StackName,
          "was skipped",
          !!template.Resources.CloudfrontDistributionRoamjs,
          !!template.Resources.CloudfrontDistribution
        );
        return 0;
      }
      const {
        Properties: {
          DistributionConfig: { DefaultCacheBehavior: dcbrjs },
        },
      } = template.Resources.CloudfrontDistributionRoamjs;
      const {
        Properties: {
          DistributionConfig: { DefaultCacheBehavior: dcb },
        },
      } = template.Resources.CloudfrontDistribution;
      if (!dcb.CachePolicyId || !dcbrjs.CachePolicyId) {
        dcb.CachePolicyId = dcbrjs.CachePolicyId =
          "b66124f0-5072-4fc7-b1c8-805a29798e82";
        delete dcb["DefaultTTL"];
        delete dcb["MaxTTL"];
        delete dcb["MinTTL"];
        delete dcbrjs["DefaultTTL"];
        delete dcbrjs["MaxTTL"];
        delete dcbrjs["MinTTL"];
        console.log(StackName, "needs update");
        return debug
          ? Promise.resolve(1)
          : cloudformation
              .createChangeSet({
                StackName,
                TemplateBody: JSON.stringify(template),
                // Starting with a number throws a validation constraint
                ChangeSetName: `CachePolicyUpdate-2022-10-15-15-34`,
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
      console.log("Failed to migrate", StackName, e);
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
          console.log("Migrating", s.StackName, "...");
          return migrateStack(
            s.StackName,
            s.StackName === "roamjs-dvargas92495"
          );
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
