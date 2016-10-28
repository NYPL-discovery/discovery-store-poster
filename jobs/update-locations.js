'use strict'

const LocationsUpdater = require('../lib/locations-updater')

var argv = require('optimist')
  .usage('Usage: $0 [--offset=num] [--limit=num]')
  .describe('offset', 'Start at index')
  .describe('limit', 'Limit to this number of records')
  .argv

; (new LocationsUpdater()).update(argv.offset, argv.limit)
