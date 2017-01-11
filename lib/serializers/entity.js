// class EntitySerializer extends PcdmSerializer {

const flattenArray = require('../utils').flattenArray
const Statement = require('../models').Statement
const Datasource = require('../models').Datasource
const Creator = require('../models').Creator

var fromJson = (object) => {
  try {
    var id = object['@id'].split(':')[1]

    var builder = Statement.builder(id, Creator.CORE_SERIALIZER.id, { id: Datasource.ORIGINAL_RESEARCH.id, record_id: id })

    builder.add('rdf:type', { id: object['@type'] }, 0)

    Object.keys(object).filter((key) => !key.match(/^@/)).forEach((pred) => {
      var vals = flattenArray([object[pred]])
      vals.forEach((val, ind) => {
        if (val['@id']) {
          builder.add(pred, { id: val['@id'] }, ind)
        } else {
          builder.add(pred, { literal: val }, ind)
        }
      })
    })

    return Promise.resolve(builder.statements)
  } catch (e) {
    return Promise.reject(e)
  }
}

module.exports = { fromJson }
