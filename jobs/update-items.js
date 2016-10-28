'use strict'

const log = require('loglevel')

const ItemsUpdater = require('../lib/items-updater')

var argv = require('optimist')
  .usage('Usage: $0 [--offset=num] [--limit=num]')
  .describe('offset', 'Start at index')
  .describe('limit', 'Limit to this number of records')
  .describe('debug', 'Enable debug mode')
  .describe('loglevel', 'Specify log level (default error)')
  .argv

var opts = {
  debug: argv.debug
}

log.setLevel(argv.loglevel || 'error')

; (new ItemsUpdater()).update(argv.offset, argv.limit, opts)
