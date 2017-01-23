'use strict'

const Base = require('./base')

class Datasource extends Base {}

Datasource.ORIGINAL_RESEARCH = { id: 10020 }
Datasource.SIERRA_NYPL = { id: 10004 }
Datasource.RECAP_NYPL = { id: 10010 }
Datasource.RECAP_PUL = { id: 10011 }
Datasource.RECAP_CUL = { id: 10012 }
Datasource.SHADOWCAT = { id: 10000 }

Datasource.byMarcJsonNyplSource = (source) => {
  switch (source) {
    case 'recap-NYPL':
      return Datasource.RECAP_NYPL
    case 'recap-PUL':
      return Datasource.RECAP_PUL
    case 'recap-CUL':
      return Datasource.RECAP_CUL
    case 'sierra-nypl':
      return Datasource.SIERRA_NYPL
  }
}

Datasource.byId = (id, opts) => {
  return Datasource.byId(Datasource, id)
}

Datasource.byLabel = (label) => {
  return Base.byStatement(Datasource, 'skos:prefLabel', { literal: label }, { returnFirst: true })
}

module.exports = Datasource
