const AWS = require("aws-sdk");
const lambda = new AWS.Lambda({ apiVersion: "2015-03-31" });
const changedFiles = process.argv.slice(2);

console.log("Files that were changed", changedFiles);
Promise.all([
  lambda
    .updateFunctionCode({
      FunctionName: "RoamJS_deploy",
      Publish: true,
      ZipFile: "fileb://out/deploy.zip",
    })
    .promise(),
  lambda
    .updateFunctionCode({
      FunctionName: "RoamJS_launch",
      Publish: true,
      ZipFile: "fileb://out/launch.zip",
    })
    .promise(),
  lambda
    .updateFunctionCode({
      FunctionName: "RoamJS_shutdown",
      Publish: true,
      ZipFile: "fileb://out/shutdown.zip",
    })
    .promise(),
  lambda
    .updateFunctionCode({
      FunctionName: "RoamJS_origin-request",
      Publish: true,
      ZipFile: "fileb://out/origin-request.zip",
    })
    .promise(),
]);
