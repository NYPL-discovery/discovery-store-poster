const sierraLocationMapping = require('@nypl/nypl-core-objects')('by-sierra-location')

const utils = require('../utils')
const Statement = require('../models/statement')
const Creator = require('../models/creator')
const buildFieldMapper = require('../field-mapper')

const log = require('loglevel')

const fromMarcJson = (object) => {
  try {
    const fieldMapper = buildFieldMapper('holding', null)

    const builder = Statement.builder(id, Creator.CORE_SERIALIZER.id, { record_id: object.id })

    builder.add('rdfs:type', { id: 'nypl:Holding' })

    // Bnumber identifier
    utils.compact(utils.flattenArray(object.bibIds)).forEach((bibId, ind) => {
      builder.add('nypl:bnum', { id: `urn:bnum:b${bibId}` }, ind, { path: 'bibIds' })
    })

    // At this point we've established the id and type
    // If this item is a Branch item or suppressed, let's record that and nothing more
    // We'll need a record of this suppressed item, but no one downstream cares about its data
    let suppressionCheck = object.getSuppressedWithRationale()
    if (suppressionCheck.suppressed) {
      // Record reason for suppression:
      var reason = suppressionCheck.rationale.join(', ')
      builder.add(fieldMapper.predicateFor('Suppressed'), { literal: true, type: 'xsd:boolean' }, 0, { path: reason })

      // It's suppressed so return the minimal record we've built so far:
      return Promise.resolve(builder.statements)

    // Not suppressed: Record that and continue building the serialization:
    } else {
      builder.add(fieldMapper.predicateFor('Suppressed'), { literal: false, type: 'xsd:boolean' }, 0)
    }

    // Call Number, Physical Location and Chronology/Enumeration
    // These fields all center on the 852 field and are used to display similar information in different ways
    // So first extract all the relevant data (from whatever fields are present)
    let hFieldCallNum
    let iFieldCallNumSuffix
    let kFieldCallNumPrefix
    let vFieldCallNumSuffix

    if (object.varField('852', ['h'])) hFieldCallNum = object.varField('852', ['h'])[0]
    if (object.varField('852', ['i'])) iFieldCallNumSuffix = object.varField('852', ['i'])[0]
    if (object.varField('852', ['k'])) kFieldCallNumPrefix = object.varField('852', ['k'])[0]
    if (object.fieldTag('v')) vFieldCallNumSuffix = object.fieldTag('v')

    // Construct Call Number with all available components
    // and Physical Location and Chronology/Enumeration with appropriate components
    const callNum = { value: '', path: '' }
    const physicalLocation = { value: '', path: '' }
    const chronEnum = { value: '', path: '' }

    if (hFieldCallNum) {
      [callNum, physicalLocation].forEach((stmt) => {
        stmt.value += hFieldCallNum
        stmt.path += '852 $h'

        if (kFieldCallNumPrefix) {
          stmt.value = `${kFieldCallNumPrefix} ${stmt.value}`
          stmt.path = `852 $k, ${stmt.path}`
        }
  
        if (iFieldCallNumSuffix) {
          stmt.value = `${stmt.value} ${iFieldCallNumSuffix}`
          stmt.path = `${stmt.path}, 852 $i`
        }
      })

      if (vFieldCallNumSuffix) {
        callNum.value = `${callNum.value} ${vFieldCallNumSuffix}`
        callNum.path = `${callNum.path}, fieldTag v`

        chronEnum.value = vFieldCallNumSuffix
        chronEnum.path = 'fieldTag'

        builder.add(fieldMapper.predicateFor('Enumeration Chronology'), { literal: chronEnum.value }, 0, { path: chronEnum.path })
      }

      // Sierra seems to put these '|h' prefixes on callnumbers; strip 'em
      if (callNum && callNum.value) callNum.value = callNum.value.replace(/^\|h/, '')

      builder.add(fieldMapper.predicateFor('Call Number'), { literal: callNum.value }, 0, { path: callNum.path })
      builder.add(fieldMapper.predicateFor('Physical Location'), { literal: physicalLocation.value }, 0, { path: physicalLocation.path })
    }

    // Location(s)
    let location
    if (object.location) location = { value: object.location.code, path: 'location' }

    // Valid location?
    if (location && sierraLocationMapping[location.value]) {
      let holdingLocationId = `loc:${location.value}`
      let holdingLocationLabel = sierraLocationMapping[location.value].label
      builder.add(fieldMapper.predicateFor('Location'), { id: holdingLocationId, label: holdingLocationLabel }, 0, { path: location.path })
    } else if (location && location.value) {
      log.warn('Location id not recognized: ' + location.value)
    }

    // Holding Statement(s)
    if (object.holdings) {
      object.getHoldingStrings().forEach((h) => {
        builder.add(fieldMapper.predicateFor('Holding Statement'), { literal: h }, 0, { path: 'holdings.holding_statement' })
      })
    }

    // Format
    // Drawn from the 843$a field, or if not found there potentially in the i fieldTag
    if (object.varField('843', ['a'])) {
      builder.add(fieldMapper.predicateFor('Format'), { literal: object.varField('843', ['a'])[0] }, 0, { path: '843 $a' })
    } else if (object.fieldTag('i')) {
      builder.add(fieldMapper.predicateFor('Format'), { literal: object.fieldTag('i') }, 0, { path: 'fieldTag i' })
    }

    // Note
    // Only present in legacy fields
    // Some n fieldTag fields may be 843 Format fields, but will be ignored here as they are improperly formatted
    // to be retrieved via the fieldTag method
    if (object.fieldTag('n')) {
      builder.add(fieldMapper.predicateFor('Note'), { literal: object.fieldTag('n') }, 0, { path: 'fieldTag n' })
    }

    // Check In Boxes
    // This is a blank node that represents a series of fields drawn from check-in card records
    object.checkInCards.forEach((box, index) => {
      // Create coverage string
      let coverage = ''
      // Get any enumeration associated with this box
      if (box.enumeration.enumeration) coverage = box.enumeration.enumeration

      // Add any date values to the coverage str
      let dateStr
      if (box.start_date || box.end_date) {
        if (box.start_date) dateStr = box.start_date
        if (box.end_date) dateStr = `${dateStr} - ${box.end_date}`

        if (coverage.length > 0) coverage = `${coverage} (${dateStr})`
        else coverage = dateStr
      }

      const blankNode = {
        'rdf:type': { id: 'nypl:CheckInBox' },
        'dcterms:coverage': { literal: coverage },
        'bf:status': { literal: box.status.label },
        'bf:count': { literal: box.copy_count },
        'bf:part': { literal: box.box_count } // This supplies the position of the box in the context of the check in card
      }

      builder.addBlankNode(fieldMapper.predicateFor('Check In Box'), blankNode, index, { path: 'checkInCards' })
    })

    return builder.statements
  } catch (e) {
    return Promise.reject(e)
  }
}

module.exports = { fromMarcJson }
