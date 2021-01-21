import { CloudFrontRequestHandler } from "aws-lambda";

export const handler: CloudFrontRequestHandler = (event, _, callback) => {
  console.log("Event: ", JSON.stringify(event));
  const request = event.Records[0].cf.request;
  const olduri = request.uri;
  const newuri = `/${request.origin.custom.customHeaders["x-roam-graph"][0].value}${olduri}`;
  request.uri = newuri;
  console.log("Mapped", olduri, "to", newuri);
  return callback(null, request);
};
