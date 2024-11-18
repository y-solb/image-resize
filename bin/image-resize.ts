#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ImageResizeStack2 } from '../lib/image-resize-stack';

const app = new cdk.App();

// aws account
new ImageResizeStack2(app, 'ImageResizeStack2', {
  env: { account: '0000000000', region: 'us-east-1' },
});