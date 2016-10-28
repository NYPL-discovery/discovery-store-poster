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

class MarcMapping extends FieldMapping {
  allMappings () {
    var prev = null
    this.data.forEach((d) => {
      if (!d[0]) d[0] = prev[0]
      if (!d[1]) d[1] = prev[1]
      prev = d
    })
    return this.data.map((row) => {
      var name = row[0]
      var predicate = row[1]
      var marc = row[5].replace(/:/, '').replace(/(\s\$\w+)+/, '').split(/\s*,?\s/).filter((code) => code.match(/\d+$/))
      var subfield = row[5].match(/\$\w/g)
      if (subfield) subfield = subfield.map((c) => c.replace('$', ''))
      var description = row[7]

      return { name, predicate, marc, subfield, description }
    }).filter((row) => row.marc.length > 0)
  }

  hasMapping (marc, subfield) {
    return this.allMappings().filter((m) => m.marc.indexOf(marc) >= 0 && m.subfield.indexOf(subfield) >= 0)
  }
}

MarcMapping.initialize = (type) => {
  var path = './data/field-mapping-marc.csv'
  return readCsv(path).then((rows) => new MarcMapping(rows))
}

module.exports = { FieldMapping, MarcMapping }
