'use strict';

const AWS = require('aws-sdk');
AWS.config.region = 'us-east-1';
const s3 = new AWS.S3();
const kinesis = new AWS.Kinesis({ region: 'us-east-1' });
const avro = require('avsc');
const schema = require('../avro-schema');
const avroType = avro.parse(schema);
const type = avro.parse(schema);

const config = {
  shards: 1,
  stream: 'IndexDocumentQueue',
  waitBetweenDescribeCallsInSeconds: 5
}

function _createStreamIfNotCreated(callback) {
  var params = {
    ShardCount : config.shards,
    StreamName : config.stream
  };

  kinesis.createStream(params, function(err, data) {
    if (err) {
      if (err.code !== 'ResourceInUseException') {
        callback(err);
        return;
      }
      else {
        console.log('%s stream is already created. Re-using it.', config.stream);
      }
    }
    else {
      console.log("%s stream doesn't exist. Created a new stream with that name ..", config.stream);
    }

    // Poll to make sure stream is in ACTIVE state before start pushing data.
    _waitForStreamToBecomeActive(callback);
  });
}

function _waitForStreamToBecomeActive(callback) {
  kinesis.describeStream({StreamName : config.stream}, function(err, data) {
    if (!err) {
      console.log('Current status of the stream is %s.', data.StreamDescription.StreamStatus);
      if (data.StreamDescription.StreamStatus === 'ACTIVE') {
        callback(null);
      }
      else {
        setTimeout(function() {
          _waitForStreamToBecomeActive(callback);
        }, 1000 * config.waitBetweenDescribeCallsInSeconds);
      }
    }
  });
}

function _writeToKinesis(object, resolve, reject) {
  var timestamp = new Date().toISOString();

  var promises = [];

  (object.statements).forEach((statement) => {
    // console.log(statement.subject_id);
    var sensor = 'sensor-' + Math.floor(Math.random() * 100000);
    var recordParams = {
      Data : type.toBuffer({ uri: statement.subject_id, type: 'record' }),
      PartitionKey : sensor,
      StreamName : config.stream
    };

    promises.push(
      new Promise((res, rej) => {
        res();
        // kinesis.putRecord(recordParams, function(err, data) {
        //   if (err) {
        //     console.error(err);
        //     rej();
        //   }
        //   else {
        //     console.log('Successfully sent data to Kinesis.');
        //     res();
        //   }
        // });
      })
    )
  });

  Promise.all(promises).then(()=> {
    console.log('all resolved!');
    resolve();
  }).catch(reject);
}

class s3upload {
  upload(object) {
    // const id = new Date().getTime();
    // const data = Object.assign({}, object, {id});
    //
    // const params = {
    //   Bucket: 'testkinesis-lambda',
    //   Key: `${id}.json`,
    //   Body: JSON.stringify(data),
    //   ContentType: 'application/json'
    // };
    // console.log('attempting to upload');
    // return s3.putObject(params).promise();

    return new Promise((resolve, reject) => {
      _createStreamIfNotCreated(function(err) {
        if (err) {
          console.error('Error creating stream: %s', err);
          return;
        }
        _writeToKinesis(object, resolve, reject);
      });
    });
  }
}

module.exports = s3upload;
