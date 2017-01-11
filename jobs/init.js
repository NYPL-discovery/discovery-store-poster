'use strict'

const log = require('loglevel')
const prompt = require('prompt')

const argv = require('optimist')
  .describe('loglevel', 'Specify log level (default error)')
  .describe('recreate', 'Rebuild db even if it exists')
  .describe('create', 'Create db')
  .describe('stats', 'Get stats')
  .argv
log.setLevel(argv.loglevel || 'info')

const db = require('../lib/db')

var create = (recreate) => {
  db.createDb(recreate).then(() => {
    log.info('Created db')
    process.exit()
  })
}

var stats = () => {
  db.getStats().then((stats) => {
    log.info('Stats: ')
    log.info('Distinct subjects: ')
    stats.forEach((stat) => {
      log.info(stat.type + ': ' + stat.count)
    })
  })
    .catch((e) => console.error('oh no: ' + e.message, e.stack))
}

if (argv.create || argv.recreate) {
  prompt.start()

  console.log('Create/recreate db? confirm with y/n')
  prompt.get(['confirm'], (err, res) => {
    if (err) throw err

    if (res.confirm.toLowerCase() === 'y') create(argv.recreate)
    else process.exit()
  })
} else if (argv.stats) {
  stats()
}
