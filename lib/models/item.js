'use strict'

const Base = require('./base')
const db = require('../db')

class Item extends Base {
}

Item.byId = (id) => {
  return db.getStatements('resource', id).then((s) => new Item(s))
}

module.exports = Item
