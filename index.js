'use strict';

console.log('Loading Lambda function');
const BibsUpdater = require('./lib/bibs-updater');

const AWS = require('aws-sdk');

const encrypted = process.env['DISCOVERY_STORE_CONNECTION_URI'];
let decrypted;
console.log(encrypted)
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
    // console.log('Decoded payload:', payload);

    (new BibsUpdater()).update(opts, payload);
  });
  // callback(null, `Successfully processed ${event.Records.length} records.`);
}

exports.handler = (event, context, callback) => {
  if (decrypted) {
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
      console.log(decrypted);
      processEvent(event, context, callback);
    });
  }
};
