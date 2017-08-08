'use strict'

const prompt = require('prompt')
const log = require('../lib/logger')

const argv = require('optimist')
  .describe('loglevel', 'Specify log level (default error)')
  .describe('recreate', 'Rebuild db even if it exists')
  .describe('create', 'Create db')
  .describe('stats', 'Get stats')
  .argv

const db = require('../lib/db')

var create = (recreate) => {
  db.createDb(recreate)
    .then(db.initializeData)
    .then(() => {
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

if (argv.create) create(false)
else if (argv.recreate) {
  prompt.start()

  console.log('Really recreate db? confirm with y/n')
  prompt.get(['confirm'], (err, res) => {
    if (err) throw err

    if (res.confirm.toLowerCase() === 'y') create(true)
    else process.exit()
  })
} else if (argv.stats) {
  stats()
}
