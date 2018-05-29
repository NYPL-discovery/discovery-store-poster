/**
 * This script may be used in one of two ways to directly process bib(s).
 *
 * 1. Process a single bib:
 *
 *   `node scripts/print-statements-for-resource --bnum [bnum] --loglevel (info|debug|error) --profile [aws profile] --envfile [local env file with db & api creds]`
 *
 * Other options available for bulk processing:
 */

const log = require('loglevel')

const BibSierraRecord = require('../lib/models/bib-sierra-record')
const BibsUpdater = require('../lib/bibs-updater')

var argv = require('optimist')
  .usage('Usage: $0 [--offset=num] [--limit=num]')
  .describe('profile', 'AWS profile (required)')
  .describe('envfile', 'Node-lambda .env file containing deployed ENV vars (required)')
  .describe('bnum', 'Process specific bib by prefixed bnum (queries api)')
  .alias('bnum', 'uri')
  .describe('loglevel', 'Specify log level (default info)')
  .argv

// If --until given, dynamically set limit:
if (argv.until) argv.limit = argv.until - (argv.offset || 0) + 1

// Load up AWS creds:
require('../lib/local-env-helper')

log.setLevel(argv.loglevel || process.env.LOGLEVEL || 'info')

if (argv.bnum) {
  const prefix = argv.bnum.match(/^[a-z]+/)[0]
  const id = argv.bnum.replace(prefix, '')
  let nyplSource = 'sierra-nypl'
  if (prefix === 'pb') nyplSource = 'recap-pul'
  if (prefix === 'cb') nyplSource = 'recap-cul'

  const bibsUpdater = new BibsUpdater()

  bibsUpdater.bibByApi(nyplSource, id)
    .then(BibSierraRecord.from)
    .then(bibsUpdater.extractStatements.bind(bibsUpdater))
    .then((statements) => {
      console.log('Statements: ', statements)
    })
}
