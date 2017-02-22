const utils = require('../utils')
const Statement = require('../models/statement')
const Creator = require('../models/creator')
const Datasource = require('../models/datasource')
const Lookup = require('../lookup')
const FieldMapping = require('../field-mapping').FieldMapping
const Status = require('../models/status')
const Location = require('../models/location')
const Organization = require('../models/organization')
const AccessMessage = require('../models/accessmessage')
const CatalogItemType = require('../models/catalogitemtype')

// const MarcMapping = require('../field-mapping').MarcMapping
//
const log = require('loglevel')

var sourcePrefix = (object) => {
  return object.nyplSource && object.nyplSource.match(/recap-[PC]/) ? object.nyplSource.substring(6, 7).toLowerCase() : ''
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
          // console.log('adding url: ', r)
          builder.add('nypl:electronicLocator', { literal: r.url, label: r.label }, ind)
        })
      }

      return statements.concat(builder.statements)
    })
}

var fromMarcJson = (object, datasource) => {
  if (!datasource) datasource = Datasource.byMarcJsonNyplSource(object.nyplSource)
  if (!datasource) throw new Error('No datasource given')

  try {
    return FieldMapping.initialize('resources').then((fieldMapper) => {
      // var id = `${sourcePrefix(object)}i${object.id}`
      var id = object.prefixedId()

      var builder = Statement.builder(id, Creator.CORE_SERIALIZER.id, { id: datasource.id, record_id: object.id })

      builder.add('rdf:type', { id: 'bf:Item' })

      // Bnumber identifier
      utils.compact(utils.flattenArray(object.bibIds)).forEach((bibId, ind) => {
        builder.add('nypl:bnum', { id: `urn:bnum:${sourcePrefix(object)}b${bibId}` }, ind, { path: 'bibIds' })
      })

      var promises = []

      // Item Type
      var itemType = (object.fixed('Item Type'))

      // Save itemType for later:
      var catalogItemType = null

      // If item type set, look it up in db:
      // The default itemtype lookup should just resolve. (i.e. if no itemtype found, don't record one)
      var lookupItemType = null
      if (itemType) {
        lookupItemType = CatalogItemType.byCode(itemType).then((itemType) => {
          builder.add(fieldMapper.predicateFor('Catalog item type'), { id: `catalogItemType:${itemType.id}`, label: itemType.label() }, 0, { path: 'fixed "Item Type"' })
          catalogItemType = itemType
        })
      }

      // Determine if it's a research/branch item type
      var isResearchItem = (/^\d+$/.test(itemType) && parseInt(itemType) <= 100) ||
        /recap-[PC]UL$/.test(object.nyplSource) ||
        object.electronicResources

      // If it's a research item, add itemtype statements and keep serializing
      if (isResearchItem) {
        if (lookupItemType) promises.push(lookupItemType)
      } else {
        // Otherwise it's a branch item: After looking up itemtype, only return statements gathered up to this point
        if (lookupItemType) return lookupItemType.then(() => Promise.resolve(builder.statements))
        else return Promise.resolve(builder.statements)
      }

      var barcode = null
      if (object.barcode) barcode = { value: object.barcode, path: 'barcode' }
      else if (object.varField('876', ['p']).length) barcode = { value: object.varField('876', ['p'])[0], path: '876 $p' }
      if (barcode) builder.add(fieldMapper.predicateFor('Identifier'), { id: `urn:barcode:${barcode.value}` }, 0, { path: barcode.path })

      // Callnum
      var callnum = null
      if (object.varField('852', ['h'])) callnum = { value: object.varField('852', ['h'])[0], path: '852 $h' }
      if (!callnum) callnum = { value: object.callNumber, path: 'callNumber' }
      if (callnum && callnum.value) {
        // Pull callnumber suffix from fieldTag v if present
        var callnumSuffix = object.fieldTag('v')
        if (callnumSuffix && callnumSuffix.length) {
          callnum.value += ' ' + callnumSuffix[0]
          callnum.path += ', fieldTag v'
        }
        builder.add(fieldMapper.predicateFor('Call number'), { literal: callnum.value }, { path: callnum.path })
      }

      // Availability
      var status = null
      // Look for a truthy status.code
      if (object.status && object.status.code && object.status.code.trim()) {
        status = { path: 'status' }
        if (object.status.code === '-') {
          // Code '-' matches both Available and Loaned (!!!) so, check dueDate
          status.id = object.status.dueDate ? 'co' : 'a'
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
        // { cod'skos:notation.objectLiteral':
        // promises.push(db.statuses.findOne(statusMatch).then((status) => {
        var promise = (status.id ? Status.byId(status.id) : Status.byCode(status.code).then((s) => s[0]))
          .then((s) => {
            if (s) builder.add('bf:status', { id: `status:${s.id}`, label: s.literal('skos:prefLabel') }, 0, { path: status.path })
            else console.error('could not find status for code:', status)
          })
        promises.push(promise)
      }

      // Save holdingLocation for later:
      var holdingLocation = false

      // Location(s)
      var location = null
      if (object.location) location = { value: object.location.code, path: 'location' }
      else if (object.varField('852', ['b'])) location = { value: object.varField('852', ['b'])[0], path: '852 $b' }
      if (location) {
        promises.push(
          Location.byId(location.value).then((rec) => {
            if (rec) {
              builder.add(fieldMapper.predicateFor('Holding location'), { id: `loc:${rec.id}`, label: rec.label() }, 0, { path: location.path })

              // Save requestability of holding location for final item requestability calculation
              holdingLocation = rec

              // Now that we have location code, we can set `Suppressed`
              // Suppress item if it's marked so OR location code ends in 9
              var suppressed = object.suppressed || /9$/.test(rec.id)
              builder.add(fieldMapper.predicateFor('Suppressed'), { literal: suppressed, type: 'xsd:boolean' }, 0, { path: 'suppressed && location.code' })

              return rec.deliveryLocations().then((locations) => {
                // console.log('delivery locations: ', JSON.stringify(locations, null, 2))
                locations.forEach((delLocation, ind) => {
                  builder.add(fieldMapper.predicateFor('Delivery location'), { id: `loc:${delLocation.id}`, label: delLocation.label() }, ind, { path: location.path })
                })
              })
            } else log.warn('Could not find location for ' + object.id + ': ' + location.value)
          }).catch((e) => log.warn('Could not find location for ' + object.id + ': ' + location.value))
        )
      } else log.warn('No location? ' + object.id)

      if (object.nyplSource && object.nyplSource.match(/recap-[PC]/)) {
        var code = object.nyplSource.replace('recap-', '')
        // console.log('got recap item: ', object.nyplSource, code)
        promises.push(
          Organization.byCode(code).then((org) => {
            // db.organizations.findOne({ 'skos:notation.objectLiteral': code }).then((org) => {
            if (org) {
              builder.add(fieldMapper.predicateFor('Content owner'), { id: `orgs:${org.id}`, label: org.label() }, 0, { path: 'nyplSource' })
            } else {
              log.error('could not find org: ', code)
            }
          })
        )
      } else if (location && location.value) {
        // Look up org by location
        promises.push(
          Lookup.initialize('location-code-to-org-id').then((lookup) => {
            var orgId = lookup.lookup(location.value)
            return Organization.byId(orgId).then((org) => {
              if (org) {
                builder.add(fieldMapper.predicateFor('Content owner'), { id: `orgs:${org.id}`, label: org.label() }, 0)
              } else {
                log.warn('Could not find org by location', location)
              }
            })
          })
        )
      }

      var accessCode = object.fixed('OPAC Message')
      // OPAC Message "-" seems meaningless..
      if (accessCode && accessCode !== '-') {
        promises.push(
          AccessMessage.byCode(object.fixed('OPAC Message'))
            .then((message) => {
              if (message) builder.add(fieldMapper.predicateFor('Access message'), { id: `accessMessage:${message.id}`, label: message.label() })
              else log.error('unmapped opac message? ' + object.fixed('OPAC Message'))
            })
        )
      }

      // Await all resolution promises:
      return Promise.all(promises).then(() => {
        // Determine requestability

        if (object.electronicResources) return builder.statements

        // Does item holding location permit request?
        var locationRequestable = holdingLocation ? holdingLocation.literal('nypl:requestable') : false

        // Does item status permit checkout?
        var itemAvailable = builder.get(fieldMapper.predicateFor('Availability')) ? builder.get(fieldMapper.predicateFor('Availability')).object_id === 'status:a' : true

        // If OPAC Message set, make sure it permits use:
        var accessMessage = builder.get('nypl:accessMessage') ? builder.get('nypl:accessMessage').object_id : null
        var accessMessagePermits = accessMessage === null || ['accessMessage:1', 'accessMessage:2', 'accessMessage:o'].indexOf(accessMessage) >= 0

        // Does item type permit checkout?
        var itemTypeRequestable = catalogItemType === null || catalogItemType.literal('nypl:requestable')

        var rationale = { loc: locationRequestable, type: itemTypeRequestable, opac: accessMessagePermits, status: itemAvailable }
        var path = Object.keys(rationale).map((prop) => {
          return `${rationale[prop] ? '✅' : '❌'} ${prop}`
        }).join('; ')

        // Item is requestable if all conditions are true:
        var requestable = Object.keys(rationale).reduce((requestable, condition) => requestable && rationale[condition], true)
        // console.log(object.id + ': ' + (requestable ? '✅' : '❌') + ': path: ' + path + '( ' + JSON.stringify(holdingLocation.id, null, 2) + ')')

        builder.add(fieldMapper.predicateFor('Requestable'), { literal: requestable, type: 'xsd:boolean' }, 0, { path })

        return builder.statements
      })
    })
  } catch (e) {
    return Promise.reject(e)
  }
}

module.exports = { fromElectronicItem, fromMarcJson }
