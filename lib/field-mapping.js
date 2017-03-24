'use strict'

var _cache = {}

class JsonFieldMapping {

  constructor (data) {
    this.data = data
  }

  specFor (field) {
    var rows = this.data.filter((row) => row.name.trim() === field.trim())
    if (rows.length === 0 || rows.length > 1) console.error('Error finding spec for ' + field, rows)
    if (rows.length === 0) return null
    if (rows.length > 1) return null
    return rows[0]
  }

  predicateFor (field) {
    var spec = this.specFor(field)
    // console.log(`pred for: ${field}: ${row}`)
    return spec.predicate
  }
}

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
  var path = '../data/field-mapping-' + type + '.json'
  return Promise.resolve(new JsonFieldMapping(require(path)))
}

class MarcMapping extends FieldMapping {
  allMappings (source) {
    var prev = null
    this.data.forEach((d) => {
      if (prev && !d.name) d.name = prev.name
      if (prev && !d.predicate) d.predicate = prev.predicate
      prev = d
    })

    var parseMarcs = (marcs, descriptions) => {
      descriptions = descriptions ? descriptions.split(/\n/) : []

      return marcs.split(/\n/).map((m, i) => {
        var marc = m.replace(/:/, '').replace(/(\s\$\w+)+/, '') // .split(/\s*,?\s/).filter((code) => code.match(/\d+$/))
        var subfields = m.match(/\$\w/g)
        if (subfields) subfields = subfields.map((c) => c.replace('$', ''))

        // Set description to field to the corresponding line in the description col (if description is given one-per-line)
        var description = descriptions.length === marc.length ? descriptions[i] : descriptions[0]

        return { marc, subfields, description }
      })
    }

    return this.data.map((row) => {
      var name = row.name
      var predicate = row.predicate

      // marc vals given in col 3 (bib) or col 4 (item)
      var marcs = row.bib_path || row.item_path
      // If it's a recap item and there's a recap-specific mapping, use that
      if (source !== 'nypl-sierra' && row.recap_path) marcs = row.recap_path

      // If it's a recap item and there's a recap-specific mapping, use that
      marcs = parseMarcs(marcs, row.marc_field_name)

      return { name, predicate, marcs }
    }).filter((row) => row.marcs.length > 0)
  }
}

MarcMapping.initialize = (type) => {
  if (_cache[type]) return Promise.resolve(_cache[type])

  var path = '../data/field-mapping-marc.json'
  _cache[type] = new MarcMapping(require(path))

  return Promise.resolve(_cache[type])
}

module.exports = { FieldMapping, MarcMapping }
