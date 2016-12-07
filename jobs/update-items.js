'use strict'

const log = require('loglevel')

const ItemsUpdater = require('../lib/items-updater')

var argv = require('optimist')
  .usage('Usage: $0 [--offset=num] [--limit=num]')
  .describe('offset', 'Start at index')
  .describe('limit', 'Limit to this number of records')
  .describe('uri', 'Process specific item (from cache)')
  .describe('debug', 'Enable debug mode')
  .describe('loglevel', 'Specify log level (default error)')
  .describe('threads', 'Specify number of threads to run it under')
  .describe('disablescreen', 'If running multi-threaded, disables default screen takeover')
  .argv

var opts = {
  debug: argv.debug
}

log.setLevel(argv.loglevel || 'error')

if (argv.uri) {
  ; (new ItemsUpdater()).item(argv.uri)
} else if (argv.threads) {
  ItemsUpdater.threaded(argv)
} else {
  ; (new ItemsUpdater()).update(argv.offset, argv.limit, opts)
}
