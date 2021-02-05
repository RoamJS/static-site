import { CloudFrontRequestHandler } from "aws-lambda";

export const handler: CloudFrontRequestHandler = (event, _, callback) => {
  const request = event.Records[0].cf.request;
  const olduri = request.uri;
  const graph = request.origin.custom.customHeaders["x-roam-graph"][0].value;
  if (olduri !== `/${graph}/index.html`) {
    const newuri = `/${graph}${olduri}${olduri.includes(".") ? "" : ".html"}`;
    request.uri = newuri;
  }
  console.log("Mapped", olduri, "to", request.uri);
  return callback(null, request);
};
