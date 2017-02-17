'use strict';

const AWS = require('aws-sdk');
AWS.config.region = 'us-east-1';
const s3 = new AWS.S3();

class s3upload {
  upload(object) {
    const id = new Date().getTime();
    const data = Object.assign({}, object, {id});

    const params = {
      Bucket: 'testkinesis-lambda',
      Key: `${id}.json`,
      Body: JSON.stringify(data),
      ContentType: 'application/json'
    };

    s3.putObject(params, function(err, data) {
      if (err) console.log(err, err.stack); // an error occurred
      else     console.log(data);           // successful response
    });
  }
}

module.exports = s3upload;
