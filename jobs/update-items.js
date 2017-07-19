'use strict'

const log = require('loglevel')

const kmsHelper = require('../lib/kms-helper')
const db = require('../lib/db')
const ItemsUpdater = require('../lib/items-updater')

var argv = require('optimist')
  .usage('Usage: $0 [--offset=num] [--limit=num]')
  .describe('offset', 'Start at index')
  .describe('limit', 'Limit to this number of records')
  .describe('uri_cache', 'Process specific item by prefixed uri (from cache)')
  .describe('uri', 'Process specific item by prefixed uri (from api)')
  .describe('uri_seek', 'Process a specific item by non-prefixed uri (by skipping over everything else in the stream)')
  .describe('loglevel', 'Specify log level (default error)')
  .describe('threads', 'Specify number of threads to run it under')
  .describe('disablescreen', 'If running multi-threaded, disables default screen takeover')
  .argv

var opts = {
  debug: argv.debug,
  skip: parseInt(argv.skip) || 0,
  offset: parseInt(argv.offset) || 0,
  limit: parseInt(argv.limit) || 0,
  seek: argv.uri_seek || null
}

require('dotenv').config({ path: './deploy.env' })
require('dotenv').config({ path: './.env' })

log.setLevel(argv.loglevel || process.env.LOGLEVEL || 'info')

kmsHelper.decryptDbCreds().then((decryptedDbConnectionString) => {
  db.setConnectionString(decryptedDbConnectionString)

  if (argv.uri) {
    ; (new ItemsUpdater()).uriFromApi(argv.uri)
  } else if (argv.threads) {
    ItemsUpdater.threaded(argv)
  } else {
    ; (new ItemsUpdater()).update(opts)
  }
})
