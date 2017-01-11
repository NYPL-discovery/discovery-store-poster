'use strict'

const Base = require('./base')
const db = require('../db')
const groupBy = require('../utils').groupBy

class Organization extends Base {
}

Organization.byId = (id) => {
  return db.getStatements('organization', id).then((s) => new Organization(s))
}

Organization.byCode = (code, returnFirst) => {
  returnFirst = (typeof returnFirst) === 'undefined' ? true : returnFirst

  return db.getStatementsFor('organization', 'skos:notation', { literal: code })
    .then((s) => groupBy(s, 'subject_id').map((s) => new Organization(s)))
    .then((statuses) => returnFirst ? statuses[0] : statuses)
}

module.exports = Organization
