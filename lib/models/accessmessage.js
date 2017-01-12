'use strict'

const Base = require('./base')

class AccessMessage extends Base {}

AccessMessage.byId = (id) => {
  return Base.byId(AccessMessage, id)
}

AccessMessage.byCode = (code) => {
  return Base.byStatement(AccessMessage, 'skos:notation', { literal: code }, { returnFirst: true })
}

module.exports = AccessMessage
