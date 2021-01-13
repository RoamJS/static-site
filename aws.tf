terraform {
    backend "remote" {
        hostname = "app.terraform.io"
        organization = "VargasArts"
        workspaces {
            prefix = "generate-roam-site-lambda"
        }
    }
}

variable "support_roam_password" {
    type = string
}

variable "aws_access_token" {
  type = string
}

variable "aws_secret_token" {
  type = string
}

provider "aws" {
    region = "us-east-1"
    access_key = var.aws_access_token
    secret_key = var.aws_secret_token
}

data "aws_iam_role" "cron_role" {
  name = "RoamJS-lambda-cron"
}

# lambda resource requires either filename or s3... wow
data "archive_file" "dummy" {
  type        = "zip"
  output_path = "./dummy.zip"

  source {
    content   = "// TODO IMPLEMENT"
    filename  = "dummy.js"
  }
}

resource "aws_lambda_function" "deploy_function" {
  function_name    = "RoamJS_deploy"
  role             = data.aws_iam_role.cron_role.arn
  handler          = "deploy.handler"
  runtime          = "nodejs12.x"
  filename         = "dummy.zip"
  publish          = false
  tags             = {
    Application = "Roam JS Extensions"
  }
  timeout          = 300
  memory_size      = 1600
}

resource "aws_lambda_function" "launch_function" {
  function_name    = "RoamJS_launch"
  role             = data.aws_iam_role.cron_role.arn
  handler          = "launch.handler"
  runtime          = "nodejs12.x"
  filename         = "dummy.zip"
  publish          = false
  tags             = {
    Application = "Roam JS Extensions"
  }
  timeout          = 300
  memory_size      = 1600
}

resource "aws_lambda_function" "shutdown_function" {
  function_name    = "RoamJS_shutdown"
  role             = data.aws_iam_role.cron_role.arn
  handler          = "shutdown.handler"
  runtime          = "nodejs12.x"
  filename         = "dummy.zip"
  publish          = false
  tags             = {
    Application = "Roam JS Extensions"
  }
  timeout          = 300
  memory_size      = 1600
}

resource "aws_dynamodb_table" "website-statuses" {
  name           = "RoamJSWebsiteStatuses"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "uuid"
  range_key      = "action_graph_date"

  attribute {
    name = "uuid"
    type = "S"
  }

  attribute {
    name = "action_graph_date"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    hash_key           = "status"
    name               = "status-index"
    non_key_attributes = []
    projection_type    = "ALL"
    range_key          = "action_graph_date"
    read_capacity      = 0
    write_capacity     = 0
  }

  global_secondary_index {
    hash_key           = "action_graph_date"
    name               = "primary-index"
    non_key_attributes = []
    projection_type    = "ALL"
    read_capacity      = 0
    write_capacity     = 0
  }

  tags = {
    Application = "Roam JS Extensions"
  }
}

provider "github" {
    owner = "dvargas92495"
}

resource "github_actions_secret" "deploy_aws_access_key" {
  repository       = "generate-roam-site-lambda"
  secret_name      = "DEPLOY_AWS_ACCESS_KEY"
  plaintext_value  = var.aws_access_token
}

resource "github_actions_secret" "deploy_aws_access_secret" {
  repository       = "generate-roam-site-lambda"
  secret_name      = "DEPLOY_AWS_ACCESS_SECRET"
  plaintext_value  = var.aws_secret_token
}

resource "github_actions_secret" "support_roam_password" {
  repository       = "generate-roam-site-lambda"
  secret_name      = "SUPPORT_ROAM_PASSWORD"
  plaintext_value  = var.support_roam_password
}
