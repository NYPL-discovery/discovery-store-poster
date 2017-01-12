'use strict'

const Base = require('./base')

class CatalogItemType extends Base {}

CatalogItemType.byId = (id) => {
  return Base.byId(CatalogItemType, id)
}

CatalogItemType.byCode = (code) => {
  return Base.byStatement(CatalogItemType, 'skos:notation', { literal: code }, { returnFirst: true })
}

module.exports = CatalogItemType
