'use strict'

const Base = require('./base')
const db = require('../db')

class Bib extends Base {
}

Bib.byId = (id) => {
  return db.getStatements('resource', id).then((s) => new Bib(s))
}

module.exports = Bib
