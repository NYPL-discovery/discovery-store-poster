/**
 * This script may be used in one of two ways to directly process bib(s).
 *
 * 1. Process a single bib:
 *
 *   `node scripts/update-bibs --bnum [bnum] --loglevel (info|debug|error) --profile [aws profile] --envfile [local env file with db & api creds]`
 *
 * 2. Process bibs in bulk using a ndjson file:
 *
 *   `node scripts/update-bibs --bibsSource [path to ndjson] --loglevel (info|debug|error) --profile [aws profile] --envfile [local env file with db & api creds]`
 *
 * Other options available for bulk processing:
 *  `--offset`: Skip over this many bibs in the ndjson
 *  `--offset`: Skip this many bibs in the ndjson
 *  `--seek`: Skip over everything in ndjson until this bnum found
 *  `--limit`: Stop processing after this many have been processed
 *  `--until`: Stop processing when this offset is reached
 *  `--threads`: Use this many parallel threads to process the workloadStop processing when this offset is reached
 *  `--disablescreen`: Override default use of fancy `screen` visualization (which may interfere with capturing output)
 */

const log = require('loglevel')

const kmsHelper = require('../lib/kms-helper')
const db = require('../lib/db')
const BibsUpdater = require('../lib/bibs-updater')

var argv = require('optimist')
  .usage('Usage: $0 [--offset=num] [--limit=num]')
  .describe('profile', 'AWS profile (required)')
  .describe('envfile', 'Node-lambda .env file containing deployed ENV vars (required)')
  .describe('offset', 'Start at index')
  .describe('seek', 'skip everything except this id')
  .describe('limit', 'Limit to this number of records')
  .describe('until', 'Stop after processing this offset')
  .describe('bnum', 'Process specific bib by prefixed bnum (queries api)')
  .alias('bnum', 'uri')
  .describe('bibsSource', 'Path to local ndjson file')
  .describe('loglevel', 'Specify log level (default info)')
  .describe('threads', 'Specify number of threads to run it under')
  .describe('disablescreen', 'If running multi-threaded, disables default screen takeover')
  .argv

var opts = {
  debug: argv.debug,
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

  if (argv.bnum) {
    ; (new BibsUpdater()).uriFromApi(argv.bnum)
  } else if (argv.threads) {
    BibsUpdater.threaded(argv)
  } else {
    ; (new BibsUpdater()).update(opts)
  }
})
