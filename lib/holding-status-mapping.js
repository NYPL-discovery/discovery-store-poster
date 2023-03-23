const statuses = require('@nypl/nypl-core-objects')('by-statuses')

const statusEntity = (id) => {
  return {
    id: `status:${id}`,
    label: statuses[id].label
  }
}

const notAvailable = statusEntity('na')
const available = statusEntity('a')
const bindery = statusEntity('i')

module.exports = {
  A: available,
  B: notAvailable,
  E: notAvailable,
  L: notAvailable,
  M: statusEntity('m'),
  N: notAvailable,
  O: notAvailable,
  P: available,
  R: statusEntity('w'),
  S: bindery,
  T: bindery,
  U: notAvailable
}
