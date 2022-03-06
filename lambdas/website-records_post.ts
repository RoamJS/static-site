import type { APIGatewayProxyHandler } from "aws-lambda";
import { changeRecordHandler } from "./common/common";

export const handler: APIGatewayProxyHandler = changeRecordHandler("CREATE");
