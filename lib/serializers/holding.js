const sierraLocationMapping = require('@nypl/nypl-core-objects')('by-sierra-location')

const utils = require('../utils')
const Statement = require('../models/statement')
const Creator = require('../models/creator')
const Datasource = require('../models/datasource')
const buildFieldMapper = require('../field-mapper')
const { parseVolume } = require('../volume-parser')
const holdingStatusMapping = require('../holding-status-mapping')
const dateUtils = require('../date-parse/date-utils')

const log = require('loglevel')

const fromMarcJson = (object) => {
  try {
    const fieldMapper = buildFieldMapper('holding', null)
    const itemFieldMapper = buildFieldMapper('item', null)

    const holdingId = object.prefixedId()

    const datasource = Datasource.byMarcJsonNyplSource('sierra-nypl')

    const builder = Statement.builder(holdingId, Creator.CORE_SERIALIZER.id, { id: datasource.id, record_id: object.id })

    builder.add('rdfs:type', { id: 'nypl:Holding' })

    // Bnumber identifier
    utils.compact(utils.flattenArray(object.bibIds)).forEach((bibId, ind) => {
      builder.add('nypl:bnum', { id: `urn:bnum:b${bibId}` }, ind, { path: 'bibIds' })
    })

    // At this point we've established the id and type
    // If this item is a Branch item or suppressed, let's record that and nothing more
    // We'll need a record of this suppressed item, but no one downstream cares about its data
    const suppressionCheck = object.getSuppressedWithRationale()
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
    const shelfMarkMapping = fieldMapper.getMapping('Call Number')
    const shelfMarkMarc = shelfMarkMapping.paths[0].marc
    const shelfMarkSubfields = shelfMarkMapping.paths[0].subfields

    let callNumFields = object.varField(shelfMarkMarc, shelfMarkSubfields)
    callNumFields.forEach((callNum, index) => {
      const fieldPath = `${shelfMarkMarc} ${shelfMarkSubfields.map((s) => `$${s}`).join(' ')}`

      // Sierra seems to put these '|h' prefixes on callnumbers; strip 'em
      if (callNum) callNum = callNum.replace(/^\|h/, '')

      builder.add(fieldMapper.predicateFor('Call Number'), { literal: callNum }, index, { path: fieldPath })
      builder.add(fieldMapper.predicateFor('Physical Location'), { literal: callNum }, index, { path: '852 $khinz' })
    })

    // Location(s)
    let location
    if (object.location) location = { value: object.location.code, path: 'location' }

    // Valid location?
    if (location && sierraLocationMapping[location.value]) {
      const holdingLocationId = `loc:${location.value}`
      const holdingLocationLabel = sierraLocationMapping[location.value].label
      builder.add(fieldMapper.predicateFor('Location'), { id: holdingLocationId, label: holdingLocationLabel }, 0, { path: location.path })
    } else if (location && location.value) {
      log.warn('Location id not recognized: ' + location.value)
    }

    // Holding Statement(s)
    if (object.holdings) {
      object.getHoldingStrings().forEach((h, index) => {
        builder.add(fieldMapper.predicateFor('Holding Statement'), { literal: h }, index, { path: 'holdings.holding_statement' })
      })
    }

    // Format
    // Drawn from the 843$a field, or if not found there potentially in the i fieldTag
    const formatLiteral = object.varField('843', ['a']).length > 0 ? object.varField('843', ['a'])[0] : object.fieldTag('i') && object.fieldTag('i').length > 0 ? object.fieldTag('i')[0] : null
    if (formatLiteral) {
      builder.add(fieldMapper.predicateFor('Format'), { literal: formatLiteral })
    }

    // Note
    // Only present in legacy fields
    // Some n fieldTag fields may be 843 Format fields, but will be ignored here as they are improperly formatted
    // to be retrieved via the fieldTag method
    if (object.fieldTag('n')) {
      object.fieldTag('n').forEach((note, index) => {
        builder.add(fieldMapper.predicateFor('Note'), { literal: note }, index, { path: 'fieldTag n' })
      })
    }

    // Check In Boxes
    // This is a blank node that represents a series of fields drawn from check-in card records
    // Additionally, loops through checkin-card creating faux item for each checkin-card box.
    let checkInCardItemBuilder
    const checkInCardItemStatements = object.checkInCards.map((box, index) => {
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

      const checkInCardItemId = `i-${holdingId}-${index}`
      checkInCardItemBuilder = Statement.builder(checkInCardItemId, Creator.CORE_SERIALIZER.id, { id: datasource.id, record_id: object.id })

      checkInCardItemBuilder.add('rdfs:type', { id: 'nypl:CheckinCarditem' })
      checkInCardItemBuilder.add(itemFieldMapper.predicateFor('Access message'), { id: 'accessMessage:1', label: 'Use in library' }, index)
      if (formatLiteral) {
        checkInCardItemBuilder.add(itemFieldMapper.predicateFor('Format'), { literal: formatLiteral })
      }
      callNumFields = object.varField(shelfMarkMarc, shelfMarkSubfields)
      callNumFields.forEach((callNum, index) => {
        // Sierra seems to put these '|h' prefixes on callnumbers; strip 'em
        if (callNum) {
          callNum = callNum.replace(/^\|h/, '')

          checkInCardItemBuilder.add(itemFieldMapper.predicateFor('Call number'), { literal: callNum }, index)
        }
      })
      checkInCardItemBuilder.add(itemFieldMapper.predicateFor('Enumeration Chronology'), { literal: coverage })
      if (box.enumeration.enumeration) {
        checkInCardItemBuilder.add(itemFieldMapper.predicateFor('Volume Raw'), { literal: box.enumeration.enumeration })
        const volumeRanges = parseVolume(box.enumeration.enumeration)
        // Does enumeration contain parsable volume ranges?
        if (volumeRanges && volumeRanges.length) {
          volumeRanges.forEach((volumeRange) => {
            checkInCardItemBuilder.add(itemFieldMapper.predicateFor('Volume Range'), { literal: volumeRange })
          })
        }
      }
      if (box.start_date || box.endDate) {
        let dateRange = []
        if (box.start_date) {
          dateRange[0] = dateUtils.parseCheckinCardDate(box.start_date)
        }
        if (box.end_date) {
          dateRange[1] = dateUtils.parseCheckinCardDate(box.end_date)
        }
        if (!dateRange[1]) {
          // For now, if no end-date is specified, just use start-date:
          dateRange[1] = dateRange[0]
        }

        // Remove nulls:
        dateRange = dateRange.filter((d) => d)
        // Insist on two-part range (i.e. no open ended ranges):
        if (dateRange.length === 2) {
          // Ensure bad parsing or data doesn't produce a reversed range:
          dateRange = dateRange.sort((d1, d2) => d1 < d2 ? -1 : 1)
          checkInCardItemBuilder.add(itemFieldMapper.predicateFor('Date Range'), { literal: dateRange })
        }
      }
      checkInCardItemBuilder.add(itemFieldMapper.predicateFor('Availability'), holdingStatusMapping[box.status.code], index)

      return checkInCardItemBuilder.statements
    })
    const state = builder.statements.concat(checkInCardItemStatements.flat())
    return Promise.resolve(state)
  } catch (e) {
    return Promise.reject(e)
  }
}

module.exports = { fromMarcJson }
