'use strict'

const Base = require('./base')
// const db = require('../db')
// const groupBy = require('../utils').groupBy

class Organization extends Base {
}

Organization.byId = (id) => {
  return Base.byId(Organization, id)
  // return db.getStatements('organization', id).then((s) => new Organization(s))
}

Organization.byCode = (code, returnFirst) => {
  returnFirst = (typeof returnFirst) === 'undefined' ? true : returnFirst

  return Base.byStatement(Organization, 'skos:notation', { literal: code })
    .then((orgs) => returnFirst ? orgs[0] : orgs)

  /* return db.getStatementsFor('organization', 'skos:notation', { literal: code })
    .then((s) => groupBy(s, 'subject_id').map((s) => new Organization(s)))
  */
}

module.exports = Organization
