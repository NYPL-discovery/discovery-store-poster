'use strict'

const Base = require('./base')
const db = require('../db')

class Holding extends Base {
}

Holding.byId = (id) => {
  return db.getStatements('resource', id).then((s) => new Item(s))
}

module.exports = Holding
