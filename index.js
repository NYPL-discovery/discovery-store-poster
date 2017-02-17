'use strict';

console.log('Loading Lambda function');
const BibsUpdater = require('./lib/bibs-updater');

// Will need to figure out how to set these values through the lambda.
var opts = {
  skip: 0,
  offset: 0,
  limit: 0,
  seek: null,
};

exports.handler = (event, context, callback) => {
    // console.log('Received event:', JSON.stringify(event, null, 2));
    event.Records.forEach((record) => {
      // Kinesis data is base64 encoded so decode here:
      const payload = new Buffer(record.kinesis.data, 'base64').toString('utf-8');
      // console.log('Decoded payload:', payload);

      (new BibsUpdater()).update(opts, payload);
    });
    // callback(null, `Successfully processed ${event.Records.length} records.`);
};
