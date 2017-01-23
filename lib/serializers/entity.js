// class EntitySerializer extends PcdmSerializer {

const flattenArray = require('../utils').flattenArray
const Statement = require('../models/statement')
const Datasource = require('../models/datasource')
const Creator = require('../models/creator')

var fromJson = (object) => {
  try {
    var id = object['@id'].split(':')[1]

    var builder = Statement.builder(id, Creator.CORE_SERIALIZER.id, { id: Datasource.ORIGINAL_RESEARCH.id, record_id: id })

    builder.add('rdf:type', { id: object['@type'] }, 0)

    Object.keys(object).filter((key) => !key.match(/^@/)).forEach((pred) => {
      var vals = flattenArray([object[pred]])
      vals.forEach((val, ind) => {
        var type = null
        if (val['@type']) type = val['@type'].toLowerCase()

        if (val['@id']) {
          builder.add(pred, { id: val['@id'], type }, ind)
        } else {
          if (val['@value']) val = val['@value']
          if (type === 'xsd:boolean') val = ['y', 'true'].indexOf(val) >= 0

          builder.add(pred, { literal: val, type }, ind)
        }
      })
    })

    return Promise.resolve(builder.statements)
  } catch (e) {
    return Promise.reject(e)
  }
}

module.exports = { fromJson }
