'use strict'

const Base = require('./base')

class Datasource extends Base {}

Datasource.SIERRA_NYPL = { id: 10004 }
Datasource.RECAP_PUL = { id: 10011 }
Datasource.RECAP_CUL = { id: 10012 }
Datasource.RECAP_HL = { id: 10013 }

/**
 *  For a given nyplSource value (e.g. "sierra-nypl", "recap-pul")
 *  returns an object with an id representing the data source for the record.
 */
Datasource.byMarcJsonNyplSource = (source) => {
  const capsName = source.toUpperCase().replace(/-/, '_')

  return Datasource[capsName]
}

Datasource.byId = (id, opts) => {
  return Datasource.byId(Datasource, id)
}

Datasource.byLabel = (label) => {
  return Base.byStatement(Datasource, 'skos:prefLabel', { literal: label }, { returnFirst: true })
}

module.exports = Datasource
