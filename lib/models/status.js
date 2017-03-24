'use strict'

const Base = require('./base')
// const db = require('../db')
// const groupBy = require('../utils').groupBy

class Status extends Base {
}

Status.byId = (id) => {
  return Base.byId(Status, id)
}

Status.byCode = (code) => {
  return Base.byStatement(Status, 'skos:notation', { literal: code })
}

Status.byLabel = (label) => {
  return Base.byStatement(Status, 'skos:prefLabel', { literal: label })
}
module.exports = Status
