'use strict'

const sierraLocationMapping = require('@nypl/nypl-core-objects')('by-sierra-location')
const catalogItemTypeMapping = require('@nypl/nypl-core-objects')('by-catalog-item-type')
const SierraRecord = require('./sierra-record')

class ItemSierraRecord extends SierraRecord {
  prefixedId () {
    var prefix = ''
    if (this.isPartnerRecord()) {
      prefix = this.nyplSource.substring(6, 7).toLowerCase()
    }
    return `${prefix}i${this.id}`
  }

  getItemType () {
    let type = null

    // parse from fixed:
    let fixedType = this.fixed('Item Type')
    if (/^\d+$/.test(fixedType)) type = parseInt(fixedType)

    // Partner recap items are hard-coded catalogItemType:1, "General Materials"
    if (this.isPartnerRecord()) type = 1

    return type
  }

  isResearchItem () {
    // If object has location, see if location implies items are definitely Research or definitely Branch
    let holdingLocationCollectionType = null
    if (this.location && this.location.code) {
      let mappedLocation = sierraLocationMapping[this.location.code]
      // If collectionType has only one value, that imples item is definitely that type
      if (mappedLocation && Array.isArray(mappedLocation.collectionTypes) && mappedLocation.collectionTypes.length === 1) {
        holdingLocationCollectionType = mappedLocation.collectionTypes[0]
      }
    }

    // If object has item type, does type imply item is Research?
    let itemType = this.getItemType()
    let itemTypeImpliesResearch = false
    if (itemType) {
      // The item's itype implies 'Research' if the itype locationType includes 'Research'
      let locationTypes = catalogItemTypeMapping[itemType].locationType
      itemTypeImpliesResearch = locationTypes && locationTypes.indexOf('Research') >= 0
    }

    /*
     * It's a Research item if:
     *   itemType implies it's 'Research' based on nypl:locationType in https://github.com/NYPL/nypl-core/blob/master/vocabularies/json-ld/catalogItemTypes.json
     *   OR it's a partner record
     *   OR it's an e-resource
     *   OR its holdingLocation collectionType is 'Research'
     */
    let isResearch = itemTypeImpliesResearch ||
      this.isPartnerRecord() ||
      this.electronicResources ||
      holdingLocationCollectionType === 'Research'

    return isResearch
  }

  getSuppressedWithRationale () {
    var suppressed = false
    var rationale = []

    // For recap CUL/PUL, check 876$x or 900$a for 'Private':
    if (this.isPartnerRecord()) {
      var group = this.varField('876', ['x'])
      if (group && group.length > 0 && group[0] === 'Private') {
        suppressed = true
        rationale.push('876 $x')
      }
      group = this.varField('900', ['a'])
      if (group && group.length > 0 && group[0] === 'Private') {
        suppressed = true
        rationale.push('900 $a')
      }

    // For NYPL recap or on-site items:
    } else {
      // First, we'll suppress it if catalogItemType is 50 (temporary item):
      if (this.getItemType() && this.getItemType() === 50) {
        suppressed = true
        rationale.push('catalogItemType')
      }
      // Next, we'll suppress it if fixed "Item Code 2" is 's', 'w', 'd', or 'p'
      if (['s', 'w', 'd', 'p'].indexOf(this.fixed('Item Code 2')) >= 0) {
        suppressed = true
        rationale.push('fixed "Item Code 2"')
      }
    }

    return { suppressed, rationale }
  }
}

ItemSierraRecord.from = (record) => {
  return new ItemSierraRecord(record)
}

module.exports = ItemSierraRecord
