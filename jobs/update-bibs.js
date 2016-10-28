'use strict'

const log = require('loglevel')

const BibsUpdater = require('../lib/bibs-updater')

var argv = require('optimist')
  .usage('Usage: $0 [--offset=num] [--limit=num]')
  .describe('offset', 'Start at index')
  .describe('limit', 'Limit to this number of records')
  .describe('debug', 'Enable debug mode')
  .describe('uri', 'Process specific bib (from api)')
  .describe('apiall', 'Process all bibs from api')
  .describe('backfill', 'Back-fill bibs based on existing items (from api)')
  .describe('loglevel', 'Specify log level (default error)')
  .argv

var opts = {
  debug: argv.debug
}

log.setLevel(argv.loglevel || 'error')

if (argv.uri) {
  ; (new BibsUpdater()).bib(argv.uri)
} else if (argv.apiall) {
  ; (new BibsUpdater()).bibs()
} else if (argv.backfill) {
  ; (new BibsUpdater()).backfill()
} else {
  ; (new BibsUpdater()).update(argv.offset, argv.limit, opts)
}
