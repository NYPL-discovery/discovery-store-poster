'use strict'

const AWS = require('aws-sdk')
const kinesis = new AWS.Kinesis({ region: 'us-east-1' })
const avro = require('avsc')
const schema = require('../avro-schema')
const type = avro.parse(schema)
const config = require('config')
const log = require('loglevel')

const kinesisWriteStream = config.kinesisWriteStream
function _createStreamIfNotCreated (callback) {
  var params = {
    ShardCount: kinesisWriteStream.shards,
    StreamName: kinesisWriteStream.stream
  }

  kinesis.createStream(params, function (err, data) {
    if (err) {
      if (err.code !== 'ResourceInUseException') {
        callback(err)
        return
      } else {
        log.debug('%s stream is already created. Re-using it.', kinesisWriteStream.stream)
      }
    } else {
      log.debug("%s stream doesn't exist. Created a new stream with that name ..", kinesisWriteStream.stream)
    }

    // Poll to make sure stream is in ACTIVE state before start pushing data.
    _waitForStreamToBecomeActive(callback)
  })
}

function _waitForStreamToBecomeActive (callback) {
  log.debug('_waitForStreamToBecomeActive')
  kinesis.describeStream({StreamName: kinesisWriteStream.stream}, function (err, data) {
    if (!err) {
      log.debug('Current status of the stream is %s.', data.StreamDescription.StreamStatus)
      if (data.StreamDescription.StreamStatus === 'ACTIVE') {
        callback(null)
      } else {
        setTimeout(function () {
          _waitForStreamToBecomeActive(callback)
        }, 1000 * kinesisWriteStream.waitBetweenDescribeCallsInSeconds)
      }
    }
  })
}

function _writeToKinesis (name, object, createStreamIfNotFound) {
  // Control whether or not to attempt creating stream if not found, default true
  createStreamIfNotFound = (typeof createStreamIfNotFound === 'undefined') ? true : createStreamIfNotFound

  return new Promise((resolve, reject) => {
    // Make sure it's an array:
    object = object.length ? object : [object]
    var recordParams = {
      Records: object.map((rec) => ({
        Data: type.toBuffer(rec),
        PartitionKey: 'sensor-' + Math.floor(Math.random() * 100000)
      })),
      StreamName: name // kinesisWriteStream.stream
    }

    log.debug('_writeToKinesis kinesis.putRecords ' + recordParams.Records.length)
    kinesis.putRecords(recordParams, function (err, data) {
      if (err) {
        log.error(err)
        // Is error due to stream being missing? create it:
        if (err.code === 'ResourceNotFoundException' && createStreamIfNotFound) {
          _createStreamIfNotCreated(function (err) {
            if (err) {
              log.error(err)
              reject(err)
            } else {
              // Now that it exists, let's try writing to the stream
              // (but set createStreamIfNotFound=false so we don't create an infinite loop if creation quietly failed)
              return _writeToKinesis(name, object, false)
            }
          })

        // Otherwise it's some other kind of error. Fail hard:
        } else reject('kinesis.putRecords error')
      } else {
        log.info(`Successfully sent ${data.Records.length} records to Kinesis.`)
        resolve(data.Records.length)
      }
    })
  }).catch((e) => {
    log.error('Error (KinesisWriter#_writeToKinesis): ', e.message)
  })
}

class KinesisWriter {
  // Takes an object with a `statements` property that contains Statements to be written to the stream
  write (name, object) {
    return _writeToKinesis(name, object)
  }
}

module.exports = KinesisWriter
