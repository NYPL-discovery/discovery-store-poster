const sierraLocationMapping = require('@nypl/nypl-core-objects')('by-sierra-location')
const organizationMapping = require('@nypl/nypl-core-objects')('by-organizations')
const accessMessageMapping = require('@nypl/nypl-core-objects')('by-accessMessages')
const statusMapping = require('@nypl/nypl-core-objects')('by-statuses')
const catalogItemTypeMapping = require('@nypl/nypl-core-objects')('by-catalog-item-types')

const ScsbClient = require('../scsb-client')
const utils = require('../utils')
const Statement = require('../models/statement')
const Creator = require('../models/creator')
const Datasource = require('../models/datasource')
const Lookup = require('../lookup')
const buildFieldMapper = require('../field-mapper')

const log = require('loglevel')

var sourcePrefix = (object) => {
  return object.isPartnerRecord() ? object.nyplSource.substring(6, 7).toLowerCase() : ''
}

var fromElectronicItem = (object, datasource) => {
  if (!datasource) datasource = Datasource.byMarcJsonNyplSource(object.nyplSource)
  if (!datasource) throw new Error('No datasource given')

  return fromMarcJson(object, datasource)
    .then((statements) => {
      var id = `${sourcePrefix(object)}i${object.id}`
      var builder = Statement.builder(id, Creator.CORE_SERIALIZER.id, { id: datasource.id, record_id: object.id })

      // If we're serliazing an extracted electronic item, look for this property:
      if (object.electronicResources) {
        object.electronicResources.forEach((r, ind) => {
          builder.add('bf:electronicLocator', { literal: r.url, label: r.label }, ind)
        })
      }

      return statements.concat(builder.statements)
    })
}

const fromMarcJson = async (object, datasource) => {
  if (!datasource) datasource = Datasource.byMarcJsonNyplSource(object.nyplSource)
  if (!datasource) {
    // If nyplSource is 'test', fail quietly:
    if (object.nyplSource === 'test') return Promise.resolve(null)
    else throw new Error('Unable to parse datasource from nyplSource ' + object.nyplSource)
  }

  try {
    var fieldMapper = buildFieldMapper('item', object.nyplSource)
    var id = object.prefixedId()

    var builder = Statement.builder(id, Creator.CORE_SERIALIZER.id, { id: datasource.id, record_id: object.id })

    builder.add('rdfs:type', { id: 'bf:Item' })

    // Bnumber identifier
    utils.compact(utils.flattenArray(object.bibIds)).forEach((bibId, ind) => {
      builder.add('nypl:bnum', { id: `urn:bnum:${sourcePrefix(object)}b${bibId}` }, ind, { path: 'bibIds' })
    })

    // Item Type
    var itemType = object.getItemType()

    // Save itemType for later:
    var catalogItemType = null

    // If item type set, look it up in db:
    // The default itemtype lookup should just resolve. (i.e. if no itemtype found, don't record one)
    if (itemType) {
      catalogItemType = utils.coreObjectsMappingByCode(catalogItemTypeMapping, String(itemType))
      if (catalogItemType) {
        const catalogItemTypeId = catalogItemType.id.split(':').pop()
        builder.add(fieldMapper.predicateFor('Catalog item type'), { id: `catalogItemType:${catalogItemTypeId}`, label: catalogItemType.label }, 0, { path: 'fixed "Item Type"' })
      }
    }

    // At this point we've established the id and type (and catalog item type,
    // which is essential for the is-research check)
    // If this item is a Branch item or suppressed, let's record that and nothing more
    // We'll need a record of this suppressed item, but no one downstream cares about its data
    const suppressionCheck = object.getSuppressedWithRationale()
    if (suppressionCheck.suppressed || !object.isResearchItem()) {
      // Record reason for suppression:
      var reason = suppressionCheck.suppressed ? suppressionCheck.rationale.join(', ') : 'is branch'
      builder.add(fieldMapper.predicateFor('Suppressed'), { literal: true, type: 'xsd:boolean' }, 0, { path: reason })

      // It's suppressed so return the minimal record we've built so far:
      return Promise.resolve(builder.statements)

      // Not suppressed: Record that and continue building the serialization:
    } else {
      builder.add(fieldMapper.predicateFor('Suppressed'), { literal: false, type: 'xsd:boolean' }, 0)
    }

    var promises = []

    // Item Media-Type & Carrier-Type (overrides bib versions if set)
    var mediaType = null
    var carrierType = null
    if (itemType) {
      if ([6, 26, 27, 28, 34].indexOf(itemType) >= 0) {
        mediaType = 'h'
        switch (itemType) {
          case 6:
            carrierType = 'hd'; break
          case 26:
            carrierType = 'he'; break
          case 27:
          case 28:
            carrierType = 'hd'; break
          case 34:
            carrierType = 'hg'; break
        }
      } else if (itemType === 132) {
        mediaType = 'm'
        carrierType = 'mr'
      }
    }
    if (mediaType) {
      promises.push(Lookup.initialize('lc-mediatypes').then((lookup) => {
        var label = lookup.lookup(mediaType)
        builder.add(fieldMapper.predicateFor('Media type'), { id: `mediatypes:${mediaType}`, label }, 0, {})
      }))
    }
    if (carrierType) {
      promises.push(Lookup.initialize('lc-carriertypes').then((lookup) => {
        var label = lookup.lookup(carrierType)
        builder.add(fieldMapper.predicateFor('Carrier type'), { id: `carriertypes:${carrierType}`, label }, 0, {})
      }))
    }

    var barcode = null
    if (object.barcode) barcode = { value: object.barcode, path: 'barcode' }
    else if (object.varField('876', ['p']).length) barcode = { value: object.varField('876', ['p'])[0], path: '876 $p' }
    if (barcode) builder.add(fieldMapper.predicateFor('Identifier'), { id: barcode.value, type: 'bf:Barcode' }, 0, { path: barcode.path })

    // Callnum
    let callnum
    // First pull it from varfield:
    const shelfMarkMapping = fieldMapper.getMapping('Call number')
    const shelfMarkMarc = shelfMarkMapping.paths[0].marc
    const shelfMarkSubfields = shelfMarkMapping.paths[0].subfields
    if (object.varField(shelfMarkMarc, ['h'])) callnum = { value: object.varField(shelfMarkMarc, shelfMarkSubfields)[0], path: shelfMarkSubfields.map((s) => `$${s}`).join(' ') }
    // If not found in var field
    if (!callnum || !callnum.value) callnum = { value: object.callNumber, path: 'callNumber' }
    // If not yet found, look in 945 $g
    if ((!callnum || !callnum.value) && object.varField('945', ['g']).length > 0) callnum = { value: object.varField('945', ['g'])[0], path: '945 $g' }

    // Sierra seems to put these '|h' prefixes on callnumbers; strip 'em
    if (callnum && callnum.value) callnum.value = callnum.value.replace(/^\|h/, '')

    // If not found in var field
    if (callnum && callnum.value) {
      // Store Physical Location before appending v fieldTag suffix
      builder.add(fieldMapper.predicateFor('Physical Location'), { literal: callnum.value }, 0, { path: '852 $khinz' })

      // Pull callnumber suffix from fieldTag v if present
      var callnumSuffix = object.fieldTag('v')
      if (callnumSuffix && callnumSuffix.length) {
        callnum.value += ' ' + callnumSuffix[0]
        callnum.path += ', fieldTag v'

        // Store this data in a standalone field
        builder.add(fieldMapper.predicateFor('Enumeration Chronology'), { literal: callnumSuffix[0] }, 0, { path: 'fieldTag v' })
      }

      // Finally store the complete shelfMark data
      builder.add(fieldMapper.predicateFor('Call number'), { literal: callnum.value }, 0, { path: callnum.path })
    }

    // Availability
    var status = null
    // Look for a truthy status.code
    if (object.isNyplRecord() && object.status && object.status.code && object.status.code.trim()) {
      status = { path: 'status' }
      if (object.status.code === '-') {
        // Code '-' matches both Available and Loaned (!!!) so, check duedate
        status.id = object.status.duedate ? 'co' : 'a'
      } else {
        status.code = object.status.code
      }
    } else if (object.varField('876', ['j']).length > 0) {
      // Mainly serving recap, mapp string statuses:
      status = { path: '876 $j' }
      var val = object.varField('876', ['j'])[0].toLowerCase()
      switch (val) {
        case 'available': status.id = 'a'; break
        case 'not available': status.id = 'na'; break
        case 'loaned': status.id = 'r'; break
      }
    }
    if (status) {
      // We either know the status id or the status code
      // Find the right entry in our status mapping based on which we identified:
      const statusMapped = status.id ? statusMapping[status.id]
        : utils.coreObjectsMappingByCode(statusMapping, status.code)
      if (statusMapped) {
        const statusId = statusMapped.id.split(':').pop()
        builder.add('bf:status', { id: `status:${statusId}`, label: statusMapped.label.trim() }, 0, { path: status.path })
      } else console.error('could not find status for:', status)
    }

    // Location(s)
    var location = null
    if (object.location) location = { value: object.location.code, path: 'location' }
    else if (object.varField('852', ['b']) && object.varField('852', ['b']).length > 0) location = { value: object.varField('852', ['b'])[0], path: '852 $b' }
    // Valid location?
    if (location && sierraLocationMapping[location.value]) {
      const holdingLocationId = `loc:${location.value}`
      const holdingLocationLabel = sierraLocationMapping[location.value].label
      builder.add(fieldMapper.predicateFor('Holding location'), { id: holdingLocationId, label: holdingLocationLabel }, 0, { path: location.path })
    } else if (location && location.value) {
      // If it's an NYPL item, the extracted location should exist in our sierraLocationMapping, so warn:
      if (object.isNyplRecord()) log.warn('Location id not recognized: ' + location.value)
    }

    // Assign organization ("Content owner")
    if (object.isPartnerRecord()) {
      // If nyplSource is recap-pul, look up owner by code 'PUL'
      var code = object.nyplSource.replace('recap-', '').toUpperCase()
      // Get organization by code (e.g. "PUL", "CUL")
      // which is stored in `code` (skos:notation) in the mapping:
      const org = utils.coreObjectsMappingByCode(organizationMapping, code)
      if (org) {
        const orgId = org.id.split(':').pop()
        builder.add(fieldMapper.predicateFor('Content owner'), { id: `orgs:${orgId}`, label: org.label }, 0, { path: 'nyplSource' })
      }
    } else if (location && location.value) {
      // Look up org by location
      promises.push(
        // This helpfully maps to id, not code:
        Lookup.initialize('location-code-to-org-id').then((lookup) => {
          const orgId = lookup.lookup(location.value)
          if (organizationMapping[orgId]) {
            const orgLabel = organizationMapping[orgId].label
            builder.add(fieldMapper.predicateFor('Content owner'), { id: `orgs:${orgId}`, label: orgLabel }, 0, { path: 'location' })
          }
        })
      )
    }

    // Access code can be derived from one of two places depending on source:
    var accessMessage = { code: null, path: null }

    if (object.isPartnerRecord()) {
      /* Apply partner mapping:
       * Possible values:
       *   [blank] => 'nyplAccessMessage:-'
       *   In Library Use => 'nyplAccessMessage:1'
       *   Supervised Use => 'nyplAccessMessage:u'
       */
      var message = object.varField('876', ['h'])
      if (message && message.length > 0) {
        message = message.pop()

        // If 876 $h is 'IN LIBRARY USE' or [blank]:
        if (message.toLowerCase() === 'in library use' || message.toLowerCase() === '') {
          accessMessage.code = '1'
          accessMessage.path = '876 $h'

          // If 876 $h is SUPERVISED USE:
        } else if (message.toLowerCase() === 'supervised use') {
          accessMessage.code = 'u'
          accessMessage.path = '876 $h'

          // If 876 $h is set to anything else, try using fixed "OPAC Message"
        } else if (object.fixed('OPAC Message')) {
          accessMessage.code = object.fixed('OPAC Message')
          accessMessage.path = 'fixed "OPAC Message"'
        }
      }

      // If we didn't find the partner access message in 876 $h, default to In Library Use:
      if (!accessMessage.code) {
        accessMessage.code = '1'
      }

      // Otherwise it's ours; look for OPAC Message:
    } else if (object.fixed('OPAC Message')) {
      accessMessage.code = object.fixed('OPAC Message')
      accessMessage.path = 'fixed "OPAC Message"'
    }

    let accessMessageRequestable = null
    if (accessMessage.code) {
      // Look up code in accessmessages to make sure it's valid:
      const mapping = utils.coreObjectsMappingByCode(accessMessageMapping, accessMessage.code)
      if (mapping) {
        const accessmessageId = mapping.id.split(':').pop()
        builder.add(fieldMapper.predicateFor('Access message'), { id: `accessMessage:${accessmessageId}`, label: mapping.label }, 0, { path: accessMessage.path })

        // Save the mapped `requestable` property for later `requestable` computation:
        accessMessageRequestable = mapping.requestable
      } else log.error('unmapped opac message? ' + accessMessage.code)
    }
    // Add recap customer code
    let customerCode = null
    if (object.isNyplRecord()) {
      const client = await ScsbClient.instance()
      const barcode = object.varField('876', ['p'])
      const __start = new Date()
      const response = await client.search({ fieldValue: barcode, fieldName: 'Barcode' })
      const elapsed = ((new Date()) - __start)
      log.debug({ message: `HTC searchByParam API took ${elapsed}ms`, metric: 'searchByParam-barcode', timeMs: elapsed })
      if (response && response.searchResultRows && response.searchResultRows.length) {
        const results = response.searchResultRows
        if (results && (results.length > 0) && results[0].searchItemResultRows.length > 0) {
          log.debug(`${barcode} is a serial item`)
          customerCode = results[0].searchItemResultRows[0].customerCode
        } else {
          log.debug(`${barcode} is a not a serial item`)
          customerCode = results[0].customerCode
        }
      }
    } else {
      customerCode = object.varField('900', ['b'])
    }
    if (customerCode) {
      builder.add('nypl:recapCustomerCode', { literal: customerCode }, 0, { path: '900 $b' })
    }

    // Await all resolution promises:
    return Promise.all(promises).then(() => {
      // Determine requestability

      if (object.electronicResources) return builder.statements

      // Does item status permit checkout?
      var itemAvailable = builder.get(fieldMapper.predicateFor('Availability')) ? builder.get(fieldMapper.predicateFor('Availability')).object_id === 'status:a' : true

      // Build a hash storing the properties checked to compute `requestable`:
      var requestableRationale = { status: itemAvailable }

      // If item is an NYPL item check a few additional things:
      if (object.isNyplRecord()) {
        // Does item holding location permit request?
        let locationRequestable = false
        if (builder.get(fieldMapper.predicateFor('Holding location'))) {
          // Get holding location id (minus namespace):
          const holdingLocationId = builder.get(fieldMapper.predicateFor('Holding location')).object_id.split(':').pop()
          locationRequestable = sierraLocationMapping[holdingLocationId] ? sierraLocationMapping[holdingLocationId].requestable : false
        }
        requestableRationale.loc = locationRequestable

        // If OPAC Message set, make sure it permits use
        // If it's null or true, the access message permits requests:
        requestableRationale.opac = accessMessageRequestable !== false

        // Does item type permit checkout?
        var itemTypeRequestable = !catalogItemType || catalogItemType.requestable
        requestableRationale.type = itemTypeRequestable
      }

      // Item is requestable if all conditions are true:
      var requestable = Object.keys(requestableRationale).reduce((requestable, condition) => requestable && requestableRationale[condition], true)

      // Build `path` based on requestable rationale (so we know what was checked):
      var path = Object.keys(requestableRationale).map((prop) => {
        return `${requestableRationale[prop] ? '✓' : '×'} ${prop}`
      }).join('; ')
      log.debug('Requestability computation for ' + object.id + ': ' + (requestable ? '✓' : '×') + ': path: ' + path)

      // Save computed `requestable` boolean
      builder.add(fieldMapper.predicateFor('Requestable'), { literal: requestable, type: 'xsd:boolean' }, 0, { path })

      return builder.statements
    })
  } catch (e) {
    return Promise.reject(e)
  }
}

module.exports = { fromElectronicItem, fromMarcJson }
