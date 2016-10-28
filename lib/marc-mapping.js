'use strict'

const readCsv = require('./utils').readCsv

class FieldMapping {

  constructor (data) {
    this.data = data
  }

  /* map_DEP (field, value) {
    // console.log('mapping', field, this.data)
    var rows = this.data.filter((row) => row[0] === field)
    if (rows.length === 0) return null
    if (rows.length > 1) return null

    var row = rows[0]
    var predicate = row[1]
    var range = row[5]

    var object = {}
    if (range.match(/^(array of )?xsd:/)) object.objectLiteral = value
    else object.objectUri = value
    console.log('row for ', field, range, row)

    return { predicate, object }
  }
  */

  specFor (field) {
    var rows = this.data.filter((row) => row[0] === field)
    if (rows.length === 0) return null
    if (rows.length > 1) return null
    return {
      predicate: rows[0][1],
      range: rows[0][5]
    }
  }

  predicateFor (field) {
    var spec = this.specFor(field)
    // console.log(`pred for: ${field}: ${row}`)
    return spec.predicate
  }
}

FieldMapping.initialize = (type) => {
  var path = './data/field-mapping-' + type + '.csv'
  return readCsv(path).then((rows) => new FieldMapping(rows))
}

module.exports = { FieldMapping }
