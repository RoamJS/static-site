const AWS = require("aws-sdk");
const lambda = new AWS.Lambda({
  apiVersion: "2015-03-31",
  region: "us-east-1",
});
const changedFiles = process.argv
  .slice(2)
  .filter((f) => f.startsWith("src/"))
  .map((f) => f.replace("src/", "").replace(".ts", ""));

console.log("Files that were changed", changedFiles);
Promise.all(
  changedFiles.map((id) =>
    lambda
      .updateFunctionCode({
        FunctionName: `RoamJS_${id}`,
        Publish: true,
        ZipFile: `fileb://out/${id}.zip`,
      })
      .promise()
  )
)
  .then((r) => console.log("Successfully deployed", r.length, "functions!"))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
