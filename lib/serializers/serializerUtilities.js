const getBibCallNum = (object, builder, fieldMapper, bib = true) => {
  if (!object) return
  // Callnum
  var callnum = null
  if (object.varField('852', ['h'])) callnum = { value: object.varField('852', ['h'])[0], path: '852 $h' }
  if (!callnum) callnum = { value: object.callNumber, path: 'callNumber' }
  if (callnum && callnum.value && bib) {
    // Pull callnumber suffix from fieldTag v if present
    var callnumSuffix = object.fieldTag('v')
    if (callnumSuffix && callnumSuffix.length) {
      callnum.value += ' ' + callnumSuffix[0]
      callnum.path += ', fieldTag v'
    }
    builder.add(fieldMapper.predicateFor('Call number'), { literal: callnum.value }, 0, { path: callnum.path })
  }

  return callnum
}

module.exports = {
  getBibCallNum
}
