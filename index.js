'use strict'

// Set log level (default 'info')
const log = require('loglevel')
log.setLevel(process.env['LOGLEVEL'] || 'info')
log.info('Loading Lambda function')

const BibsUpdater = require('./lib/bibs-updater')
const ItemsUpdater = require('./lib/items-updater')
const avro = require('avsc')
const config = require('config')
const request = require('request')
const db = require('./lib/db')
const kmsHelper = require('./lib/kms-helper')

let decrypted
let CACHE = {}

// Will need to figure out how to set these values through the lambda.
var opts = {
  skip: 0,
  offset: 0,
  limit: 0,
  seek: null
}

function getSchema (schemaType) {
  // schema in cache; just return it as a instant promise
  if (CACHE[schemaType]) {
    log.debug(`Already have ${schemaType} schema`)
    return new Promise((resolve, reject) => {
      resolve(CACHE[schemaType])
    })
  }

  return new Promise((resolve, reject) => {
    var options = {
      uri: process.env['NYPL_API_SCHEMA_URL'] + schemaType,
      json: true
    }

    log.debug(`Loading ${schemaType} schema...`)
    request(options, (error, resp, body) => {
      if (error) {
        reject(error)
      }
      if (body.data && body.data.schema) {
        log.debug(`Sucessfully loaded ${schemaType} schema`)
        var schema = JSON.parse(body.data.schema)
        CACHE[schemaType] = avro.parse(schema)
        resolve(CACHE[schemaType])
      } else {
        reject()
      }
    })
  })
}

function processEvent (event, context, callback) {
  const bib = 'Bib'
  const item = 'Item'
  let bibOrItem = event.Records[0].eventSourceARN === config.kinesisReadStreams.bib ? bib : item

  var promises = event.Records.map((record) => {
    return getSchema(bibOrItem)
      .then((schemaType) => {
        const kinesisData = new Buffer(record.kinesis.data, 'base64')
        log.debug('using schema: ', bibOrItem, schemaType)
        let decodedData = schemaType.fromBuffer(kinesisData)
        log.debug('Got decoded: ', decodedData)
        var updater = bibOrItem === 'Bib' ? (new BibsUpdater()) : (new ItemsUpdater())
        return updater
          .update(opts, [decodedData])
          .catch((e) => {
            log.error(e)
            return Promise.reject(`Failed to process bib/item record ${decodedData.id}.`)
          })
      })
  })

  // Wait until all bibs or items have been processed and pushed to Kinesis:
  Promise.all(promises)
    .then(() => {
      log.debug('All promises done')
      callback(null, 'Done!')
    })
    .catch((error) => {
      log.error('processEvent: error: ' + error)
      log.trace(error)
      callback(error)
    })
}

exports.handler = (event, context, callback) => {
  // Use of libpq seems to cause something to hang out in the event loop, so
  // tell the lambda engine to just kill the process when callback called:
  // TODO see if we can remove this now that we're no longer using libpq
  context.callbackWaitsForEmptyEventLoop = false

  if (decrypted) {
    db.setConn(decrypted)
    processEvent(event, context, callback)
  } else {
    // Decrypt code should run once and variables stored outside of the function
    // handler so that these are decrypted once per container
    kmsHelper.decryptDbCreds().then((val) => {
      decrypted = val
      db.setConn(decrypted)
      processEvent(event, context, callback)
    }).catch((err) => {
      log.error('Decrypt error:', err)
      return callback(err)
    })
  }
}
