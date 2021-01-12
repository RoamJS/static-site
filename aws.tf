terraform {
    backend "remote" {
        hostname = "app.terraform.io"
        organization = "VargasArts"
        workspaces {
            prefix = "generate-roam-site-lambda"
        }
    }
}

variable "vercel_token" {
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

resource "aws_lambda_function" "lambda_function" {
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

data "aws_iam_policy_document" "deploy_policy" {
  statement {
    actions = [
      "lambda:UpdateFunctionCode"
    ]

    resources = [aws_lambda_function.lambda_function.arn]
  }
}

data "aws_iam_user" "deploy_lambda" {
  user_name  = "RoamJS-cron"
}

resource "aws_iam_user_policy" "deploy_lambda" {
  user   = data.aws_iam_user.deploy_lambda.user_name
  policy = data.aws_iam_policy_document.deploy_policy.json
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

resource "github_actions_secret" "vercel_token" {
  repository       = "generate-roam-site-lambda"
  secret_name      = "VERCEL_TOKEN"
  plaintext_value  = var.vercel_token
}
