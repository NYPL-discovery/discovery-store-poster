'use strict'

const Base = require('./base')
const db = require('../db')

class Location extends Base {
}

Location.byId = (id) => {
  return db.getStatements('location', id).then((s) => new Location(s))
}

module.exports = Location
