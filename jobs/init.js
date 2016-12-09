'use strict'

const log = require('loglevel')

const db = require('../lib/db')
db.createDb().then(() => log.info('Created db'))
