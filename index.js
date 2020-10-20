'use strict'

var log = null

const BibsUpdater = require('./lib/bibs-updater')
const ItemsUpdater = require('./lib/items-updater')
const HoldingUpdater = require('./lib/holdings-updater')
const avro = require('avsc')
const db = require('./lib/db')
const kmsHelper = require('./lib/kms-helper')
const NYPLDataApiClient = require('@nypl/nypl-data-api-client')

var dataApi = null

let decryptedDbConnectionString
const CACHE = {}

// Will need to figure out how to set these values through the lambda.
var opts = {
  skip: 0,
  offset: 0,
  limit: 0,
  seek: null
}

const updaters = {
  Bib: BibsUpdater,
  Item: ItemsUpdater,
  Holding: HoldingUpdater
}

function getSchema (schemaName) {
  // schema in cache; just return it as a instant promise
  if (CACHE[schemaName]) {
    log.debug(`Already have ${schemaName} schema`)
    return Promise.resolve(CACHE[schemaName])
  }

  // Initialize client if not previously initialized
  if (!dataApi) dataApi = new NYPLDataApiClient({ base_url: process.env.NYPL_API_BASE_URL })

  // Fetch schema and parse it as an AVSC decoder
  return dataApi.get(`current-schemas/${schemaName}`, { authenticate: false }).then((schema) => {
    CACHE[schemaName] = avro.parse(schema.schemaObject)
    return CACHE[schemaName]
  })
}

function processEvent (event, resolve, reject) {
  let bibItemOrHolding = null

  // Determine whether event has Bibs or Items by checking end of eventSourceARN string:
  if (/\/Bib/.test(event.Records[0].eventSourceARN)) bibItemOrHolding = 'Bib'
  if (/\/Item/.test(event.Records[0].eventSourceARN)) bibItemOrHolding = 'Item'
  if (/\/Holding/.test(event.Records[0].eventSourceARN)) bibItemOrHolding = 'Holding'

  // Fail if the eventSourceARN didn't tell us what we're handling
  if (!bibItemOrHolding) throw new Error('Unrecognized eventSourceARN. Aborting. ' + event.Records[0].eventSourceARN)

  log.debug('Using schema: ', bibItemOrHolding)
  // db.connect().then(() => getSchema(bibOrItem)).then((schemaType) => {
  getSchema(bibItemOrHolding).then((schemaType) => {
    // Get array of decoded records:
    var decoded = event.Records.map((record) => {
      const kinesisData = new Buffer.From(record.kinesis.data, 'base64')
      return schemaType.fromBuffer(kinesisData)
    })
    log.debug('Processing ' + bibItemOrHolding + ' records: ', decoded)

    // Invoke appropriate updater:
    var updater = new updaters[bibItemOrHolding]()
    updater
      .update(opts, decoded)
      .then(() => {
        log.info('Wrote ' + decoded.length + ' successfully')
        resolve('Done!')
      })
      .catch((error) => {
        log.error('processEvent: error: ' + error)
        log.trace(error)
        reject(error)
      })
  }).catch((error) => {
    log.error(`processEvent: Error fetching schema (${bibItemOrHolding})`)
    log.trace(error)
    reject(error)
  })
}

exports.handler = async (event) => {
  if (!log) {
    // Set log level (default 'info')
    log = require('loglevel')
    log.setLevel(process.env.LOGLEVEL || 'info')
    log.info('Loading Lambda function')
  }

  const eventPromise = new Promise((resolve, reject) => {
    if (decryptedDbConnectionString) {
      db.setConnectionString(decryptedDbConnectionString)
      processEvent(event, resolve, reject)
    } else {
      // Decrypt code should run once and variables stored outside of the function
      // handler so that these are decrypted once per container
      kmsHelper.decryptDbCreds().then((decryptedDbConnectionString) => {
        db.setConnectionString(decryptedDbConnectionString)
        processEvent(event, resolve, reject)
      }).catch((err) => {
        log.error('Decrypt error:', err)
        reject(err)
      })
    }
  })

  return eventPromise
}
