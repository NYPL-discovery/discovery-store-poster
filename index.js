'use strict';

console.log('Loading Lambda function');
const AWS = require('aws-sdk');
const encrypted = process.env['DISCOVERY_STORE_CONNECTION_URI'];
const BibsUpdater = require('./lib/bibs-updater');
const ItemsUpdater = require('./lib/items-updater');
const db = require('./lib/db');
const avro = require('avsc');
const schema = require('./avro-schema');
const config = require('config')
const OAuth = require('oauth');
const request = require('request');

let decrypted;
let CACHE = {};

// Will need to figure out how to set these values through the lambda.
var opts = {
  skip: 0,
  offset: 0,
  limit: 0,
  seek: null,
};

function getSchema(schemaType) {
  // schema in cache; just return it as a instant promise
  if (CACHE[schemaType]) {
    console.log(`Already have ${schemaType} schema`);
    return new Promise((resolve, reject) => {
      resolve(CACHE[schemaType]);
    });
  }

  return new Promise((resolve, reject) => {
    var options = {
      uri: process.env['NYPL_API_SCHEMA_URL'] + schemaType,
      json: true
    };

    console.log(`Loading ${schemaType} schema...`);
    request(options, (error, resp, body) => {
      if (error) {
        reject(error);
      }
      if (body.data && body.data.schema) {
        console.log(`Sucessfully loaded ${schemaType} schema`);
        var schema = JSON.parse(body.data.schema);
        CACHE[schemaType] = avro.parse(schema);
        resolve(CACHE[schemaType]);
      }
      else {
        reject();
      }
    });
  });
}


function processEvent(event, context, callback) {
  const promises = [];
  const bib = "Bib";
  const item = "Item";
  let bibOrItem = event.Records[0].eventSourceARN === config.kinesisReadStreams.bib ? bib : item;

  // console.log('Received event:', JSON.stringify(event, null, 2));
  event.Records.forEach((record, i) => {
    // Kinesis data is base64 encoded so decode here:
    const kinesisData = new Buffer(record.kinesis.data, 'base64');//.toString('utf-8');

    if (bibOrItem === bib) {
      promises.push(new Promise((resolve, reject) => {
        getSchema(bib)
          .then(() => {
            let decodedData = (CACHE[bib]).fromBuffer(kinesisData);
            return (new BibsUpdater())
              .update(opts, decodedData)
              // .update(opts, kinesisData)
              .then(() => resolve())
              .catch(e => {
                console.log(e);
                return reject(`Failed to process bib record ${i + 1}.`);
              });
          })
      }));
    } else if (bibOrItem === item) {
      promises.push(new Promise((resolve, reject) => {
        getSchema(item)
          .then(() => {
            let decodedData = CACHE[item].fromBuffer(kinesisData);
            return (new ItemsUpdater())
              .update(opts, decodedData)
              // .update(opts, kinesisData)
              .then(() => resolve())
              .catch(e => {
                console.log(e);
                return reject(`Failed to process item record ${i + 1}.`);
              });
          });
      }));
    }
  });

  // Wait until all bibs or items have been processed and pushed to Kinesis:
  Promise.all(promises)
    .then(() => {
      console.log('all promises done');
      callback(null, `Successfully processed ${event.Records.length} ${bibOrItem} records.`);
    })
    .catch((error) => {
      console.log(error);
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
