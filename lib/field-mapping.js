'use strict'

const readCsv = require('./utils').readCsv

var _cache = {}

class FieldMapping {

  constructor (data) {
    this.data = data
  }

  specFor (field) {
    var rows = this.data.filter((row) => row[0].trim() === field.trim())
    if (rows.length === 0 || rows.length > 1) console.error('Error finding spec for ' + field, rows)
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
  allMappings (source) {
    var prev = null
    this.data.forEach((d) => {
      if (prev && !d[0]) d[0] = prev[0]
      if (prev && !d[1]) d[1] = prev[1]
      prev = d
    })

    var parseMarcs = (marcs, descriptions) => {
      descriptions = descriptions ? descriptions.split(/\n/) : []

      return marcs.split(/\n/).map((m, i) => {
        var marc = m.replace(/:/, '').replace(/(\s\$\w+)+/, '') // .split(/\s*,?\s/).filter((code) => code.match(/\d+$/))
        var subfields = m.match(/\$\w/g)
        if (subfields) subfields = subfields.map((c) => c.replace('$', ''))

        var description = descriptions[i]

        return { marc, subfields, description }
      })
    }

    return this.data.map((row) => {
      var name = row[0]
      var predicate = row[1]

      // marc vals given in col 3 (bib) or col 4 (item)
      var marcs = row[3] || row[4]
      // If it's a recap item and there's a recap-specific mapping, use that
      if (source !== 'nypl-sierra' && row[5]) marcs = row[5]

      // If it's a recap item and there's a recap-specific mapping, use that
      marcs = parseMarcs(marcs, row[7])

      return { name, predicate, marcs }
    }).filter((row) => row.marcs.length > 0)
  }

  /* hasMapping (marc, subfield) {
    return this.allMappings().filter((m) => m.marcs.indexOf(marc) >= 0 && m.subfield.indexOf(subfield) >= 0)
  }
  */
}

MarcMapping.initialize = (type) => {
  if (_cache[type]) return Promise.resolve(_cache[type])

  var path = './data/field-mapping-marc.csv'
  return readCsv(path).then((rows) => {
    var mapping = new MarcMapping(rows)
    _cache[type] = mapping
    return mapping
  })
}

module.exports = { FieldMapping, MarcMapping }
