'use strict'

const Base = require('./base')
const db = require('../db')
const groupBy = require('../utils').groupBy

class Status extends Base {
}

Status.byId = (id) => {
  return db.getStatements('status', id).then((s) => new Status(s))
}

Status.byCode = (code) => {
  return db.getStatementsFor('status', 'skos:notation', { literal: code })
    .then((s) => groupBy(s, 'subject_id').map((s) => new Status(s)))
}

Status.byLabel = (label) => {
  return db.getStatementsFor('status', 'skos:prefLabel', { literal: label })
    .then((s) => groupBy(s, 'subject_id').map((s) => new Status(s)))
}
module.exports = Status
