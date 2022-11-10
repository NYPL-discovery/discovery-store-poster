/**
 * This script may be used in one of two ways to directly process bib(s).
 *
 * 1. Process a single bib:
 *
 *   `node scripts/print-statements-for-resource --uri [bnum/inum] --loglevel (info|debug|error) --profile [aws profile] --envfile [local env file with db & api creds]`
 *
 * Other options available for bulk processing:
 */

const log = require('loglevel')

const BibSierraRecord = require('../lib/models/bib-sierra-record')
const BibsUpdater = require('../lib/bibs-updater')
const ItemSierraRecord = require('../lib/models/item-sierra-record')
const ItemsUpdater = require('../lib/items-updater')
const HoldingsUpdater = require('../lib/holdings-updater')
const HoldingSierraRecord = require('../lib/models/holding-sierra-record')
const NyplSourceMapper = require('discovery-store-models/lib/nypl-source-mapper')
const utils = require('../lib/utils')

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

if (argv.uri) {
  const { nyplSource, id, type } = NyplSourceMapper.instance().splitIdentifier(argv.uri)

  const statements = {
    bib: () => {
      const bibsUpdater = new BibsUpdater()
      return bibsUpdater.bibByApi(nyplSource, id)
        .then(BibSierraRecord.from)
        .then(bibsUpdater.extractStatements.bind(bibsUpdater))
    },
    item: () => {
      const itemsUpdater = new ItemsUpdater()
      return itemsUpdater.itemByApi(nyplSource, id)
        .then(ItemSierraRecord.from)
        .then(itemsUpdater.extractStatements.bind(itemsUpdater))
    },
    holding: () => {
      const holdingsUpdater = new HoldingsUpdater()
      return holdingsUpdater.holdingByApi(id)
        .then(HoldingSierraRecord.from)
        .then(holdingsUpdater.extractStatements.bind(holdingsUpdater))
    }
  }[type]

  statements()
    .then((statements) => {
      const subjects = utils.groupBy(statements, 'subject_id')
      subjects.forEach((group) => {
        const subjectId = group[0].subject_id
        console.log('======================')
        console.log(`${subjectId}:`)
        console.log(group)
      })
    })
}
