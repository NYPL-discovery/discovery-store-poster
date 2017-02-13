'use strict'

const log = require('loglevel')

const ItemsUpdater = require('../lib/items-updater')

var argv = require('optimist')
  .usage('Usage: $0 [--offset=num] [--limit=num]')
  .describe('offset', 'Start at index')
  .describe('limit', 'Limit to this number of records')
  .describe('uri_cache', 'Process specific item by prefixed uri (from cache)')
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

log.setLevel(argv.loglevel || 'error')

if (argv.uri_cache) {
  ; (new ItemsUpdater()).item(argv.uri_cache)
} else if (argv.threads) {
  console.log('threaded')
  ItemsUpdater.threaded(argv)
} else {
  ; (new ItemsUpdater()).update(opts)
}
