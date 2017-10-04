'use strict'

const log = require('loglevel')

const kmsHelper = require('../lib/kms-helper')
const db = require('../lib/db')
const BibsUpdater = require('../lib/bibs-updater')

var argv = require('optimist')
  .usage('Usage: $0 [--offset=num] [--limit=num]')
  .describe('profile', 'AWS profile (required)')
  .describe('envfile', 'Node-lambda .env file containing deployed ENV vars (required)')
  .describe('offset', 'Start at index')
  .describe('skip', 'Skip this many (useful if starting offset unknown)')
  .describe('seek', 'skip everything except this id')
  .describe('limit', 'Limit to this number of records')
  .describe('until', 'Stop after processing this offset')
  .describe('uri', 'Process specific bib by prefixed uri (from api)')
  .describe('loglevel', 'Specify log level (default info)')
  .describe('threads', 'Specify number of threads to run it under')
  .describe('disablescreen', 'If running multi-threaded, disables default screen takeover')
  .argv

var opts = {
  debug: argv.debug,
  skip: parseInt(argv.skip) || 0,
  offset: parseInt(argv.offset) || 0,
  limit: parseInt(argv.limit) || 0,
  seek: argv.seek || null
}

// If --until given, dynamically set limit:
if (argv.until) argv.limit = argv.until - (argv.offset || 0) + 1

// Load up AWS creds:
require('../lib/local-env-helper')

log.setLevel(argv.loglevel || process.env.LOGLEVEL || 'info')

kmsHelper.decryptDbCreds().then((decryptedDbConnectionString) => {
  db.setConnectionString(decryptedDbConnectionString)

  if (argv.uri) {
    ; (new BibsUpdater()).uriFromApi(argv.uri)
  } else if (argv.threads) {
    BibsUpdater.threaded(argv)
  } else {
    ; (new BibsUpdater()).update(opts)
  }
})
