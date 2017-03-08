'use strict';

const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const kinesis = new AWS.Kinesis({ region: 'us-east-1' });
const avro = require('avsc');
const schema = require('../avro-schema');
const avroType = avro.parse(schema);
const type = avro.parse(schema);
const config = require('config');

const kinesisWriteStream = config.kinesisWriteStream;

function _createStreamIfNotCreated(callback) {
  var params = {
    ShardCount : kinesisWriteStream.shards,
    StreamName : kinesisWriteStream.stream
  };

  kinesis.createStream(params, function(err, data) {
    if (err) {
      if (err.code !== 'ResourceInUseException') {
        callback(err);
        return;
      }
      else {
        console.log('%s stream is already created. Re-using it.', kinesisWriteStream.stream);
      }
    }
    else {
      console.log("%s stream doesn't exist. Created a new stream with that name ..", kinesisWriteStream.stream);
    }

    // Poll to make sure stream is in ACTIVE state before start pushing data.
    _waitForStreamToBecomeActive(callback);
  });
}

function _waitForStreamToBecomeActive(callback) {
  kinesis.describeStream({StreamName : kinesisWriteStream.stream}, function(err, data) {
    if (!err) {
      console.log('Current status of the stream is %s.', data.StreamDescription.StreamStatus);
      if (data.StreamDescription.StreamStatus === 'ACTIVE') {
        callback(null);
      }
      else {
        setTimeout(function() {
          _waitForStreamToBecomeActive(callback);
        }, 1000 * kinesisWriteStream.waitBetweenDescribeCallsInSeconds);
      }
    }
  });
}

function _writeToKinesis(object, resolve, reject) {
  var promises = [];

  (object.statements).forEach((statement) => {
    // console.log(statement.subject_id);
    var sensor = 'sensor-' + Math.floor(Math.random() * 100000);
    var recordParams = {
      Data : type.toBuffer({ uri: statement.subject_id, type: 'record' }),
      PartitionKey : sensor,
      StreamName : kinesisWriteStream.stream
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
        //     // console.log('Successfully sent data to Kinesis.');
        //     res();
        //   }
        // });
      })
    )
  });

  Promise.all(promises).then(()=> {
    console.log('all data pushed to kinesis');
    resolve();
  }).catch(reject);
}

class KinesisWriter {
  write(object) {
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

module.exports = KinesisWriter;
