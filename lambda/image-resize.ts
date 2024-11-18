import { S3 } from "aws-sdk";
import { CloudFrontResponseEvent, CloudFrontResponse, CloudFrontResponseCallback, Context } from 'aws-lambda';
const Sharp = require("sharp");

const s3 = new S3({
  region: "us-east-1",
});

// s3 bucket name
const BUCKET = "BUCKET";

const SUPPORTIMAGETYPES = ["jpg", "jpeg", "png", "gif", "webp", "svg", "tiff"];

exports.handler = async (event: CloudFrontResponseEvent, context: Context, callback: CloudFrontResponseCallback) => {
  const { request, response } = event.Records[0].cf;
  const { uri, querystring } = request;

  console.log('request ::::::::', request)
  console.log('response ::::::::', response)
  console.log('uri ::::::::', uri)
  console.log('querystring ::::::::', querystring)

  const params = new URLSearchParams(querystring);
  const objectKey = decodeURIComponent(uri).substring(1);

  const extension = uri.match(/\/?(.*)\.(.*)/)?.[2]?.toLowerCase() || "";

  const width = parseInt(params.get("w") || "0", 10);
  const height = parseInt(params.get("h") || "0", 10);
  const quality = parseInt(params.get("q") || "0", 10) || 100;
  const format = (params.get("f") || extension).toLowerCase();

  // const width = params.has('w') ? parseInt(params.get('w')!, 10) : 0;
  // format = format === 'jpg' ? 'jpeg' : format;

  console.log('extension :::: ', extension)
  console.log('width :::: ', width)
  console.log('height :::: ', height)
  console.log('format :::: ', format)
  console.log('quality :::: ', quality)

  // 크기 조절이 없는 경우 원본 반환
  if (!(width || height)) {
    return callback(null, response);
  }

  // gif는 리사이징 시 깨질 수 있음
  // 포맷 변환이 없는 gif는 원본 반환
  if (extension === "gif" && !params.get("f")) {
    return callback(null, response);
  }

  if (!SUPPORTIMAGETYPES.includes(extension)) {
    responseHandler(
      403,
      "Forbidden",
      "Unsupported image type",
      [{ key: "Content-Type", value: "text/plain" }]
    );
    return callback(null, response);
  }

  const s3Object = await (async () => {
    try {
      return await s3
        .getObject({
          Bucket: BUCKET,
          Key: objectKey,
        })
        .promise();
    } catch (error) {
      responseHandler(
        404,
        "Not Found",
        "The image does not exist.",
        [{ key: "Content-Type", value: "text/plain" }]
      );
      callback(null, response);
      return null; 
    }
  })();

  if(!s3Object) return

  const resizedImage = await (async () => {
    try {
      return await Sharp(s3Object.Body)
        .resize(width, height) 
        .toFormat(format, { quality })
        .toBuffer();
    } catch (error) {
      responseHandler(
        500,
        "Internal Server Error",
        "Fail to resize image.",
        [{ key: "Content-Type", value: "text/plain" }]
      );
      callback(null, response);
      return null; 
    }
  })();

  if (!resizedImage) return;

  // 리사이징한 이미지 용량이 1MB 이상일 경우 원본 반환
  // https://velog.io/@wwlee94/cloudfront-lambda-edge-image-resizing#origin-response-%ED%81%AC%EA%B8%B0-%EC%A0%9C%ED%95%9C-%EC%9D%B4%EC%8A%88
  if (Buffer.byteLength(resizedImage, "base64") >= 1048576) {
    return callback(null, response);
  }

  responseHandler(
    200,
    "OK",
    resizedImage.toString("base64"),
    [{ key: "Content-Type", value: `image/${format}` }],
    "base64"
  );
  return callback(null, response);

  function responseHandler(
    status: number,
    statusDescription: string,
    body: string,
    contentHeader: Array<{ key: string; value: string }>,
    bodyEncoding?: string
  ) {
    const extendedResponse = response as CloudFrontResponse & {
      body: string;
      bodyEncoding?: string;
    };
  
    extendedResponse.status = status.toString();
    extendedResponse.statusDescription = statusDescription;
    extendedResponse.body = body;
    extendedResponse.headers["content-type"] = contentHeader;
    if (bodyEncoding) {
      extendedResponse.bodyEncoding = bodyEncoding;
    }
  }
};