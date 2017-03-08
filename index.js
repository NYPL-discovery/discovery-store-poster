'use strict';

// console.log(process.env);
console.log('Loading Lambda function');
const AWS = require('aws-sdk');
const encrypted = process.env['DISCOVERY_STORE_CONNECTION_URI'];
const BibsUpdater = require('./lib/bibs-updater');
const db = require('./lib/db');
const avro = require('avsc');
const schema = require('./avro-schema');
const config = require('config')

const avroType = avro.parse(schema);
let decrypted;

// Will need to figure out how to set these values through the lambda.
var opts = {
  skip: 0,
  offset: 0,
  limit: 0,
  seek: null,
};

function processEvent(event, context, callback) {
  // console.log('Received event:', JSON.stringify(event, null, 2));
  event.Records.forEach((record) => {
    // Kinesis data is base64 encoded so decode here:
    const payload = new Buffer(record.kinesis.data, 'base64').toString('utf-8');
    // Decoded from Avro schema
    // const data = avroType.fromBuffer(payload);

    if (record.eventSourceARN === config.kinesisReadStreams.bib) {
      (new BibsUpdater())
        // .update(opts, data)
        .update(opts, payload)
        .then(() => {
          return callback(null, `Successfully processed 1 bib record.`);
        })
        .catch(e => {
          console.log(e);
          return callback(null, `Failed to process bib record.`);
        });
    } else if (record.eventSourceARN === config.kinesisReadStreams.item) {
      // Process an item
    }
  });
}

exports.handler = (event, context, callback) => {
  if (decrypted) {
    db.setConn(decrypted);
    processEvent(event, context, callback);
  } else {
    // Decrypt code should run once and variables stored outside of the function
    // handler so that these are decrypted once per container
    const kms = new AWS.KMS();
    kms.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') }, (err, data) => {
      if (err) {
        console.log('Decrypt error:', err);
        return callback(err);
      }
      decrypted = data.Plaintext.toString('ascii');
      db.setConn(decrypted);
      processEvent(event, context, callback);
    });
  }
};
