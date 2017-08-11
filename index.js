'use strict'

var log = null

const BibsUpdater = require('./lib/bibs-updater')
const ItemsUpdater = require('./lib/items-updater')
const avro = require('avsc')
const config = require('config')
const db = require('./lib/db')
const kmsHelper = require('./lib/kms-helper')
const NYPLDataApiClient = require('@nypl/nypl-data-api-client')

var dataApi = null

let decryptedDbConnectionString
let CACHE = {}

// Will need to figure out how to set these values through the lambda.
var opts = {
  skip: 0,
  offset: 0,
  limit: 0,
  seek: null
}

function getSchema (schemaName) {
  // schema in cache; just return it as a instant promise
  if (CACHE[schemaName]) {
    log.debug(`Already have ${schemaName} schema`)
    return Promise.resolve(CACHE[schemaName])
  }

  // Initialize client if not previously initialized
  if (!dataApi) dataApi = new NYPLDataApiClient({ base_url: process.env['NYPL_API_BASE_URL'] })

  // Fetch schema and parse it as an AVSC decoder
  return dataApi.get(`current-schemas/${schemaName}`, { authenticate: false }).then((schema) => {
    CACHE[schemaName] = avro.parse(schema.schemaObject)
    return CACHE[schemaName]
  })
}

function processEvent (event, context, callback) {
  let bibOrItem = event.Records[0].eventSourceARN === config.kinesisReadStreams.bib ? 'Bib' : 'Item'

  log.debug('Using schema: ', bibOrItem)
  // db.connect().then(() => getSchema(bibOrItem)).then((schemaType) => {
  getSchema(bibOrItem).then((schemaType) => {
    // Get array of decoded records:
    var decoded = event.Records.map((record) => {
      const kinesisData = new Buffer(record.kinesis.data, 'base64')
      return schemaType.fromBuffer(kinesisData)
    })
    log.debug('Processing ' + bibOrItem + ' records: ', decoded)

    // Invoke appropriate updater:
    var updater = bibOrItem === 'Bib' ? (new BibsUpdater()) : (new ItemsUpdater())
    updater
      .update(opts, decoded)
      .then(() => {
        log.info('Wrote ' + decoded.length + ' successfully')
        callback(null, 'Done!')
      })
      .catch((error) => {
        log.error('processEvent: error: ' + error)
        log.trace(error)
        callback(error)
      })
  })
}

exports.handler = (event, context, callback) => {
  // Use of libpq seems to cause something to hang out in the event loop, so
  // tell the lambda engine to just kill the process when callback called:
  // TODO see if we can remove this now that we're no longer using libpq
  context.callbackWaitsForEmptyEventLoop = false

  // Instantiate the logger inside the handler so that it has access to
  // instance info when writing to console
  if (!log) {
    log = require('./lib/logger')
    log.info('Loading Lambda function')
  }

  if (decryptedDbConnectionString) {
    db.setConnectionString(decryptedDbConnectionString)
    processEvent(event, context, callback)
  } else {
    // Decrypt code should run once and variables stored outside of the function
    // handler so that these are decrypted once per container
    kmsHelper.decryptDbCreds().then((val) => {
      decryptedDbConnectionString = val
      db.setConnectionString(decryptedDbConnectionString)
      processEvent(event, context, callback)
    }).catch((err) => {
      log.error('Decrypt error:', err)
      return callback(err)
    })
  }
}
