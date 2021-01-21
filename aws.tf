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

variable "cloudfront_secret" {
  type = string
}

variable "contact_detail" {
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

resource "aws_lambda_function" "viewer_request" {
  function_name    = "RoamJS_viewer-request"
  role             = aws_iam_role.cloudfront_lambda.arn
  handler          = "viewer-request.handler"
  runtime          = "nodejs12.x"
  publish          = false
  tags             = {
    Application = "Roam JS Extensions"
  }
  lifecycle {
    ignore_changes = [
      filename
    ]
  }
}

resource "aws_lambda_function" "origin_request" {
  function_name    = "RoamJS_origin-request"
  role             = aws_iam_role.cloudfront_lambda.arn
  handler          = "origin-request.handler"
  runtime          = "nodejs12.x"
  publish          = false
  tags             = {
    Application = "Roam JS Extensions"
  }
  lifecycle {
    ignore_changes = [
      filename
    ]
  }
}

resource "aws_dynamodb_table" "website-statuses" {
  name           = "RoamJSWebsiteStatuses"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "uuid"
  range_key      = "date"

  attribute {
    name = "uuid"
    type = "S"
  }

  attribute {
    name = "action_graph"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  global_secondary_index {
    hash_key           = "action_graph"
    name               = "primary-index"
    non_key_attributes = []
    range_key          = "date"
    projection_type    = "ALL"
    read_capacity      = 0
    write_capacity     = 0
  }

  tags = {
    Application = "Roam JS Extensions"
  }
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

resource "aws_cloudfront_distribution" "roamjs_network" {
  count           = 1
  comment         = "CloudFront CDN for RoamJS Network ${count.index}"
  enabled         = true
  is_ipv6_enabled = true
  price_class     = "PriceClass_All"
  tags            = {
    Application = "Roam JS Extensions"
  }

  origin {
    domain_name = aws_s3_bucket.main.website_endpoint
    origin_id   = format("S3-%s", aws_s3_bucket.main.bucket)

    custom_origin_config {
      origin_protocol_policy = "http-only"
      http_port              = "80"
      https_port             = "443"
      origin_ssl_protocols = ["TLSv1", "TLSv1.2"]
    }

    custom_header {
      name  = "User-Agent"
      value = var.secret
    }
  }

  viewer_certificate {
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1_2016"
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    target_origin_id       = format("S3-%s", aws_s3_bucket.main.bucket)
    compress               = "true"
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = "0"
    default_ttl            = "86400"
    max_ttl                = "31536000"

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    lambda_function_association {
      event_type   = "viewer-request"
      lambda_arn   = aws_lambda_function.viewer_request.qualified_arn
      include_body = false
    }

    lambda_function_association {
      event_type   = "origin-request"
      lambda_arn   = aws_lambda_function.origin_request.qualified_arn
      include_body = false
    }
  }

  custom_error_response {
    error_code = 404
    response_code = 200
    response_page_path = "/404.html"
  }

  custom_error_response {
    error_code = 403
    response_code = 200
    response_page_path = "/index.html"
  }

  lifecycle {
    ignore_changes = [
      aliases,
      viewer_certificate.acm_certificate_arn
    ]
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

resource "github_actions_secret" "cloudfront_secret" {
  repository       = "generate-roam-site-lambda"
  secret_name      = "CLOUDFRONT_SECRET"
  plaintext_value  = var.cloudfront_secret
}

resource "github_actions_secret" "contact_detail" {
  repository       = "generate-roam-site-lambda"
  secret_name      = "CONTACT_DETAIL"
  plaintext_value  = var.contact_detail
}
