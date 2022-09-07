/**
 * getBibCallNum
 * extracts the call number and call number path from a bib
 * @param {Object} object (an object representing a bib)
 * @returns {{ value: string, path: string}}
 */

const getBibCallNum = (object) => {
  if (!object) return
  // Callnum
  var callnum = null
  if (object.varField('852', ['h'])) callnum = { value: object.varField('852', ['h'])[0], path: '852 $h' }
  if (!callnum) callnum = { value: object.callNumber, path: 'callNumber' }

  return callnum
}

module.exports = {
  getBibCallNum
}
