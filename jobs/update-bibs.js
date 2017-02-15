'use strict'

const log = require('loglevel')

const BibsUpdater = require('../lib/bibs-updater')

var argv = require('optimist')
  .usage('Usage: $0 [--offset=num] [--limit=num]')
  .describe('offset', 'Start at index')
  .describe('skip', 'Skip this many (useful if starting offset unknown)')
  .describe('seek', 'skip everything except this id')
  .describe('limit', 'Limit to this number of records')
  .describe('until', 'Stop after processing this offset')
  .describe('uri_cache', 'Process specific bib (from cache)')
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

log.setLevel(argv.loglevel || 'info')

// If --until given, dynamically set limit:
if (argv.until) argv.limit = argv.until - (argv.offset || 0) + 1

if (argv.uri_cache) {
  ; (new BibsUpdater()).uriFromCache(argv.uri_cache)
} else if (argv.threads) {
  BibsUpdater.threaded(argv)
} else {
  ; (new BibsUpdater()).update(opts)
}
