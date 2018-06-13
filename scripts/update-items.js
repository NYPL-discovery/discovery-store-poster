/**
 * This script may be used in one of two ways to directly process items(s).
 *
 * 1. Process a single item:
 *
 *   `node scripts/update-item --inum [inum] --loglevel (info|debug|error) --profile [aws profile] --envfile [local env file with db & api creds]`
 *
 * 2. Process item in bulk using a ndjson file:
 *
 *   `node scripts/update-items --itemsSource [path to ndjson] --loglevel (info|debug|error) --profile [aws profile] --envfile [local env file with db & api creds]`
 *
 * Other options available for bulk processing:
 *  `--offset`: Skip over this many item in the ndjson
 *  `--offset`: Skip this many items in the ndjson
 *  `--seek`: Skip over everything in ndjson until this inum found
 *  `--limit`: Stop processing after this many have been processed
 *  `--until`: Stop processing when this offset is reached
 *  `--threads`: Use this many parallel threads to process the workloadStop processing when this offset is reached
 *  `--disablescreen`: Override default use of fancy `screen` visualization (which may interfere with capturing output)
 */

const log = require('loglevel')

const kmsHelper = require('../lib/kms-helper')
const db = require('../lib/db')
const ItemsUpdater = require('../lib/items-updater')

var argv = require('optimist')
  .usage('Usage: $0 [--offset=num] [--limit=num]')
  .describe('profile', 'AWS profile (required)')
  .describe('envfile', 'Node-lambda *.env file containing deployed ENV vars (required)')
  .describe('offset', 'Start at index')
  .describe('limit', 'Limit to this number of records')
  .describe('inum', 'Process specific item by prefixed uri (from api)')
  .alias('inum', 'uri')
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

// Load up AWS creds:
require('../lib/local-env-helper')

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
