import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { ImageResizeBucket } from "./image-bucket";
import { CfnOutput, Stack } from "aws-cdk-lib";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from 'aws-cdk-lib/aws-iam';
import { join } from "path";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export class ImageResizeStack2 extends cdk.Stack {
  public readonly ImageResizeBucket: ImageResizeBucket;
  public readonly imageResizeFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // s3 bucket
    this.ImageResizeBucket = new ImageResizeBucket(
      this,
      'ImageResizeBucket',
    );

    // Lambda@Edge 역할 설정
    const edgeLambdaRole = new iam.Role(this, 'EdgeLambdaRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('edgelambda.amazonaws.com'),
        new iam.ServicePrincipal('lambda.amazonaws.com')
      ),
    });
  
    // CloudWatch Logs 권한 추가
    edgeLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "iam:CreateServiceLinkedRole",
        "lambda:GetFunction",
        "lambda:EnableReplication",
        "cloudfront:UpdateDistribution",
        "s3:GetObject",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      resources: ["*"]
    }));
      
    // Lambda@edge
    const imageResizeFilePath = join(__dirname, "..", "lambda", "image-resize.ts");

    this.imageResizeFunction = new NodejsFunction(this, 'ImageResizeFunction2', {
      bundling: {
        minify: true,
        nodeModules: ["aws-sdk", "sharp"],
        forceDockerBundling: true,
      },
      entry: imageResizeFilePath,
      handler: 'handler',
      functionName: "ImageResizeFunction2",
      runtime: lambda.Runtime.NODEJS_20_X,
      role: edgeLambdaRole,
    })
    
    const cachePolicy = new cloudfront.CachePolicy(this, 'CachePolicy', {
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList('w', 'h', 'q', 'f'),
    });

    // cloudfront
    const imageBucketDistribution = new cloudfront.Distribution(
      this,
      'imageBucketDistribution',
      {
        defaultBehavior: {
          origin: new origins.S3Origin(this.ImageResizeBucket.bucket, {
            originShieldRegion: Stack.of(this).region,
          }),
          cachePolicy: cachePolicy,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          edgeLambdas: [
            {
              functionVersion: this.imageResizeFunction.currentVersion,
              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
            },
          ],
        },
      }
    );
    
    new CfnOutput(this, "imageBucketDistributionDomainName", {
      value: imageBucketDistribution.distributionDomainName,
    });
  }
}
