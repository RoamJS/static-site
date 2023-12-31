terraform {
  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "VargasArts"
    workspaces {
      prefix = "generate-roam-site-lambda"
    }
  }
  required_providers {
    github = {
      source  = "integrations/github"
      version = "4.2.0"
    }
  }
}

variable "aws_access_token" {
  type = string
}

variable "aws_secret_token" {
  type = string
}

variable "cloudfront_secret" {
  type = string
}

variable "developer_token" {
  type = string
}

variable "github_token" {
  type = string
}

provider "aws" {
  region     = "us-east-1"
  access_key = var.aws_access_token
  secret_key = var.aws_secret_token
}

data "aws_iam_role" "roamjs_lambda_role" {
  name = "roam-js-extensions-lambda-execution"
}

data "aws_iam_policy_document" "assume_lambda_edge_policy" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type = "Service"
      identifiers = [
        "lambda.amazonaws.com",
        "edgelambda.amazonaws.com"
      ]
    }
  }
}

data "aws_iam_policy_document" "lambda_logs_policy_doc" {
  statement {
    effect    = "Allow"
    resources = ["*"]
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:CreateLogGroup"
    ]
  }
}

data "aws_route53_zone" "roamjs" {
  name = "roamjs.com."
}

resource "aws_iam_role_policy" "logs_role_policy" {
  name   = "RoamJS-lambda-cloudfront"
  role   = aws_iam_role.cloudfront_lambda.id
  policy = data.aws_iam_policy_document.lambda_logs_policy_doc.json
}

resource "aws_iam_role" "cloudfront_lambda" {
  name = "RoamJS-lambda-cloudfront"
  tags = {
    Application = "Roam JS Extensions"
  }
  assume_role_policy = data.aws_iam_policy_document.assume_lambda_edge_policy.json
}



data "aws_iam_policy_document" "bucket_policy" {
  statement {
    actions = [
      "s3:GetObject",
    ]

    resources = [
      "arn:aws:s3:::roamjs-static-sites/*",
    ]

    condition {
      test     = "StringEquals"
      variable = "aws:UserAgent"

      values = [var.cloudfront_secret]
    }

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket" "main" {
  bucket = "roamjs-static-sites"
  policy = data.aws_iam_policy_document.bucket_policy.json

  website {
    index_document = "index.html"
    error_document = "404.html"
  }
  force_destroy = true

  tags = {
    Application = "Roam JS Extensions"
  }
}

data "aws_iam_role" "lambda_execution" {
  name = "roam-js-extensions-lambda-execution"
}

resource "aws_iam_role" "cf_role" {
  name = "roamjs_cloudformation"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "cloudformation.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF

  tags = {
    Application = "Roam JS Extensions"
  }
}

resource "aws_iam_role_policy_attachment" "acm_roam" {
  role       = aws_iam_role.cf_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSCertificateManagerFullAccess"
}

resource "aws_iam_role_policy_attachment" "cloudfront_roam" {
  role       = aws_iam_role.cf_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudFrontFullAccess"
}

resource "aws_iam_role_policy_attachment" "route53_roam" {
  role       = aws_iam_role.cf_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonRoute53FullAccess"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_roam" {
  role       = aws_iam_role.cf_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchFullAccess"
}

data "aws_iam_policy_document" "assume_cloudwatch_policy" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type = "Service"
      identifiers = [
        "events.amazonaws.com"
      ]
    }
  }
}

data "aws_iam_policy_document" "invoke_cloudwatch_policy" {
  statement {
    effect    = "Allow"
    resources = ["*"]
    actions = [
      "batch:SubmitJob"
    ]
  }
}

resource "aws_iam_role" "cloudwatch" {
  name = "RoamJS-deploys-cloudwatch"
  tags = {
    Application = "Roam JS Extensions"
  }
  assume_role_policy = data.aws_iam_policy_document.assume_cloudwatch_policy.json
}

resource "aws_iam_role_policy" "cloudwatch_policy" {
  name   = "RoamJS-deploys-cloudwatch"
  role   = aws_iam_role.cloudwatch.id
  policy = data.aws_iam_policy_document.invoke_cloudwatch_policy.json
}

data "aws_iam_policy_document" "cloudformation_extra" {
  statement {
    sid = "CloudWatchEvents"
    actions = [
      "events:*",
    ]

    resources = [
      "*",
    ]
  }

  statement {
    sid = "IamPassRole"
    actions = [
      "iam:PassRole",
    ]

    resources = [
      aws_iam_role.cloudwatch.arn,
    ]
  }
}

resource "aws_iam_role_policy" "cloudformation_extra" {
  name   = "cloudformation_extra_policy"
  role   = aws_iam_role.cf_role.id
  policy = data.aws_iam_policy_document.cloudformation_extra.json
}
